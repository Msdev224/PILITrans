import type {
  Camion,
  Chauffeur,
  Depense,
  EtapeVoyage,
  Facture,
  MouvementCaisse,
  Voyage,
} from "@prisma/client";

import { consoTroncon, joursEntre, tauxAVide } from "@/lib/calculs";
import {
  INCLURE_LIGNES,
  lignesEnEcart,
  resumeChargement,
  vueLignes,
  type LigneVue,
} from "@/lib/donnees/marchandises";
import { kmVoyage, pnlFlotte, remunerationDuVoyage } from "@/lib/donnees/camions";
import {
  baseRepartition,
  coutCompletTrajet,
  quotePartTrajet,
  type CoutCompletTrajet,
} from "@/lib/donnees/repartition";
import { dansPeriode, moisCourant, type Periode } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { debutDeJour, n } from "@/lib/utils";

/** Un voyage est « en route » tant qu'il n'est ni terminé ni annulé. */
export const STATUTS_EN_ROUTE = [
  // Départ déclaré : le camion roule, il n'est plus disponible.
  "EN_ROUTE_CHARGEMENT",
  "EN_ATTENTE_CHARGEMENT",
  "EN_COURS",
  "ARRIVE_DESTINATION",
  "EN_DECHARGEMENT",
] as const;

export interface LigneVoyage {
  voyage: VoyageComplet;

  /** Marchandises transportées, chacune avec son unité. */
  marchandises: LigneVue[];
  /** Résumé lisible du chargement, aussi utilisé par la recherche. */
  chargement: string;

  /** Produits & charges directement imputables à la mission (GNF). */
  recetteGnf: number;
  fraisGnf: number;
  /** Dépenses saisies sur la mission mais laissées hors de sa marge. */
  horsMargeGnf: number;
  remunerationGnf: number;
  /** Recette − frais de voyage − rémunération. Sans amortissement : il se
   *  répartit sur le mois du camion, pas sur une mission isolée. */
  margeGnf: number;

  km: number;
  international: boolean;
  /** Jours passés sur le point de chargement (0 si non concerné). */
  joursAttente: number;
  enRoute: boolean;
  termine: boolean;
  facture: boolean;
  postes: Depense[];
}

export interface StatsVoyages {
  enCours: number;
  terminesMois: number;
  recetteMoisGnf: number;
  tauxAVidePct: number;
}

export type FiltreVoyage =
  | "tous"
  | "en-cours"
  | "termines"
  | "en-attente"
  | "internationaux"
  | "a-vide";

export const FILTRES: { cle: FiltreVoyage; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  { cle: "en-cours", libelle: "En cours" },
  { cle: "termines", libelle: "Terminés" },
  { cle: "en-attente", libelle: "En attente" },
  { cle: "internationaux", libelle: "Internationaux" },
  { cle: "a-vide", libelle: "À vide" },
];

export function estFiltreVoyage(valeur: string | undefined): valeur is FiltreVoyage {
  return FILTRES.some((f) => f.cle === valeur);
}

/** Voyage tel que chargé partout ici : avec son camion, son équipage et ses marchandises. */
export type VoyageComplet = Voyage & {
  camion: Camion;
  chauffeur: Chauffeur;
  /** Pays liés : ils sont saisis par l'exploitation, plus figés dans le code. */
  paysDepart: { nom: string; code: string } | null;
  paysArrivee: { nom: string; code: string } | null;
  client: { id: string; nom: string } | null;
  factures: Facture[];
  lignes: Parameters<typeof vueLignes>[0];
};

function construireLigne(
  voyage: VoyageComplet,
  depenses: Depense[],
  aujourdhui: Date,
  /** Démonstration : montre le code de retrait au lieu de le garder secret. */
  montrerCode = false,
): LigneVoyage {
  const postes = depenses.filter((d) => d.voyageId === voyage.id);
  const recetteGnf = n(voyage.recetteGnf);
  /*
   * Seules les dépenses imputées pèsent sur la marge de la mission.
   *
   * Une réparation engagée pendant le voyage reste visible dans la liste des
   * postes — il faut pouvoir la retrouver — mais elle appartient au camion,
   * pas à cette course : la pièce sert des mois durant. L'imputer ferait
   * plonger la marge d'un voyage au hasard de la panne.
   */
  const fraisGnf = postes.reduce((total, d) => (d.imputerAMission ? total + n(d.montantGnf) : total), 0);
  const horsMargeGnf = postes.reduce((total, d) => (d.imputerAMission ? total : total + n(d.montantGnf)), 0);
  const remunerationGnf = remunerationDuVoyage(voyage);

  const joursAttente = voyage.dateArriveeChargement
    ? joursEntre(voyage.dateArriveeChargement, voyage.dateChargement ?? debutDeJour(aujourdhui))
    : 0;

  const marchandises = vueLignes(voyage.lignes, montrerCode);

  return {
    voyage,
    marchandises,
    chargement: resumeChargement(marchandises),
    recetteGnf,
    fraisGnf,
    horsMargeGnf,
    remunerationGnf,
    margeGnf: recetteGnf - fraisGnf - remunerationGnf,
    km: kmVoyage(voyage),
    international: voyage.paysDepartId !== voyage.paysArriveeId,
    joursAttente,
    enRoute: (STATUTS_EN_ROUTE as readonly string[]).includes(voyage.statut),
    termine: voyage.statut === "TERMINE",
    facture: voyage.factures.length > 0,
    postes,
  };
}

