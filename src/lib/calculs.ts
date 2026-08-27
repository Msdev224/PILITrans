// ============================================================
//  MS Trans — cœur métier (fonctions pures, sans framework)
//  Réutilisable tel quel dans le build Next.js / Server Actions.
// ============================================================

export type Devise = "GNF" | "XOF";

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : 0);

// ---------- Devises ----------
/** Équivalent GNF d'un montant, au taux RÉEL saisi pour la transaction. */
export function equivalentGnf(montant: number, devise: Devise, tauxApplique = 1): number {
  return devise === "GNF" ? montant : round(montant * tauxApplique);
}

// ---------- Caisse chauffeur (multi-devise) ----------
export type TypeMouvement = "AVANCE" | "DEPENSE" | "REMBOURSEMENT";
export interface MouvementCaisse { type: TypeMouvement; montant: number; devise: Devise; montantGnf: number; }
// AVANCE augmente ce que le chauffeur détient ; DEPENSE justifiée et REMBOURSEMENT le réduisent.
const signe = (t: TypeMouvement) => (t === "AVANCE" ? 1 : -1);

/** Solde par devise (réconciliation du cash physique) + consolidé en GNF (compta). */
export function soldeCaisse(mvts: MouvementCaisse[]) {
  const parDevise: Record<Devise, number> = { GNF: 0, XOF: 0 };
  let consolideGnf = 0;
  for (const m of mvts) {
    parDevise[m.devise] += signe(m.type) * m.montant;
    consolideGnf += signe(m.type) * m.montantGnf;
  }
  return { parDevise, consolideGnf };
}

// ---------- Carburant / consommation (avec pleins) ----------
export interface Troncon {
  kmDepart: number; kmArrivee: number;
  carburantRestantDepart: number;   // litres restants dans le réservoir au départ
  carburantRestantArrivee: number;  // litres restants à l'arrivée
  pleins: number[];                 // litres ajoutés en route pendant le tronçon
}
/** Conso d'un tronçon : restant départ + pleins − restant arrivée, rapporté à la distance. */
export function consoTroncon(t: Troncon) {
  const distance = t.kmArrivee - t.kmDepart;
  const pleins = t.pleins.reduce((a, b) => a + b, 0);
  const litresConsommes = t.carburantRestantDepart + pleins - t.carburantRestantArrivee;
  return {
    distance,
    pleins,
    litresConsommes,
    litresPer100km: distance > 0 ? round1((litresConsommes / distance) * 100) : 0,
  };
}

// ---------- Rentabilité par camion ----------
export interface CoutsCamion {
  recetteGnf: number; gasoilGnf: number; autresDepensesGnf: number;
  reparationsGnf: number; entretiensGnf: number;
  remunerationGnf?: number;   // paie chauffeur (variable) affectée au camion
  amortissementGnf?: number;  // quote-part du coût d'acquisition
}
/** Marge d'exploitation (hors amortissement) ET marge nette (après amortissement). */
export function margeCamion(c: CoutsCamion) {
  const exploitation = c.gasoilGnf + c.autresDepensesGnf + c.reparationsGnf + c.entretiensGnf + (c.remunerationGnf ?? 0);
  const amortissement = c.amortissementGnf ?? 0;
  const couts = exploitation + amortissement;
  return {
    couts,
    margeExploitation: c.recetteGnf - exploitation,
    marge: c.recetteGnf - couts, // marge nette après amortissement
  };
}
export const coutParKm = (coutsGnf: number, km: number) => (km > 0 ? round(coutsGnf / km) : 0);
export const recetteParKm = (recetteGnf: number, km: number) => (km > 0 ? round(recetteGnf / km) : 0);
export const margeParKm = (margeGnf: number, km: number) => (km > 0 ? round(margeGnf / km) : 0);

// ---------- Indicateurs de flotte ----------
export const tauxAVide = (kmAVide: number, kmTotal: number) => pct(kmAVide, kmTotal);
export const tauxUtilisation = (joursRoulage: number, joursDispo: number) => pct(joursRoulage, joursDispo);
export const ratioCarburantRecette = (carburantGnf: number, recetteGnf: number) => pct(carburantGnf, recetteGnf);

// ---------- Créances / facturation ----------
export type StatutFacture = "EMISE" | "PARTIELLE" | "PAYEE" | "EN_RETARD";
export interface Facture { montantGnf: number; montantPayeGnf: number; statut: StatutFacture; echeance?: Date; }
/** Encours à recevoir, part en retard, et total encaissé — tout en GNF. */
export function creances(factures: Facture[], aujourdhui = new Date()) {
  let encours = 0, enRetard = 0, encaisse = 0;
  for (const f of factures) {
    encaisse += f.montantPayeGnf;
    if (f.statut === "PAYEE") continue;
    const reste = f.montantGnf - f.montantPayeGnf;
    encours += reste;
    const echu = f.statut === "EN_RETARD" || (f.echeance !== undefined && f.echeance < aujourdhui);
    if (echu) enRetard += reste;
  }
  return { encours, enRetard, encaisse };
}

