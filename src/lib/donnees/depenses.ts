import type { Camion, Depense, Voyage } from "@prisma/client";

import { dansPeriode, type Periode } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export interface LigneDepense {
  depense: Depense & { voyage: (Voyage & { camion: Camion }) | null; camion: Camion | null };
  montantGnf: number;
  /** Taux réellement appliqué à la transaction, relu depuis les montants figés. */
  tauxApplique: number | null;
  litres: number | null;
}

export type FiltreDepense =
  | "toutes"
  | "gasoil"
  | "groupe-froid"
  | "douane"
  | "internet"
  | "divers";

export const FILTRES_DEPENSE: { cle: FiltreDepense; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "gasoil", libelle: "Gasoil" },
  { cle: "groupe-froid", libelle: "Groupe froid" },
  { cle: "douane", libelle: "Douane / frontière" },
  { cle: "internet", libelle: "Internet" },
  { cle: "divers", libelle: "Divers" },
];

export function estFiltreDepense(valeur: string | undefined): valeur is FiltreDepense {
  return FILTRES_DEPENSE.some((f) => f.cle === valeur);
}

const TYPES_PAR_FILTRE: Record<FiltreDepense, string[] | null> = {
  toutes: null,
  gasoil: ["GASOIL_TRACTEUR"],
  "groupe-froid": ["GASOIL_GROUPE_FROID"],
  douane: ["DOUANE", "FRONTIERE", "PEAGE"],
  internet: ["INTERNET"],
  divers: ["PER_DIEM", "DIVERS"],
};

export interface StatsDepenses {
  totalMoisGnf: number;
  gasoilMoisGnf: number;
  litresMois: number;
  partDeviseGnf: number;
}

export interface VueDepenses {
  lignes: LigneDepense[];
  stats: StatsDepenses;
  total: number;
}

function construireLigne(
  depense: LigneDepense["depense"],
): LigneDepense {
  const montant = n(depense.montant);
  const montantGnf = n(depense.montantGnf);

  return {
    depense,
    montantGnf,
    // Le taux ne se stocke pas : il se relit en divisant l'équivalent figé
    // par le montant d'origine (cf. commentaire du schéma Prisma).
    tauxApplique: depense.devise !== "GNF" && montant > 0 ? montantGnf / montant : null,
    litres: depense.litres != null ? n(depense.litres) : null,
  };
}

/** Liste des dépenses, filtrée, avec les totaux du mois. */
export async function vueDepenses(
  periode: Periode,
  options: { filtre?: FiltreDepense; recherche?: string } = {},
): Promise<VueDepenses> {
  const { filtre = "toutes", recherche = "" } = options;

  // L'écran est mensuel : ramener tout l'historique pour n'en afficher qu'un
  // mois faisait grossir la requête indéfiniment, sans rien montrer de plus.
  const depenses = await prisma.depense.findMany({
    where: { date: { gte: periode.debut, lt: periode.fin } },
    include: { voyage: { include: { camion: true } }, camion: true },
    orderBy: { date: "desc" },
  });

  const toutes = depenses.map(construireLigne);
  const duMois = toutes.filter((l) => dansPeriode(l.depense.date, periode));

  const estGasoil = (l: LigneDepense) =>
    l.depense.type === "GASOIL_TRACTEUR" || l.depense.type === "GASOIL_GROUPE_FROID";

  const stats: StatsDepenses = {
    totalMoisGnf: duMois.reduce((total, l) => total + l.montantGnf, 0),
    gasoilMoisGnf: duMois.filter(estGasoil).reduce((total, l) => total + l.montantGnf, 0),
    litresMois: duMois.reduce((total, l) => total + (l.litres ?? 0), 0),
    partDeviseGnf: duMois
      .filter((l) => l.depense.devise !== "GNF")
      .reduce((total, l) => total + l.montantGnf, 0),
  };

  const types = TYPES_PAR_FILTRE[filtre];
  let lignes = types ? toutes.filter((l) => types.includes(l.depense.type)) : toutes;

  const terme = recherche.trim().toLowerCase();
  if (terme) {
    lignes = lignes.filter((l) =>
      [
        l.depense.description,
        l.depense.voyage?.villeDepart,
        l.depense.voyage?.villeArrivee,
        l.depense.voyage?.reference,
        l.depense.voyage?.camion.nom,
        l.depense.camion?.nom,
      ]
        .filter(Boolean)
        .some((champ) => champ!.toLowerCase().includes(terme)),
    );
  }

  return { lignes, stats, total: toutes.length };
}