function appliquerFiltre(lignes: LigneVoyage[], filtre: FiltreVoyage): LigneVoyage[] {
  switch (filtre) {
    case "en-cours":
      return lignes.filter((l) => l.enRoute && l.voyage.statut !== "EN_ATTENTE_CHARGEMENT");
    case "termines":
      return lignes.filter((l) => l.termine);
    case "en-attente":
      return lignes.filter(
        (l) => l.voyage.statut === "EN_ATTENTE_CHARGEMENT" || l.voyage.statut === "PLANIFIE",
      );
    case "internationaux":
      return lignes.filter((l) => l.international);
    case "a-vide":
      return lignes.filter((l) => l.voyage.aVide);
    default:
      return lignes;
  }
}

/**
 * Normalise pour la recherche : minuscules et accents retirés, afin que
 * « labe » trouve « Labé » et « boke » trouve « Boké ».
 */
const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Recherche plein texte sur trajet, client, marchandise, camion, chauffeur, référence. */
function appliquerRecherche(lignes: LigneVoyage[], recherche: string): LigneVoyage[] {
  const terme = normaliser(recherche.trim());
  if (!terme) return lignes;

  return lignes.filter((l) =>
    [
      l.voyage.villeDepart,
      l.voyage.villeArrivee,
      l.voyage.client?.nom,
      l.chargement,
      l.voyage.reference,
      l.voyage.camion.nom,
      l.voyage.camion.immatTracteur,
      l.voyage.chauffeur.nom,
    ]
      .filter((champ): champ is string => Boolean(champ))
      .some((champ) => normaliser(champ).includes(terme)),
  );
}

export interface VueVoyages {
  lignes: LigneVoyage[];
  stats: StatsVoyages;
  total: number;
}

/**
 * Liste des voyages, filtrée et enrichie du P&L de chaque mission.
 * Les statistiques du bandeau portent toujours sur l'ensemble du mois,
 * indépendamment du filtre affiché.
 */
export async function vueVoyages(
  periode: Periode,
  options: { filtre?: FiltreVoyage; recherche?: string; aujourdhui?: Date } = {},
): Promise<VueVoyages> {
  const { filtre = "tous", recherche = "", aujourdhui = new Date() } = options;

  /*
   * Bornage de la liste.
   *
   * La requête ramenait tous les voyages jamais enregistrés, plus toutes les
   * dépenses de voyage, pour n'en afficher qu'un mois : le tri et le filtrage
   * se faisaient en mémoire. L'écran Voyages est celui qu'on ouvre dix fois
   * par jour ; c'est donc celui qui se serait alourdi le plus vite.
   *
   * Deux ensembles seulement sont nécessaires : les voyages de la période
   * demandée, et ceux qui roulent encore — ces derniers ont pu partir avant et
   * doivent rester visibles, sinon une mission en cours disparaît de l'écran
   * le premier jour du mois suivant.
   */
  const bornes = {
    OR: [
      { dateDepart: { gte: periode.debut, lt: periode.fin } },
      { statut: { in: [...STATUTS_EN_ROUTE] } },
    ],
  };

  const [voyages, depenses] = await Promise.all([
    prisma.voyage.findMany({
      where: { statut: { not: "ANNULE" }, ...bornes },
      include: {
        camion: true,
        chauffeur: true,
        client: { select: { id: true, nom: true } },
        factures: true,
        lignes: INCLURE_LIGNES,
        paysDepart: { select: { nom: true, code: true } },
        paysArrivee: { select: { nom: true, code: true } },
      },
      orderBy: { dateDepart: "desc" },
    }),
    // Les dépenses suivent le même bornage, par leur voyage : sans cela on
    // rapatriait tout l'historique des dépenses pour en utiliser un mois.
    prisma.depense.findMany({
      where: { voyageId: { not: null }, voyage: { statut: { not: "ANNULE" }, ...bornes } },
    }),
  ]);

  const toutes = voyages.map((v) => construireLigne(v, depenses, aujourdhui));
  const duMois = toutes.filter((l) => dansPeriode(l.voyage.dateDepart, periode));

  const km = duMois.reduce((total, l) => total + l.km, 0);
  const kmAVide = duMois.filter((l) => l.voyage.aVide).reduce((total, l) => total + l.km, 0);

  const stats: StatsVoyages = {
    enCours: toutes.filter((l) => l.enRoute).length,
    terminesMois: duMois.filter((l) => l.termine).length,
    recetteMoisGnf: duMois.reduce((total, l) => total + l.recetteGnf, 0),
    tauxAVidePct: tauxAVide(kmAVide, km),
  };

  return {
    lignes: appliquerRecherche(appliquerFiltre(toutes, filtre), recherche),
    stats,
    total: toutes.length,
  };
}