// ---------- Chaîne du froid ----------
export function conformiteFroid(temp: number, consigne: number, tolerance = 1.0): "CONFORME" | "ALERTE" | "RUPTURE" {
  const ecart = Math.abs(temp - consigne);
  if (ecart <= tolerance) return "CONFORME";
  if (ecart <= tolerance * 2) return "ALERTE";
  return "RUPTURE";
}


// ---------- Rémunération chauffeur (VARIABLE selon le mode) ----------
export type ModeRemuneration = "FORFAIT_VOYAGE" | "COMMISSION" | "PAR_KM" | "FIXE_MENSUEL" | "MIXTE";
/** Paie d'un chauffeur pour un voyage. `taux` = montant/voyage, %/recette, ou montant/km selon le mode. */
export function remunerationVoyage(p: {
  mode: ModeRemuneration; taux: number; recetteGnf?: number; km?: number; forfait?: number;
}): number {
  const { mode, taux, recetteGnf = 0, km = 0, forfait = 0 } = p;
  switch (mode) {
    case "FORFAIT_VOYAGE": return round(taux);
    case "COMMISSION":     return round((taux / 100) * recetteGnf);
    case "PAR_KM":         return round(taux * km);
    case "MIXTE":          return round(forfait + (taux / 100) * recetteGnf);
    case "FIXE_MENSUEL":   return 0; // payé au mois, hors coût par voyage
  }
}

// ---------- Acquisition & coût de possession ----------
/** Amortissement mensuel linéaire du coût d'acquisition. */
export const amortissementMensuel = (coutAcquisition: number, dureeMois = 60) =>
  (dureeMois > 0 ? round(coutAcquisition / dureeMois) : 0);
/** Mois pour rembourser l'achat, à marge mensuelle moyenne donnée (payback). */
export const paybackMois = (coutAcquisition: number, margeMensuelleMoy: number) =>
  (margeMensuelleMoy > 0 ? round1(coutAcquisition / margeMensuelleMoy) : Infinity);

// ---------- Historique & suggestion de trajet ----------
export interface TrajetHistorique {
  villeDepart: string; villeArrivee: string;
  distanceKm: number; litresConsommes: number; recetteGnf?: number;
}
const normVille = (v: string) => v.trim().toLowerCase();
/** "direct" si A→B, "inverse" si B→A, sinon null. */
function sensTrajet(h: { villeDepart: string; villeArrivee: string }, depart: string, arrivee: string): "direct" | "inverse" | null {
  const d = normVille(depart), r = normVille(arrivee);
  const hd = normVille(h.villeDepart), ha = normVille(h.villeArrivee);
  if (hd === d && ha === r) return "direct";
  if (hd === r && ha === d) return "inverse";
  return null;
}
/** Cherche les trajets passés identiques OU inverses et propose une estimation moyenne. */
export function proposerTrajet(historique: TrajetHistorique[], depart: string, arrivee: string) {
  const matches = historique.filter(h => sensTrajet(h, depart, arrivee) !== null);
  if (matches.length === 0) return { trouve: false as const, occurrences: 0 };
  const moy = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const distanceMoyKm = moy(matches.map(m => m.distanceKm));
  const carburantMoyL = moy(matches.map(m => m.litresConsommes));
  const recettes = matches.map(m => m.recetteGnf).filter((x): x is number => x != null);
  return {
    trouve: true as const,
    occurrences: matches.length,
    inverseInclus: matches.some(m => sensTrajet(m, depart, arrivee) === "inverse"),
    distanceMoyKm,
    carburantMoyL,
    consoMoyL100: distanceMoyKm > 0 ? round1((carburantMoyL / distanceMoyKm) * 100) : 0,
    recetteMoyGnf: recettes.length ? moy(recettes) : undefined,
  };
}

// ---------- Attente de chargement ----------
/** Jours écoulés entre deux dates (>= 0). Ex. attente avant chargement. */
export const joursEntre = (debut: Date, fin: Date) =>
  Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 86_400_000));

// ---------- Réconciliation des quantités (chargement → livraison) ----------
/** Écart entre la quantité reçue au chargement et la quantité livrée (perte/vol/coulage). */
export function ecartLivraison(recueTonnes: number, livreeTonnes: number) {
  const manquant = round1(recueTonnes - livreeTonnes);
  const pct = recueTonnes > 0 ? round1((manquant / recueTonnes) * 100) : 0;
  return { manquant, pct };
}
