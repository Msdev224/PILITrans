"use server";

import {
  MotifVoyage,
  MoyenPaiement,
  Prisma,
  SegmentTrajet,
  StatutVoyage,
  TypeDepense,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { suggestionTrajet, type Suggestion } from "@/lib/donnees/trajets";
import { exigerPermission } from "@/lib/autorisation";
import { observerTaux } from "@/lib/donnees/taux";
import { lignesRemise, type LigneRemise } from "@/lib/remise";
import { LIBELLE_TYPE_DEPENSE, formatNombre } from "@/lib/utils";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { notifierAffectationChauffeur, notifierEtapeVoyage } from "@/lib/sms/declencheurs";
import { synchroniserCamion } from "@/lib/donnees/synchronisation";
import { caseACocher, dateBornee, distanceKm, erreursFormulaire, nombreOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("voyages.ecrire");
}

// ------------------------------------------------------------
//  Validation
// ------------------------------------------------------------

/** Champ numérique de formulaire : "" → undefined, virgule décimale acceptée. */
const schemaVoyage = z
  .object({
    camionId: z.string().min(1, "Camion requis"),
    chauffeurId: z.string().min(1, "Chauffeur requis"),
    /** Pays choisis dans la liste tenue par l'exploitation. */
    paysDepartId: texteOptionnel,
    villeDepart: z.string().trim().min(1, "Ville de départ requise"),
    paysArriveeId: texteOptionnel,
    villeArrivee: z.string().trim().min(1, "Ville d'arrivée requise"),
    /** Client de la mission, choisi dans la liste — plus de saisie libre. */
    clientId: texteOptionnel,
    /** Trajet à vide destiné à aller chercher la marchandise du client. */
    vaChercher: caseACocher,
    /** Ce pour quoi le camion roule : transport, atelier, repositionnement… */
    motif: z.nativeEnum(MotifVoyage).default("TRANSPORT"),
    /** Décoché sur un aller d'atelier : le chauffeur n'a que ses frais. */
    remunererChauffeur: caseACocher,
    /** Indemnité de nourriture par jour, convenue pour cette mission. */
    perDiemJournalierGnf: nombreOptionnel,
    /** Paie de la mission, si elle est déjà arrêtée. */
    remunerationChauffeur: nombreOptionnel,
    distanceKm,
    dateDepart: dateBornee,
    aVide: caseACocher,
    allerRetour: caseACocher,
    recette: nombreOptionnel,
    /**
     * Devise de la recette.
     *
     * Valeur par défaut obligatoire : sur un trajet à vide, le champ est
     * désactivé dans le formulaire et le navigateur ne l'envoie donc pas.
     * L'exiger bloquait la création avec un message portant sur un champ
     * que l'utilisateur ne pouvait même pas atteindre.
     */
    devise: z.enum(["GNF", "XOF"]).default("GNF"),
    /** Bennes : nombre de rotations sur le même trajet dans la journée. */
    nbRotations: nombreOptionnel,
    /** Si renseigné, la recette vaut tarifRotation × nbRotations. */
    tarifRotation: nombreOptionnel,
    // Équivalent GNF saisi au taux réel du moment (cf. CLAUDE.md).
    recetteGnf: nombreOptionnel,
    statut: z.nativeEnum(StatutVoyage).default("PLANIFIE"),
  })
  .refine((v) => !(v.devise === "XOF" && (v.recette ?? 0) > 0 && !v.recetteGnf), {
    message: "Saisir l'équivalent en GNF de la recette en CFA",
    path: ["recetteGnf"],
  })
  .refine((v) => v.aVide || !!v.clientId, {
    message: "Client requis (sauf pour un trajet à vide)",
    path: ["clientId"],
  });

export interface EtatFormulaire {
  ok?: boolean;
  erreur?: string;
  /** Erreurs par champ, pour l'affichage sous les libellés. */
  champs?: Record<string, string>;
  /** Saisie renvoyée telle quelle : sans elle, un échec de validation
   *  viderait les champs non contrôlés (camion, chauffeur, date…). */
  valeurs?: Record<string, string>;
}


// ------------------------------------------------------------
//  Référence de voyage
//  Format repris du seed : « KD-2026-041 » (initiales du trajet, année, rang).
// ------------------------------------------------------------

const initiale = (ville: string) => (ville.trim()[0] ?? "X").toUpperCase();

async function referenceLibre(villeDepart: string, villeArrivee: string, date: Date) {
  const prefixe = `${initiale(villeDepart)}${initiale(villeArrivee)}-${date.getFullYear()}`;
  const existantes = await prisma.voyage.findMany({
    where: { reference: { startsWith: prefixe } },
    select: { reference: true },
  });

  const rangs = existantes
    .map((v) => Number.parseInt(v.reference.split("-")[2] ?? "", 10))
    .filter((r) => Number.isFinite(r));
  const rang = (rangs.length ? Math.max(...rangs) : 0) + 1;

  return `${prefixe}-${String(rang).padStart(3, "0")}`;
}

// ------------------------------------------------------------
//  Actions
// ------------------------------------------------------------

function donneesVoyage(saisie: z.infer<typeof schemaVoyage>) {
  const nbRotations = Math.max(Math.round(saisie.nbRotations ?? 1), 1);
  /*
   * Le montant convenu prime toujours sur le barème.
   *
   * Le tarif par rotation sert à pré-remplir, pas à décider : un forfait se
   * négocie, et il s'écarte parfois du barème. Imposer le calcul obligeait à
   * noter le vrai montant hors de l'application. Le barème ne s'applique donc
   * que si rien n'a été saisi.
   */
  const recette =
    saisie.recette != null && saisie.recette > 0
      ? saisie.recette
      : saisie.tarifRotation != null && saisie.tarifRotation > 0
        ? saisie.tarifRotation * nbRotations
        : 0;
  // En GNF, l'équivalent est le montant lui-même ; en devise, c'est la valeur
  // saisie par l'utilisateur au taux réel — jamais un taux recalculé.
  // En GNF l'équivalent est le montant lui-même ; en devise, c'est la valeur
  // saisie au taux réel. Avec un tarif par rotation en GNF, l'équivalent suit
  // la recette recalculée.
  const recetteGnf = saisie.devise === "GNF" ? recette : (saisie.recetteGnf ?? 0);

  return {
    camionId: saisie.camionId,
    chauffeurId: saisie.chauffeurId,
    paysDepartId: saisie.paysDepartId || null,
    villeDepart: saisie.villeDepart,
    paysArriveeId: saisie.paysArriveeId || null,
    villeArrivee: saisie.villeArrivee,
    clientId: saisie.clientId || null,
    // Un repositionnement à vide n'a pas de marchandise à aller chercher.
    vaChercher: saisie.aVide ? saisie.vaChercher : false,
    motif: saisie.motif,
    remunererChauffeur: saisie.remunererChauffeur,
    perDiemJournalierGnf: saisie.perDiemJournalierGnf ?? null,
    remunerationChauffeur: saisie.remunerationChauffeur ?? null,
    /*
     * La distance ne figure plus au formulaire : elle se déduit des relevés
     * de compteur du chauffeur. On ne l'écrit donc que si elle est fournie —
     * l'écraser à `null` effacerait la distance des missions déjà saisies à
     * la main, et tous leurs coûts au kilomètre avec.
     */
    ...(saisie.distanceKm != null ? { distanceKm: Math.round(saisie.distanceKm) } : {}),
    dateDepart: saisie.dateDepart,
    aVide: saisie.aVide,
    allerRetour: saisie.allerRetour,
    recette,
    devise: saisie.devise,
    recetteGnf,
    nbRotations,
    tarifRotation: saisie.tarifRotation ?? null,
    statut: saisie.statut,
  };
}

/**
 * Marchandises saisies dans le formulaire.
 *
 * Les champs sont répétés, une occurrence par ligne : `Object.fromEntries` n'en
 * garderait que la dernière. Il faut donc les lire par `getAll` et les
 * réassembler dans l'ordre.
 */
interface SaisieLigne {
  id: string | null;
  designation: string;
  uniteId: string;
  quantiteACharger: number | null;
  clientId: string | null;
}

function lignesDepuisFormulaire(donnees: FormData): SaisieLigne[] {
  const ids = donnees.getAll("ligneId").map(String);
  const designations = donnees.getAll("ligneDesignation").map(String);
  const unites = donnees.getAll("ligneUniteId").map(String);
  const quantites = donnees.getAll("ligneQuantite").map(String);
  const clients = donnees.getAll("ligneClientId").map(String);

  return designations
    .map((designation, i) => {
      const brut = (quantites[i] ?? "").replace(",", ".").replace(/\s/g, "");
      const quantite = brut === "" ? null : Number(brut);
      return {
        id: ids[i] || null,
        designation: designation.trim(),
        uniteId: unites[i] ?? "",
        quantiteACharger: quantite !== null && Number.isFinite(quantite) ? quantite : null,
        clientId: (clients[i] ?? "").trim() || null,
      };
    })
    // Une ligne sans désignation ni unité est une saisie abandonnée.
    .filter((l) => l.designation !== "" && l.uniteId !== "");
}

/**
 * Aligne les marchandises d'un voyage sur ce que porte le formulaire.
 *
 * Les lignes existantes sont mises à jour plutôt que recréées : elles portent
 * les quantités constatées par le chauffeur et les prélèvements de douane, qui
 * seraient perdus par un simple « tout supprimer puis tout réécrire ».
 */
async function synchroniserLignes(voyageId: string, lignes: SaisieLigne[]) {
  const existantes = await prisma.ligneMarchandise.findMany({
    where: { voyageId },
    select: { id: true },
  });
  const conservees = new Set(lignes.map((l) => l.id).filter(Boolean) as string[]);

  await prisma.ligneMarchandise.deleteMany({
    where: { voyageId, id: { notIn: [...conservees] } },
  });
  void existantes;

  for (const [i, l] of lignes.entries()) {
    const valeurs = {
      designation: l.designation,
      uniteId: l.uniteId,
      quantiteACharger: l.quantiteACharger,
      clientId: l.clientId,
      ordre: (i + 1) * 10,
    };
    if (l.id && conservees.has(l.id)) {
      await prisma.ligneMarchandise.update({ where: { id: l.id }, data: valeurs });
    } else {
      await prisma.ligneMarchandise.create({ data: { ...valeurs, voyageId } });
    }
  }
}

function rafraichir(voyageId?: string) {
  revalidatePath("/voyages");
  revalidatePath("/");
  revalidatePath("/camions");
  if (voyageId) revalidatePath(`/voyages/${voyageId}`);
}


// ------------------------------------------------------------
//  Ce qui est remis au chauffeur au lancement de la mission
// ------------------------------------------------------------

/**
 * Argent et carburant confiés au départ.
 *
 * Ils se saisissaient jusqu'ici sur deux écrans séparés, après coup : dans la
 * pratique, le gérant remet l'argent au moment même où il crée la mission, et
 * la saisie différée finissait par ne pas être faite. La trésorerie affichait
 * alors plus d'argent en caisse qu'il n'y en avait réellement.
 *
 * Tout est facultatif : une mission peut partir sans rien avancer. Les
 * compléments en cours de route — une avance qui monte, un reliquat rendu —
 * se saisissent depuis l'écran Caisse, qui reste le seul endroit où les
 * corriger.
 */
/** Réglages communs à la remise : un seul transfert couvre souvent le tout. */
const schemaRemise = z.object({
  avanceMoyen: z.nativeEnum(MoyenPaiement).default("ESPECES"),
  avanceReference: texteOptionnel,
  /** Commission de l'opérateur : elle sort de la caisse sans être remise. */
  avanceFraisGnf: nombreOptionnel,
  carburantLitres: nombreOptionnel,
  carburantMontantGnf: nombreOptionnel,
  /** Aller, retour, ou les deux : sur un aller-retour, la question se pose. */
  carburantSegment: texteOptionnel,
});

type Remise = z.infer<typeof schemaRemise>;

/** Les colonnes parallèles du formulaire, telles qu'elles arrivent. */
function colonnesRemise(donnees: FormData) {
  return {
    objets: donnees.getAll("remiseObjet").map(String),
    montants: donnees.getAll("remiseMontant").map(String),
    devises: donnees.getAll("remiseDevise").map(String),
    equivalents: donnees.getAll("remiseMontantGnf").map(String),
  };
}

/**
 * Contrôle la remise AVANT que la mission n'existe.
 *
 * Créer d'abord puis refuser la remise laisserait une mission orpheline à
 * l'écran : le gérant la recréerait, et le camion partirait deux fois dans
 * les comptes.
 */
function validerRemise(
  donnees: FormData,
): { erreur: string } | { remise: Remise; lignes: LigneRemise[] } {
  const saisie = schemaRemise.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) {
    return { erreur: saisie.error.issues[0]?.message ?? "Remise au chauffeur invalide." };
  }

  const lignes = lignesRemise(colonnesRemise(donnees));

  const objetsValides = Object.values(TypeDepense) as string[];
  for (const ligne of lignes) {
    if (!objetsValides.includes(ligne.objet)) {
      return { erreur: "Objet de remise inconnu." };
    }
    // Le taux GNF⇄CFA bouge : sans équivalent saisi, la caisse consoliderait
    // au mauvais taux et le solde du chauffeur serait faux.
    if (ligne.devise !== "GNF" && ligne.montantGnf <= 0) {
      return { erreur: "Saisir l'équivalent en GNF de chaque somme remise en CFA." };
    }
  }

  return { remise: saisie.data, lignes };
}

