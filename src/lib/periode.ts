import { formatDate, formatMois } from "@/lib/utils";

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

// ------------------------------------------------------------
//  Autres découpages
//
//  Le mois est la maille de pilotage, mais une exploitation regarde aussi
//  la journée — ce qu'a rapporté aujourd'hui — et l'année, pour comparer une
//  saison à la précédente.
// ------------------------------------------------------------

export type TypePeriode = "JOUR" | "SEMAINE" | "MOIS" | "TRIMESTRE" | "SEMESTRE" | "ANNEE";

export const LIBELLE_TYPE_PERIODE: Record<TypePeriode, string> = {
  JOUR: "Jour",
  SEMAINE: "Semaine",
  MOIS: "Mois",
  TRIMESTRE: "Trimestre",
  SEMESTRE: "Semestre",
  ANNEE: "Année",
};

const jourMeme = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function jourCourant(reference: Date = new Date()): Periode {
  const debut = jourMeme(reference);
  const fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 1);
  return { debut, fin, libelle: formatDate(debut) };
}

/** Semaine du lundi au dimanche : la semaine de travail, pas la semaine ISO. */
export function semaineCourante(reference: Date = new Date()): Periode {
  const jour = jourMeme(reference);
  // getDay() rend 0 pour dimanche : on le ramène en fin de semaine.
  const decalage = (jour.getDay() + 6) % 7;
  const debut = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate() - decalage);
  const fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 7);
  const veille = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - 1);
  return { debut, fin, libelle: `du ${formatDate(debut)} au ${formatDate(veille)}` };
}

export function trimestreCourant(reference: Date = new Date()): Periode {
  const rang = Math.floor(reference.getMonth() / 3);
  const debut = new Date(reference.getFullYear(), rang * 3, 1);
  const fin = new Date(reference.getFullYear(), rang * 3 + 3, 1);
  return { debut, fin, libelle: `T${rang + 1} ${debut.getFullYear()}` };
}

export function semestreCourant(reference: Date = new Date()): Periode {
  const rang = reference.getMonth() < 6 ? 0 : 1;
  const debut = new Date(reference.getFullYear(), rang * 6, 1);
  const fin = new Date(reference.getFullYear(), rang * 6 + 6, 1);
  return { debut, fin, libelle: `S${rang + 1} ${debut.getFullYear()}` };
}

export function anneeCourante(reference: Date = new Date()): Periode {
  const debut = new Date(reference.getFullYear(), 0, 1);
  const fin = new Date(reference.getFullYear() + 1, 0, 1);
  return { debut, fin, libelle: String(debut.getFullYear()) };
}

/** Période bornée à la main, pour une analyse ponctuelle. */
export function periodePersonnalisee(debut: Date, fin: Date): Periode {
  const d = jourMeme(debut);
  // La borne haute est exclusive : on inclut le dernier jour choisi.
  const f = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1);
  return { debut: d, fin: f, libelle: `du ${formatDate(d)} au ${formatDate(jourMeme(fin))}` };
}

export function periodeDeType(type: TypePeriode, reference: Date = new Date()): Periode {
  switch (type) {
    case "JOUR":
      return jourCourant(reference);
    case "SEMAINE":
      return semaineCourante(reference);
    case "TRIMESTRE":
      return trimestreCourant(reference);
    case "SEMESTRE":
      return semestreCourant(reference);
    case "ANNEE":
      return anneeCourante(reference);
    default:
      return moisCourant(reference);
  }
}

/**
 * La période équivalente juste avant, quelle que soit sa nature.
 *
 * Comparer un mois à un mois, un trimestre à un trimestre : comparer des
 * durées inégales donnerait des variations qui ne veulent rien dire.
 */
export function periodePrecedente(periode: Periode, type: TypePeriode): Periode {
  const { debut } = periode;
  switch (type) {
    case "JOUR":
      return jourCourant(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() - 1));
    case "SEMAINE":
      return semaineCourante(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() - 7));
    case "TRIMESTRE":
      return trimestreCourant(new Date(debut.getFullYear(), debut.getMonth() - 3, 1));
    case "SEMESTRE":
      return semestreCourant(new Date(debut.getFullYear(), debut.getMonth() - 6, 1));
    case "ANNEE":
      return anneeCourante(new Date(debut.getFullYear() - 1, 0, 1));
    default:
      return moisPrecedent(periode);
  }
}