// ------------------------------------------------------------
//  Fiche d'un voyage : tronçons, carburant, quantités
// ------------------------------------------------------------

export interface TronconVue {
  etape: EtapeVoyage & { ravitaillements: Depense[] };
  /** `null` tant que le tronçon n'est pas exploitable (relevés incomplets). */
  distance: number | null;
  pleinsL: number;
  litresConsommes: number | null;
  litresPer100km: number | null;
  termine: boolean;
}

export interface FicheVoyage extends LigneVoyage {
  troncons: TronconVue[];
  /** Consommation moyenne du voyage, pondérée par la distance. */
  consoMoyenneL100: number | null;
  /**
   * Marchandises transportées, chacune avec son unité et son propre suivi
   * chargé → reçu → livré. Un voyage en porte souvent plusieurs, parfois pour
   * des destinataires différents.
   */
  lignes: LigneVue[];
  /**
   * Manquants inexpliqués, marchandise par marchandise, prélèvements de douane
   * déduits. Il n'y a délibérément pas d'écart global : additionner des tonnes
   * et des sacs ne veut rien dire, et un total masquerait la marchandise
   * réellement en cause.
   */
  lignesEnEcart: LigneVue[];
  /**
   * Argent remis au chauffeur pour cette mission, mouvement par mouvement.
   *
   * Une mission ne se finance pas en une fois : on remet une somme au départ,
   * puis on recharge en route — un poste plus cher que prévu, une panne, un
   * détour. Les mouvements s'ajoutent donc, ils ne se remplacent pas.
   */
  avances: (MouvementCaisse & { moyen: { nom: string } | null })[];
  /** Total remis, rechargements compris. */
  remisGnf: number;
  /** Part déjà justifiée par des dépenses, ou rendue en reliquat. */
  justifieGnf: number;
  /** Ce que le chauffeur détient encore sur cette mission. */
  resteAJustifierGnf: number;
  /** Contrepartie en argent des retenues de douane, tous articles confondus. */
  prelevementGnf: number;
  /**
   * Coût complet : charges du trajet + part des coûts du camion revenant à
   * cette mission, au prorata des kilomètres du mois. La marge de route seule
   * fait paraître rentables des courses qui ne paient pas leur véhicule.
   */
  coutComplet: CoutCompletTrajet | null;
}

export interface PrelevementVue {
  id: string;
  quantiteTonnes: number;
  lieu: string;
  pays: string;
  motif: string | null;
  montantGnf: number | null;
  reference: string | null;
  date: string;
}

function construireTroncon(etape: EtapeVoyage & { ravitaillements: Depense[] }): TronconVue {
  const pleins = etape.ravitaillements.map((r) => n(r.litres)).filter((l) => l > 0);
  const pleinsL = pleins.reduce((total, l) => total + l, 0);

  const exploitable =
    etape.kmDepart != null &&
    etape.kmArrivee != null &&
    etape.carburantRestantDepart != null &&
    etape.carburantRestantArrivee != null;

  if (!exploitable) {
    return {
      etape,
      distance: etape.kmDepart != null && etape.kmArrivee != null ? etape.kmArrivee - etape.kmDepart : null,
      pleinsL,
      litresConsommes: null,
      litresPer100km: null,
      termine: etape.arriveeLe != null,
    };
  }

  const resultat = consoTroncon({
    kmDepart: etape.kmDepart!,
    kmArrivee: etape.kmArrivee!,
    carburantRestantDepart: n(etape.carburantRestantDepart),
    carburantRestantArrivee: n(etape.carburantRestantArrivee),
    pleins,
  });

  return {
    etape,
    distance: resultat.distance,
    pleinsL,
    litresConsommes: resultat.litresConsommes,
    litresPer100km: resultat.litresPer100km,
    termine: etape.arriveeLe != null,
  };
}