/** Segment reçu du formulaire, ignoré s'il ne correspond à rien de connu. */
function segmentValide(valeur: string | null | undefined): SegmentTrajet | null {
  if (!valeur) return null;
  return (Object.values(SegmentTrajet) as string[]).includes(valeur)
    ? (valeur as SegmentTrajet)
    : null;
}

/**
 * Écrit la remise dans la même transaction que la mission.
 *
 * Séparer les deux laisserait, au moindre échec, une mission sans l'argent
 * qui l'accompagne : le gérant la recréerait, et le camion partirait deux
 * fois dans les comptes. Ou l'inverse — de l'argent sorti de la caisse pour
 * une mission qui n'existe pas.
 */
async function appliquerRemise(
  tx: Prisma.TransactionClient,
  voyage: { id: string; camionId: string; chauffeurId: string },
  r: Remise,
  lignes: LigneRemise[],
): Promise<void> {
  // --- Argent remis, ventilé par objet ---
  for (const [index, ligne] of lignes.entries()) {
    await tx.mouvementCaisse.create({
      data: {
        chauffeurId: voyage.chauffeurId,
        voyageId: voyage.id,
        type: "AVANCE",
        objet: ligne.objet,
        montant: ligne.montant,
        devise: ligne.devise,
        montantGnf: ligne.montantGnf,
        moyen: r.avanceMoyen,
        reference: r.avanceReference ?? null,
        // La commission ne se paie qu'une fois pour l'ensemble du transfert :
        // la répéter sur chaque ligne la compterait autant de fois.
        fraisGnf: index === 0 ? (r.avanceFraisGnf ?? null) : null,
        motif: LIBELLE_TYPE_DEPENSE[ligne.objet] ?? "Frais de voyage",
      },
    });
  }

  // --- Carburant remis ---
  //
  // C'est une dépense du camion, pas une avance : le gasoil est déjà
  // consommé par le véhicule, le chauffeur n'a pas à le justifier. La
  // rattacher à la mission la fait entrer dans la marge du bon camion.
  if ((r.carburantMontantGnf ?? 0) > 0 || (r.carburantLitres ?? 0) > 0) {
    await tx.depense.create({
      data: {
        type: "GASOIL_TRACTEUR",
        montant: r.carburantMontantGnf ?? 0,
        devise: "GNF",
        montantGnf: r.carburantMontantGnf ?? 0,
        litres: r.carburantLitres ?? null,
        // Sur un aller-retour, c'est ce qui permettra de dire après coup si le
        // retour a coûté plus cher que l'aller.
        segment: segmentValide(r.carburantSegment),
        description: "Carburant remis au départ",
        voyageId: voyage.id,
        camionId: voyage.camionId,
      },
    });
  }
}

