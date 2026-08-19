import { formatMois } from "@/lib/utils";

export interface Periode {
  debut: Date;
  /** Borne haute exclusive. */
  fin: Date;
  libelle: string;
}

/** Le mois calendaire contenant `reference` (par défaut : aujourd'hui). */
export function moisCourant(reference: Date = new Date()): Periode {
  const debut = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const fin = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  return { debut, fin, libelle: formatMois(debut) };
}

/** Le mois précédant `periode` — sert aux comparaisons « vs mois dernier ». */
export function moisPrecedent(periode: Periode): Periode {
  const debut = new Date(periode.debut.getFullYear(), periode.debut.getMonth() - 1, 1);
  return { debut, fin: periode.debut, libelle: formatMois(debut) };
}

export function dansPeriode(date: Date | null | undefined, periode: Periode): boolean {
  if (!date) return false;
  return date >= periode.debut && date < periode.fin;
}

/** Variation en % entre deux valeurs ; `null` si le point de départ est nul. */
export function variation(actuel: number, precedent: number): number | null {
  if (precedent === 0) return null;
  return Math.round(((actuel - precedent) / Math.abs(precedent)) * 100);
}
