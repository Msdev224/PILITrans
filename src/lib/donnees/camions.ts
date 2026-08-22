import type { Camion, Chauffeur, Depense, Echeance, Entretien, Reparation, Voyage } from "@prisma/client";

import {
  amortissementMensuel,
  coutParKm,
  margeCamion,
  margeParKm,
  paybackMois,
  recetteParKm,
  remunerationVoyage,
  tauxAVide,
} from "@/lib/calculs";
import { consoMoyenne } from "@/lib/donnees/carburant";
import { prisma } from "@/lib/prisma";
import { dansPeriode, moisCourant, type Periode } from "@/lib/periode";
import { n, nOuNull } from "@/lib/utils";

// ------------------------------------------------------------
//  Rattachement des mouvements à une période
//  Réparations et entretiens n'ont pas toujours de date d'exécution :
//  on retient la date la plus significative disponible.
// ------------------------------------------------------------

const dateReparation = (r: Reparation) => r.immobiliseDu ?? r.createdAt;
const dateEntretien = (e: Entretien) => e.dateFait ?? e.createdAt;

/**
 * Kilomètres réellement parcourus sur un voyage.
 *
 * Le compteur prime quand il est relevé — il englobe déjà toutes les rotations.
 * Sinon on prend la distance prévue, qui vaut pour UNE rotation, multipliée par
 * leur nombre : sans cela, une benne faisant 8 allers-retours de 20 km
 * compterait 20 km et son coût kilométrique serait huit fois trop élevé.
 */
export function kmVoyage(
  v: Pick<Voyage, "kmDepart" | "kmArrivee" | "distanceKm"> & { nbRotations?: number },
): number {
  if (v.kmDepart != null && v.kmArrivee != null && v.kmArrivee > v.kmDepart) {
    return v.kmArrivee - v.kmDepart;
  }
  return (v.distanceKm ?? 0) * Math.max(v.nbRotations ?? 1, 1);
}

type VoyageAvecChauffeur = Voyage & { chauffeur: Chauffeur };

/**
 * Paie du chauffeur pour un voyage. La valeur réellement versée (saisie sur le
 * voyage) prime ; sinon on l'estime depuis le mode de rémunération du chauffeur.
 */
export function remunerationDuVoyage(voyage: VoyageAvecChauffeur): number {
  const versee = nOuNull(voyage.remunerationChauffeur);
  if (versee !== undefined) return versee;

  return remunerationVoyage({
    mode: voyage.chauffeur.modeRemuneration,
    taux: n(voyage.chauffeur.tauxRemuneration),
    recetteGnf: n(voyage.recetteGnf),
    km: kmVoyage(voyage),
  });
}

// ------------------------------------------------------------
//  P&L d'un camion sur une période
// ------------------------------------------------------------

export interface PosteDepense {
  type: string;
  montantGnf: number;
}

export interface PnlCamion {
  camion: Camion;
  periode: Periode;

  // Produits & charges (GNF)
  recetteGnf: number;
  gasoilGnf: number;
  autresDepensesGnf: number;
  reparationsGnf: number;
  entretiensGnf: number;
  remunerationGnf: number;
  /** Amortissement théorique, informatif : jamais déduit des marges. */
  amortissementGnf: number;

  // Résultats — issus de margeCamion(), hors coût d'acquisition
  /** Charges d'exploitation du mois. */
  couts: number;
  /** Recette − charges d'exploitation. C'est LA marge du mois. */
  margeExploitation: number;

  /**
   * Vrai quand des charges existent sans aucune recette sur des missions qui
   * en attendaient une. La marge est alors incomplète, pas négative : afficher
   * une perte ferait douter de chiffres qui n'ont simplement pas été saisis.
   */
  recetteManquante: boolean;

  // Ratios
  km: number;
  kmAVide: number;
  tauxAVidePct: number;
  coutKm: number;
  recetteKm: number;
  margeKm: number;

  // Détail & contexte
  postesDepenses: PosteDepense[];
  nbVoyages: number;
  voyages: VoyageAvecChauffeur[];
}

interface MouvementsCamion {
  voyages: VoyageAvecChauffeur[];
  depenses: Depense[];
  reparations: Reparation[];
  entretiens: Entretien[];
}

/**
 * Calcule le compte de résultat d'un camion. Les marges viennent de
 * `margeCamion()` (cœur métier) — rien n'est recalculé ici.
 */