export async function creerVoyage(_etat: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  await droitEcriture();

  const saisie = schemaVoyage.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatFormulaire>(saisie.error, donnees);

  // Ce que le gérant remet au chauffeur se contrôle avant toute écriture.
  const remise = validerRemise(donnees);
  if ("erreur" in remise) return { erreur: remise.erreur };

  const data = donneesVoyage(saisie.data);
  const reference = await referenceLibre(data.villeDepart, data.villeArrivee, data.dateDepart);

  // La mission et ce qui est remis avec elle tiennent ou tombent ensemble.
  const cree = await prisma.$transaction(async (tx) => {
    const voyage = await tx.voyage.create({ data: { ...data, reference } });
    await appliquerRemise(tx, voyage, remise.remise, remise.lignes);
    return voyage;
  });

  // Hors transaction : le relevé de taux et la synchronisation ne doivent pas
  // pouvoir annuler une mission déjà valide.
  for (const ligne of remise.lignes) {
    if (ligne.devise !== "GNF") await observerTaux(ligne.montant, ligne.montantGnf);
  }
  await synchroniserLignes(cree.id, lignesDepuisFormulaire(donnees));
  // Le parc reflète la mission : statut et compteur suivent.
  await synchroniserCamion(data.camionId);
  // Le chauffeur est prévenu de son affectation.
  await notifierAffectationChauffeur(cree.id);

  await journaliser({
    action: "voyage.cree",
    objet: "Voyage",
    objetId: cree.id,
    libelle:
      `Mission ${cree.reference} créée : ${data.villeDepart} > ${data.villeArrivee}` +
      (data.recetteGnf > 0 ? `, ${formatNombre(data.recetteGnf)} GNF convenus` : ""),
    montantGnf: data.recetteGnf || null,
  });

  rafraichir();
  return { ok: true };
}

