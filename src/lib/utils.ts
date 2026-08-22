import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ------------------------------------------------------------
//  Décimaux Prisma → nombres
//  Prisma renvoie des Decimal (objets) pour les colonnes @db.Decimal ;
//  calculs.ts travaille sur des `number`. Cette conversion est le seul
//  point de passage entre les deux.
// ------------------------------------------------------------

type Decimalish = { toString(): string } | number | string | null | undefined;

/** Convertit un Decimal Prisma (ou null) en nombre. `null` → 0. */
export function n(valeur: Decimalish): number {
  if (valeur === null || valeur === undefined) return 0;
  const x = typeof valeur === "number" ? valeur : Number(valeur.toString());
  return Number.isFinite(x) ? x : 0;
}

/** Idem que `n`, mais conserve l'absence de valeur (null → undefined). */
export function nOuNull(valeur: Decimalish): number | undefined {
  if (valeur === null || valeur === undefined) return undefined;
  return n(valeur);
}

// ------------------------------------------------------------
//  Formatage des montants
//  GNF sans décimales, séparateur d'espace fine insécable.
//  Formatage manuel (pas d'Intl) pour garantir un rendu identique
//  côté serveur et côté client.
// ------------------------------------------------------------

const ESPACE = " "; // espace fine insécable
const MOINS = "−"; // signe moins typographique

/** `14200000` → `14 200 000`. Arrondi à l'entier. */
export function formatNombre(valeur: number): string {
  const arrondi = Math.round(valeur);
  const signe = arrondi < 0 ? MOINS : "";
  const chiffres = Math.abs(arrondi).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE);
  return signe + chiffres;
}

/** `14200000` → `14 200 000 GNF`. */
export function formatGnf(valeur: number): string {
  return `${formatNombre(valeur)}${ESPACE}GNF`;
}

/** Même chose avec un `+` explicite sur les valeurs positives (marges, deltas). */
export function formatSigne(valeur: number): string {
  const arrondi = Math.round(valeur);
  return (arrondi > 0 ? "+" : "") + formatNombre(arrondi);
}

/** `14200000` → `14,2` — pour les tuiles KPI libellées « M GNF ». */
export function formatMillions(valeur: number, decimales = 1): string {
  const millions = valeur / 1_000_000;
  const signe = millions < 0 ? MOINS : "";
  return signe + Math.abs(millions).toFixed(decimales).replace(".", ",");
}

/** `14200000` → `+14,2` (idem, avec signe explicite). */
export function formatMillionsSigne(valeur: number, decimales = 1): string {
  const prefixe = valeur > 0 ? "+" : "";
  return prefixe + formatMillions(valeur, decimales);
}

/** `34.9` → `34,9` — décimal à la française. */
export function formatDecimal(valeur: number, decimales = 1): string {
  const signe = valeur < 0 ? MOINS : "";
  return signe + Math.abs(valeur).toFixed(decimales).replace(".", ",");
}

/** Montant en devise d'origine : `15000 XOF` → `15 000 CFA`. */
export function formatDevise(valeur: number, devise: "GNF" | "XOF"): string {
  return `${formatNombre(valeur)}${ESPACE}${devise === "XOF" ? "CFA" : "GNF"}`;
}