export function calculerPnl(camion: Camion, mvts: MouvementsCamion, periode: Periode): PnlCamion {
  const voyages = mvts.voyages.filter((v) => dansPeriode(v.dateDepart, periode));
  const depenses = mvts.depenses.filter((d) => dansPeriode(d.date, periode));
  const reparations = mvts.reparations.filter((r) => dansPeriode(dateReparation(r), periode));
  const entretiens = mvts.entretiens.filter((e) => dansPeriode(dateEntretien(e), periode));

  const recetteGnf = voyages.reduce((total, v) => total + n(v.recetteGnf), 0);

  const estGasoil = (d: Depense) => d.type === "GASOIL_TRACTEUR" || d.type === "GASOIL_GROUPE_FROID";
  const gasoilGnf = depenses.filter(estGasoil).reduce((total, d) => total + n(d.montantGnf), 0);
  const autresDepensesGnf = depenses.filter((d) => !estGasoil(d)).reduce((total, d) => total + n(d.montantGnf), 0);

  const reparationsGnf = reparations.reduce((total, r) => total + n(r.coutTotalGnf), 0);
  const entretiensGnf = entretiens.reduce((total, e) => total + n(e.coutGnf), 0);
  const remunerationGnf = voyages.reduce((total, v) => total + remunerationDuVoyage(v), 0);

  const coutAcquisition = nOuNull(camion.coutAcquisition);
  const amortissementGnf =
    coutAcquisition !== undefined ? amortissementMensuel(coutAcquisition, camion.dureeAmortissementMois ?? 60) : 0;

  // `amortissementGnf` n'est volontairement pas transmis : le prix d'achat
  // n'est pas une charge du mois. Il est engagé une fois et suivi séparément
  // par `recuperationCapital()`. L'inclure ici ferait apparaître deux marges
  // différentes pour un même camion selon l'écran consulté.
  const { couts, margeExploitation } = margeCamion({
    recetteGnf,
    gasoilGnf,
    autresDepensesGnf,
    reparationsGnf,
    entretiensGnf,
    remunerationGnf,
  });

  const km = voyages.reduce((total, v) => total + kmVoyage(v), 0);
  const kmAVide = voyages.filter((v) => v.aVide).reduce((total, v) => total + kmVoyage(v), 0);

  // Regroupement des dépenses par type, pour le détail de la fiche camion.
  const parType = new Map<string, number>();
  for (const d of depenses) parType.set(d.type, (parType.get(d.type) ?? 0) + n(d.montantGnf));
  const postesDepenses = [...parType.entries()]
    .map(([type, montantGnf]) => ({ type, montantGnf }))
    .sort((a, b) => b.montantGnf - a.montantGnf);

  return {
    camion,
    periode,
    recetteGnf,
    gasoilGnf,
    autresDepensesGnf,
    reparationsGnf,
    entretiensGnf,
    remunerationGnf,
    amortissementGnf,
    couts,
    margeExploitation,
    // Des missions non à vide, des charges, et pas un franc de recette : c'est
    // une saisie incomplète bien plus souvent qu'une course à perte.
    recetteManquante:
      recetteGnf === 0 && couts > 0 && voyages.some((v) => !v.aVide),
    km,
    kmAVide,
    tauxAVidePct: tauxAVide(kmAVide, km),
    coutKm: coutParKm(couts, km),
    recetteKm: recetteParKm(recetteGnf, km),
    margeKm: margeParKm(margeExploitation, km),
    postesDepenses,
    nbVoyages: voyages.length,
    voyages,
  };
}

// ------------------------------------------------------------
//  Accès base
//  Le parc compte quelques véhicules : on charge les mouvements en une
//  passe et on filtre par période en mémoire (les dates retenues varient
//  d'une entité à l'autre, ce que SQL rendrait illisible ici).
// ------------------------------------------------------------