export async function modifierVoyage(
  id: string,
  _etat: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  await droitEcriture();

  const saisie = schemaVoyage.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatFormulaire>(saisie.error, donnees);

  const valeurs = donneesVoyage(saisie.data);
  const avant = await prisma.voyage.findUnique({ where: { id }, select: { camionId: true } });
  await prisma.voyage.update({ where: { id }, data: valeurs });
  await synchroniserLignes(id, lignesDepuisFormulaire(donnees));

  // Réaffecter la mission à un autre camion libère le précédent.
  await synchroniserCamion(valeurs.camionId);
  if (avant && avant.camionId !== valeurs.camionId) await synchroniserCamion(avant.camionId);
  rafraichir(id);
  return { ok: true };
}

/**
 * Avancement d'une mission. Chaque état pose la date correspondante, qui sert
 * ensuite aux calculs (attente de chargement, durée de mission).
 */
export async function changerStatutVoyage(id: string, statut: StatutVoyage) {
  await droitEcriture();

  const maintenant = new Date();
  const dates: Partial<Record<StatutVoyage, Record<string, Date>>> = {
    EN_ATTENTE_CHARGEMENT: { dateArriveeChargement: maintenant },
    EN_COURS: { dateChargement: maintenant },
    ARRIVE_DESTINATION: { dateArriveeDestination: maintenant },
    EN_DECHARGEMENT: { dateDechargement: maintenant },
    TERMINE: { dateArrivee: maintenant },
  };

  const voyage = await prisma.voyage.findUnique({ where: { id } });
  if (!voyage) throw new Error("Voyage introuvable.");

  // On ne réécrit pas une date déjà posée : un retour en arrière ne doit pas
  // effacer l'historique réel de la mission.
  const aPoser = Object.fromEntries(
    Object.entries(dates[statut] ?? {}).filter(
      ([champ]) => voyage[champ as keyof typeof voyage] == null,
    ),
  );

  await prisma.voyage.update({ where: { id }, data: { statut, ...aPoser } });
  await synchroniserCamion(voyage.camionId);
  // Le client suit sa marchandise étape par étape.
  await notifierEtapeVoyage(id, statut);
  rafraichir(id);
}