// ------------------------------------------------------------
//  Dates
// ------------------------------------------------------------

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** `14 août 2026` */
export function formatDate(date: Date): string {
  return `${date.getDate()} ${MOIS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `14 août` — sans l'année, pour les listes. */
export function formatDateCourte(date: Date): string {
  return `${date.getDate()} ${MOIS[date.getMonth()]}`;
}

/** `août 2026` */
export function formatMois(date: Date): string {
  return `${MOIS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `mars 2024` — pour les dates d'acquisition. */
export const formatMoisAnnee = formatMois;

/**
 * Minuit du jour de `date`. Les durées métier se comptent en jours pleins :
 * sans cette normalisation, « immobilisé depuis le 14 » affiché le 17 à 19 h
 * donnerait 4 jours au lieu de 3.
 */
export function debutDeJour(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// ------------------------------------------------------------
//  Libellés métier (enums Prisma → français)
// ------------------------------------------------------------

export const LIBELLE_STATUT_CAMION: Record<string, string> = {
  DISPONIBLE: "Disponible",
  EN_VOYAGE: "En voyage",
  IMMOBILISE: "Immobilisé",
  HORS_SERVICE: "Hors service",
};

export const LIBELLE_STATUT_VOYAGE: Record<string, string> = {
  PLANIFIE: "Planifié",
  EN_ATTENTE_CHARGEMENT: "En attente de chargement",
  EN_COURS: "En cours",
  ARRIVE_DESTINATION: "Arrivé à destination",
  EN_DECHARGEMENT: "En déchargement",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

export const LIBELLE_STATUT_REPARATION: Record<string, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
};

export const LIBELLE_CATEGORIE_REPARATION: Record<string, string> = {
  TRACTEUR: "Tracteur",
  REMORQUE: "Remorque",
  GROUPE_FROID: "Groupe froid",
  PNEUMATIQUE: "Pneumatique",
};

export const LIBELLE_TYPE_DEPENSE: Record<string, string> = {
  GASOIL_TRACTEUR: "Gasoil tracteur",
  GASOIL_GROUPE_FROID: "Gasoil groupe froid",
  PEAGE: "Péage",
  FRONTIERE: "Frais de frontière",
  DOUANE: "Douane / transit",
  PER_DIEM: "Per diem",
  INTERNET: "Internet",
  DIVERS: "Divers",
};

export const LIBELLE_TYPE_VEHICULE: Record<string, string> = {
  TRACTEUR_REMORQUE: "Tracteur + remorque",
  PORTEUR: "Porteur",
};

export const LIBELLE_MODE_REMUNERATION: Record<string, string> = {
  FORFAIT_VOYAGE: "Forfait par voyage",
  COMMISSION: "Commission sur recette",
  PAR_KM: "Au kilomètre",
  FIXE_MENSUEL: "Fixe mensuel",
  MIXTE: "Mixte",
};

export const LIBELLE_TYPE_ECHEANCE: Record<string, string> = {
  ASSURANCE: "Assurance",
  VISITE_TECHNIQUE: "Visite technique",
  VIGNETTE: "Vignette",
  AUTORISATION_TRANSPORT: "Autorisation de transport",
  CARTE_BRUNE_CEDEAO: "Carte brune CEDEAO",
  AUTRE: "Autre document",
};

export const LIBELLE_TYPE_ENTRETIEN: Record<string, string> = {
  VIDANGE_TRACTEUR: "Vidange tracteur",
  ENTRETIEN_GROUPE_FROID: "Entretien groupe froid",
  FREINS: "Freins",
  PNEUS: "Pneumatiques",
  AUTRE: "Autre entretien",
};

export const LIBELLE_CARROSSERIE: Record<string, string> = {
  FRIGO: "Frigorifique",
  BENNE: "Benne",
  PLATEAU: "Plateau",
  BACHE: "Bâché",
  CITERNE: "Citerne",
  BUS: "Bus",
  TAXI: "Taxi",
};

/**
 * Carrosseries réellement proposées à la saisie.
 *
 * Le transport de personnes (bus, taxi) est prévu mais pas encore exploité :
 * tant que ces véhicules ne sont pas acquis, les proposer laisserait croire
 * que l'application sait les suivre. Or tout le modèle repose ici sur une
 * marchandise et un client — tonnage, écart de livraison, chaîne du froid,
 * facture rattachée au voyage. Un bus n'a rien de tout cela : il lui faut ses
 * propres notions (places, billets, recette au voyageur), qui restent à
 * construire le jour où la flotte s'y étendra.
 */
export const CARROSSERIES_PERSONNES = ["BUS", "TAXI"] as const;

/**
 * Carrosseries proposées à la saisie.
 *
 * Bus et taxi n'apparaissent que si le module « transport de personnes » est
 * activé dans les Paramètres : les proposer avant laisserait croire que
 * l'application sait suivre des passagers.
 */
export function carrosseriesDisponibles(transportPersonnesActif = false): string[] {
  return Object.keys(LIBELLE_CARROSSERIE).filter(
    (c) => transportPersonnesActif || !(CARROSSERIES_PERSONNES as readonly string[]).includes(c),
  );
}

/** Vrai pour un véhicule de transport de personnes (module non actif). */
export function estTransportPersonnes(carrosserie: string): boolean {
  return (CARROSSERIES_PERSONNES as readonly string[]).includes(carrosserie);
}

export const LIBELLE_TYPE_ETAPE: Record<string, string> = {
  ETAPE: "Point de passage",
  ARRET: "Arrêt",
  CHANGEMENT_DESTINATION: "Changement de destination",
  ATTENTE_CHARGEMENT: "Attente de chargement",
  CHARGEMENT: "Chargement",
};

export const LIBELLE_MOYEN_PAIEMENT: Record<string, string> = {
  ESPECES: "Espèces",
  ORANGE_MONEY: "Orange Money",
  VIREMENT: "Virement bancaire",
  CHEQUE: "Chèque",
  AUTRE: "Autre",
};


/** Initiales pour l'avatar : « Mamadou Diallo » → « MD ». */
export function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Ce pour quoi un camion roule.
 *
 * Toutes les missions ne transportent pas : on va aussi à l'atelier ou
 * repositionner le véhicule. Le motif commande la suite — une course d'atelier
 * ne se facture pas et ne se rémunère pas comme un transport.
 */
export const LIBELLE_MOTIF_VOYAGE: Record<string, string> = {
  TRANSPORT: "Transport de marchandise",
  RECUPERATION_MARCHANDISE: "Aller chercher la marchandise",
  REPARATION: "Atelier / réparation",
  REPOSITIONNEMENT: "Repositionnement du camion",
  AUTRE: "Autre motif",
};

/** Motifs qui ne transportent rien : la mission part à vide et ne se facture pas. */
export const MOTIFS_SANS_MARCHANDISE = ["REPARATION", "REPOSITIONNEMENT", "AUTRE"];