async function chargerMouvements(camionIds: string[]) {
  const [voyages, depenses, reparations, entretiens] = await Promise.all([
    prisma.voyage.findMany({
      where: { camionId: { in: camionIds }, statut: { not: "ANNULE" } },
      include: { chauffeur: true },
      orderBy: { dateDepart: "desc" },
    }),
    // Une dépense est rattachée au camion directement ou via son voyage.
    prisma.depense.findMany({
      where: { OR: [{ camionId: { in: camionIds } }, { voyage: { camionId: { in: camionIds } } }] },
      include: { voyage: { select: { camionId: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.reparation.findMany({ where: { camionId: { in: camionIds } }, orderBy: { createdAt: "desc" } }),
    prisma.entretien.findMany({ where: { camionId: { in: camionIds } }, orderBy: { createdAt: "desc" } }),
  ]);

  return { voyages, depenses, reparations, entretiens };
}

function regrouper(
  camionId: string,
  tout: Awaited<ReturnType<typeof chargerMouvements>>,
): MouvementsCamion {
  return {
    voyages: tout.voyages.filter((v) => v.camionId === camionId),
    depenses: tout.depenses.filter((d) => (d.camionId ?? d.voyage?.camionId) === camionId),
    reparations: tout.reparations.filter((r) => r.camionId === camionId),
    entretiens: tout.entretiens.filter((e) => e.camionId === camionId),
  };
}

/** P&L de tous les camions actifs, trié par marge d'exploitation décroissante. */
export async function pnlFlotte(periode: Periode): Promise<PnlCamion[]> {
  const camions = await prisma.camion.findMany({ where: { actif: true }, orderBy: { nom: "asc" } });
  if (camions.length === 0) return [];

  const tout = await chargerMouvements(camions.map((c) => c.id));
  return camions.map((c) => calculerPnl(c, regrouper(c.id, tout), periode)).sort((a, b) => b.margeExploitation - a.margeExploitation);
}

/** Au-delà de cet horizon, une projection de remboursement n'est plus crédible. */
const HORIZON_PROJECTION_MOIS = 120;

/**
 * Récupération du capital investi sur un véhicule.
 *
 * L'achat n'est pas une charge du mois : il est engagé une fois, et la marge
 * d'exploitation le rembourse ensuite mois après mois. Le mesurer ainsi répond
 * à la vraie question — « ce camion a-t-il fini de se payer ? » — là où étaler
 * l'achat en amortissement mensuel écrase le résultat d'un véhicule récent et
 * flatte celui d'un véhicule déjà amorti, alors que les deux roulent pareil.
 */
export interface RecuperationCapital {
  coutAcquisition: number | null;
  /** Marge d'exploitation cumulée depuis le mois d'acquisition. */
  cumuleGnf: number;
  /** Ce qu'il reste à récupérer. 0 une fois l'investissement remboursé. */
  resteGnf: number;
  /** Part déjà remboursée, en %. */
  avancementPct: number;
  /** Mois écoulés depuis l'acquisition. */
  moisEcoules: number;
  /**
   * Mois réellement documentés (au moins un mouvement enregistré).
   * Sert de base à la moyenne : les mois antérieurs à la mise en service de
   * l'application n'ont aucune donnée et tireraient la moyenne vers zéro,
   * produisant des projections de remboursement absurdes.
   */
  moisRenseignes: number;
  /** Marge d'exploitation moyenne par mois documenté. */
  moyenneMensuelleGnf: number;
  /**
   * Mois restants au rythme observé. `null` si le rythme ne rembourse pas, ou
   * si l'échéance dépasse un horizon crédible — mieux vaut ne rien annoncer
   * qu'une date à laquelle personne ne peut se fier.
   */
  moisRestants: number | null;
  /** Vrai quand la projection dépasse l'horizon retenu. */
  horizonDepasse: boolean;
  /** Date prévisionnelle de remboursement complet. */
  dateRemboursement: Date | null;
  rembourse: boolean;
}

export async function recuperationCapital(
  camionId: string,
  aujourdhui: Date = new Date(),
): Promise<RecuperationCapital> {
  const camion = await prisma.camion.findUnique({ where: { id: camionId } });
  const coutAcquisition = camion ? (nOuNull(camion.coutAcquisition) ?? null) : null;

  const vide: RecuperationCapital = {
    coutAcquisition,
    cumuleGnf: 0,
    resteGnf: coutAcquisition ?? 0,
    avancementPct: 0,
    moisEcoules: 0,
    moisRenseignes: 0,
    moyenneMensuelleGnf: 0,
    moisRestants: null,
    dateRemboursement: null,
    rembourse: false,
    horizonDepasse: false,
  };
  if (!camion || coutAcquisition === null || !camion.dateAcquisition) return vide;

  const moisEcoules =
    (aujourdhui.getFullYear() - camion.dateAcquisition.getFullYear()) * 12 +
    (aujourdhui.getMonth() - camion.dateAcquisition.getMonth()) +
    1;
  if (moisEcoules <= 0) return vide;

  // On rejoue chaque mois depuis l'acquisition avec les mêmes règles que le
  // P&L courant : le cumul reste cohérent avec ce qu'affiche la fiche.
  const tout = await chargerMouvements([camion.id]);
  const mvts = regrouper(camion.id, tout);

  let cumuleGnf = 0;
  let moisRenseignes = 0;
  for (let i = 0; i < moisEcoules; i++) {
    const reference = new Date(
      camion.dateAcquisition.getFullYear(),
      camion.dateAcquisition.getMonth() + i,
      1,
    );
    const mois = calculerPnl(camion, mvts, moisCourant(reference));
    cumuleGnf += mois.margeExploitation;
    if (mois.recetteGnf > 0 || mois.couts > 0) moisRenseignes++;
  }

  const resteGnf = Math.max(coutAcquisition - cumuleGnf, 0);
  const rembourse = resteGnf === 0;

  // La moyenne se calcule sur les mois documentés. Un camion acheté avant la
  // mise en service de l'application a des mois vides qui ne reflètent pas son
  // activité réelle : les compter reviendrait à lui prêter une marge nulle.
  const base = moisRenseignes > 0 ? moisRenseignes : moisEcoules;
  const moyenneMensuelleGnf = Math.round(cumuleGnf / base);

  const brut =
    rembourse ? 0 : moyenneMensuelleGnf > 0 ? Math.ceil(resteGnf / moyenneMensuelleGnf) : null;

  // Au-delà de dix ans, la projection ne dit plus rien d'utile.
  const horizonDepasse = brut !== null && brut > HORIZON_PROJECTION_MOIS;
  const moisRestants = horizonDepasse ? null : brut;

  const dateRemboursement =
    moisRestants === null
      ? null
      : new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + moisRestants, 1);

  return {
    coutAcquisition,
    cumuleGnf,
    resteGnf,
    avancementPct:
      coutAcquisition > 0 ? Math.min(Math.round((cumuleGnf / coutAcquisition) * 100), 100) : 0,
    moisEcoules,
    moisRenseignes,
    moyenneMensuelleGnf,
    moisRestants,
    dateRemboursement,
    rembourse,
    horizonDepasse,
  };
}

/** Ligne du tableau « ce que rapporte chaque véhicule ». */
export interface RentabiliteVehicule {
  pnl: PnlCamion;
  capital: RecuperationCapital;
  /** Part de la marge d'exploitation totale de la flotte, en %. */
  partMargePct: number;
}

/**
 * Rentabilité de chaque véhicule sur la période, classée par contribution.
 *
 * Le classement se fait sur la **marge d'exploitation** : c'est le seul
 * critère qui compare des véhicules à armes égales, indépendamment de leur
 * date d'achat et de leur prix.
 */
export async function rentabiliteFlotte(
  periode: Periode,
  aujourdhui: Date = new Date(),
): Promise<RentabiliteVehicule[]> {
  const pnls = await pnlFlotte(periode);
  const capitaux = await Promise.all(
    pnls.map((p) => recuperationCapital(p.camion.id, aujourdhui)),
  );

  // Seules les contributions positives comptent dans la répartition : inclure
  // les pertes au dénominateur donnerait des parts supérieures à 100 %.
  const totalPositif = pnls.reduce((t, p) => t + Math.max(p.margeExploitation, 0), 0);

  return pnls
    .map((pnl, i) => ({
      pnl,
      capital: capitaux[i],
      partMargePct:
        totalPositif > 0 && pnl.margeExploitation > 0
          ? Math.round((pnl.margeExploitation / totalPositif) * 100)
          : 0,
    }))
    .sort((a, b) => b.pnl.margeExploitation - a.pnl.margeExploitation);
}

export interface PointMensuel {
  periode: Periode;
  recetteGnf: number;
  coutsGnf: number;
  margeGnf: number;
  margeExploitationGnf: number;
}

/**
 * Série des `nbMois` derniers mois (le mois courant en dernier).
 * Les mouvements sont chargés une seule fois puis répartis par période :
 * `calculerPnl` est une fonction pure, on peut la rejouer pour chaque mois.
 */
export async function serieMensuelle(nbMois: number, aujourdhui: Date = new Date()): Promise<PointMensuel[]> {
  const camions = await prisma.camion.findMany({ where: { actif: true } });
  if (camions.length === 0) return [];

  const tout = await chargerMouvements(camions.map((c) => c.id));
  const mvts = camions.map((c) => ({ camion: c, mouvements: regrouper(c.id, tout) }));

  const points: PointMensuel[] = [];
  for (let recul = nbMois - 1; recul >= 0; recul--) {
    const reference = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - recul, 1);
    const periode = moisCourant(reference);
    const pnls = mvts.map(({ camion, mouvements }) => calculerPnl(camion, mouvements, periode));

    points.push({
      periode,
      recetteGnf: pnls.reduce((t, p) => t + p.recetteGnf, 0),
      coutsGnf: pnls.reduce((t, p) => t + p.couts, 0),
      margeGnf: pnls.reduce((t, p) => t + p.margeExploitation, 0),
      margeExploitationGnf: pnls.reduce((t, p) => t + p.margeExploitation, 0),
    });
  }
  return points;
}

export interface FicheCamion extends PnlCamion {
  /** Toutes les réparations du camion, pas seulement celles de la période. */
  reparations: Reparation[];
  entretiens: Entretien[];
  /**
   * Papiers du véhicule : assurance, visite technique, carte brune…
   * Rassemblés sur la fiche pour qu'un camion se tienne à jour depuis un seul
   * écran, sans passer par la liste générale des échéances.
   */
  echeances: Echeance[];
  /** Voyage actuellement en cours, s'il y en a un. */
  voyageEnCours: VoyageAvecChauffeur | null;
  /** Nombre de mois d'amortissement déjà écoulés depuis l'acquisition. */
  moisAmortis: number;
  dureeAmortissementMois: number;
  /** Mois nécessaires pour rembourser l'acquisition à la marge d'exploitation actuelle. */
  paybackMois: number;
  consoMoyenneL100: number | null;
  froid: EtatFroid | null;
}

export interface EtatFroid {
  consigne: number | null;
  dernierReleve: number | null;
  nbConformes: number;
  nbReleves: number;
  statut: "CONFORME" | "ALERTE" | "RUPTURE";
}

const STATUTS_EN_ROUTE = ["EN_ATTENTE_CHARGEMENT", "EN_COURS", "ARRIVE_DESTINATION", "EN_DECHARGEMENT"] as const;

export async function ficheCamion(camionId: string, periode: Periode): Promise<FicheCamion | null> {
  const camion = await prisma.camion.findUnique({ where: { id: camionId } });
  if (!camion) return null;

  const tout = await chargerMouvements([camion.id]);
  const mvts = regrouper(camion.id, tout);
  const pnl = calculerPnl(camion, mvts, periode);

  const voyageEnCours =
    mvts.voyages.find((v) => (STATUTS_EN_ROUTE as readonly string[]).includes(v.statut)) ?? null;

  // Amortissement : mois écoulés depuis l'acquisition, plafonnés à la durée.
  const dureeAmortissementMois = camion.dureeAmortissementMois ?? 60;
  let moisAmortis = 0;
  if (camion.dateAcquisition) {
    const ecart =
      (periode.debut.getFullYear() - camion.dateAcquisition.getFullYear()) * 12 +
      (periode.debut.getMonth() - camion.dateAcquisition.getMonth());
    moisAmortis = Math.min(Math.max(ecart, 0), dureeAmortissementMois);
  }

  const coutAcquisition = nOuNull(camion.coutAcquisition);
  const payback =
    coutAcquisition !== undefined ? paybackMois(coutAcquisition, pnl.margeExploitation) : Number.POSITIVE_INFINITY;

  const froid = camion.refrigere ? await etatFroid(mvts.voyages.map((v) => v.id)) : null;
  const echeances = await prisma.echeance.findMany({
    where: { camionId },
    orderBy: { dateExpiration: "asc" },
  });

  return {
    ...pnl,
    reparations: mvts.reparations,
    entretiens: mvts.entretiens,
    echeances,
    voyageEnCours,
    moisAmortis,
    dureeAmortissementMois,
    paybackMois: payback,
    consoMoyenneL100: await consoMoyenne(mvts.voyages.map((v) => v.id)),
    froid,
  };
}

/** Statut de la chaîne du froid, agrégé sur les relevés des voyages du camion. */
async function etatFroid(voyageIds: string[]): Promise<EtatFroid | null> {
  if (voyageIds.length === 0) return null;

  const releves = await prisma.releveTemperature.findMany({
    where: { voyageId: { in: voyageIds } },
    orderBy: { releveLe: "desc" },
  });
  if (releves.length === 0) return null;

  const nbConformes = releves.filter((r) => r.conformite === "CONFORME").length;
  const statut = releves.some((r) => r.conformite === "RUPTURE")
    ? "RUPTURE"
    : releves.some((r) => r.conformite === "ALERTE")
      ? "ALERTE"
      : "CONFORME";

  return {
    consigne: nOuNull(releves[0].consigne) ?? null,
    dernierReleve: n(releves[0].temperature),
    nbConformes,
    nbReleves: releves.length,
    statut,
  };
}

export { STATUTS_EN_ROUTE };