/**
 * Annule une mission sans rien effacer.
 *
 * Le client se désiste, le camion tombe en panne, la marchandise n'arrive
 * pas : la mission n'aura pas lieu, mais le gasoil déjà mis et l'avance déjà
 * remise au chauffeur restent des sorties d'argent réelles. Les supprimer
 * ferait disparaître ces montants de la trésorerie sans contrepartie.
 *
 * Une mission annulée sort des recettes, des classements et des analyses ;
 * les dépenses engagées restent au compte du camion, où elles ont bien pesé.
 */
export async function annulerVoyage(id: string, donnees?: FormData): Promise<void> {
  await droitEcriture();

  const voyage = await prisma.voyage.findUnique({
    where: { id },
    select: { camionId: true, statut: true, reference: true },
  });
  if (!voyage) throw new Error("Mission introuvable.");
  if (voyage.statut === "ANNULE") throw new Error("Cette mission est déjà annulée.");

  const brut = donnees?.get("motifAnnulation");
  const motif = typeof brut === "string" ? brut.trim() : "";

  await prisma.voyage.update({
    where: { id },
    data: {
      statut: "ANNULE",
      motifAnnulation: motif || null,
      annuleLe: new Date(),
    },
  });

  await journaliser({
    action: "voyage.annule",
    objet: "Voyage",
    objetId: id,
    libelle: `Mission ${voyage.reference} annulée${motif ? ` — ${motif}` : ""}`,
    avant: { statut: voyage.statut },
    apres: { statut: "ANNULE", motif: motif || null },
  });

  // Le camion redevient disponible : il n'est plus retenu par cette mission.
  await synchroniserCamion(voyage.camionId);
  rafraichir();
}