/**
 * Coût complet d'une mission : ses charges propres, plus la part des coûts du
 * camion qui lui revient sur le mois.
 *
 * `null` quand le camion n'a parcouru aucun kilomètre sur la période : il n'y
 * a alors aucune clé de répartition, et en inventer une donnerait un chiffre
 * que personne ne pourrait justifier.
 */
async function coutCompletDuVoyage(
  voyage: VoyageComplet,
  ligne: LigneVoyage,
): Promise<CoutCompletTrajet | null> {
  const flotte = await pnlFlotte(moisCourant(voyage.dateDepart));
  const pnl = flotte.find((p) => p.camion.id === voyage.camionId);
  if (!pnl || pnl.km <= 0) return null;

  const base = baseRepartition(pnl);
  const km = kmVoyage(voyage);
  return coutCompletTrajet(
    ligne.recetteGnf,
    ligne.fraisGnf + ligne.remunerationGnf,
    quotePartTrajet(base, km),
    km,
  );
}

export async function ficheVoyage(id: string, aujourdhui: Date = new Date()): Promise<FicheVoyage | null> {
  const voyage = await prisma.voyage.findUnique({
    where: { id },
    include: {
        camion: true,
        chauffeur: true,
        client: { select: { id: true, nom: true } },
        factures: true,
        lignes: INCLURE_LIGNES,
        paysDepart: { select: { nom: true, code: true } },
        paysArrivee: { select: { nom: true, code: true } },
      },
  });
  if (!voyage) return null;

  const [depenses, etapes, avances] = await Promise.all([
    prisma.depense.findMany({ where: { voyageId: id }, orderBy: { date: "asc" } }),
    prisma.etapeVoyage.findMany({
      where: { voyageId: id },
      include: {
        ravitaillements: true,
        paysDepart: { select: { nom: true, code: true } },
        paysArrivee: { select: { nom: true, code: true } },
      },
      orderBy: { ordre: "asc" },
    }),
    prisma.mouvementCaisse.findMany({
      where: { voyageId: id },
      orderBy: { date: "asc" },
      include: { moyen: { select: { nom: true } } },
    }),
  ]);

  /*
   * Ce qui a été remis, et ce qu'il en reste à justifier.
   *
   * Les avances s'additionnent : recharger en route ajoute une ligne, elle ne
   * corrige pas la première. Les dépenses payées sur la caisse et le reliquat
   * rendu viennent en déduction — le solde est ce que le chauffeur détient
   * encore pour cette mission.
   */
  const remisGnf = avances
    .filter((m) => m.type === "AVANCE")
    .reduce((total, m) => total + n(m.montantGnf), 0);
  const justifieGnf = avances
    .filter((m) => m.type !== "AVANCE")
    .reduce((total, m) => total + n(m.montantGnf), 0);

  // Le code de retrait ne se montre que si l'exploitation l'a demandé dans
  // les Paramètres — pour une démonstration sans SMS réel.
  const parametres = await prisma.parametres.findFirst({ select: { afficherCodeLivraison: true } });

  const ligne = construireLigne(voyage, depenses, aujourdhui, parametres?.afficherCodeLivraison ?? false);
  const troncons = etapes.map(construireTroncon);

  const exploitables = troncons.filter((t) => t.distance != null && t.distance > 0 && t.litresConsommes != null);
  const distance = exploitables.reduce((total, t) => total + (t.distance ?? 0), 0);
  const litres = exploitables.reduce((total, t) => total + (t.litresConsommes ?? 0), 0);

  // Distance de la mission : le relevé au niveau du voyage prime, sinon on
  // somme les tronçons — sans quoi une mission suivie étape par étape
  // afficherait « — » alors que les kilomètres sont connus.
  const kmTroncons = troncons.reduce((total, t) => total + (t.distance ?? 0), 0);

  return {
    ...ligne,
    km: ligne.km > 0 ? ligne.km : kmTroncons,
    troncons,
    consoMoyenneL100: distance > 0 ? Math.round((litres / distance) * 1000) / 10 : null,
    lignes: ligne.marchandises,
    lignesEnEcart: lignesEnEcart(ligne.marchandises),
    prelevementGnf: ligne.marchandises.reduce((t, l) => t + l.prelevementGnf, 0),
    avances,
    remisGnf,
    justifieGnf,
    resteAJustifierGnf: remisGnf - justifieGnf,
    coutComplet: await coutCompletDuVoyage(voyage, ligne),
  };
}