/**
 * Rétablit une mission annulée par erreur.
 *
 * Elle repart de l'état planifié plutôt que de son état d'avant : les dates
 * d'étape déjà posées restent, mais c'est au gérant de reprendre la main sur
 * l'avancement — rien ne dit que le camion est encore là où il était.
 */
export async function retablirVoyage(id: string): Promise<void> {
  await droitEcriture();

  const voyage = await prisma.voyage.findUnique({
    where: { id },
    select: { camionId: true, statut: true, reference: true },
  });
  if (!voyage) throw new Error("Mission introuvable.");
  if (voyage.statut !== "ANNULE") throw new Error("Cette mission n'est pas annulée.");

  await prisma.voyage.update({
    where: { id },
    data: { statut: "PLANIFIE", motifAnnulation: null, annuleLe: null },
  });

  await journaliser({
    action: "voyage.retabli",
    objet: "Voyage",
    objetId: id,
    libelle: `Mission ${voyage.reference} rétablie`,
    avant: { statut: "ANNULE" },
    apres: { statut: "PLANIFIE" },
  });

  await synchroniserCamion(voyage.camionId);
  rafraichir();
}

export async function supprimerVoyage(id: string) {
  await droitEcriture();

  const liens = await prisma.voyage.findUnique({
    where: { id },
    select: { camionId: true, reference: true, _count: { select: { factures: true, depenses: true, etapes: true } } },
  });
  if (!liens) throw new Error("Voyage introuvable.");

  /*
   * Une mission déjà chiffrée ne s'efface pas.
   *
   * Elle s'annule — et l'annulation est désormais une action à part, avec son
   * motif. La refuser ici plutôt que de la faire en douce évite qu'un clic sur
   * « Supprimer » produise, selon le contenu de la mission, tantôt une
   * suppression tantôt une annulation muette.
   */
  const { factures, depenses, etapes } = liens._count;
  if (factures + depenses + etapes > 0) {
    throw new Error(
      "Cette mission porte des écritures : annule-la depuis sa fiche plutôt que de la supprimer, pour garder la trace des montants engagés.",
    );
  }

  await prisma.voyage.delete({ where: { id } });

  // Une mission vierge supprimée reste une intention effacée : sans trace, on
  // ne peut pas expliquer un trou dans la numérotation des références.
  await journaliser({
    action: "voyage.supprime",
    objet: "Voyage",
    objetId: id,
    libelle: `Mission ${liens.reference} supprimée (aucune écriture rattachée)`,
  });

  await synchroniserCamion(liens.camionId);
  rafraichir();
}

/** Estimation distance / carburant / recette à partir des trajets passés. */
export async function proposerDepuisHistorique(
  depart: string,
  arrivee: string,
): Promise<Suggestion> {
  await droitEcriture();
  return suggestionTrajet(depart, arrivee);
}
