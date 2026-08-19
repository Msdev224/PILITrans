import type { Camion, Reparation } from "@prisma/client";

import { joursEntre } from "@/lib/calculs";
import { dansPeriode, type Periode } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { debutDeJour, n } from "@/lib/utils";

export interface LigneReparation {
  reparation: Reparation & { camion: Camion };
  coutGnf: number;
  /** Jours d'immobilisation, en cours ou clos. */
  joursImmobilise: number | null;
  enCours: boolean;
}

export type FiltreReparation = "toutes" | "a-faire" | "en-cours" | "terminees" | "immobilisantes";

export const FILTRES_REPARATION: { cle: FiltreReparation; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "a-faire", libelle: "À faire" },
  { cle: "en-cours", libelle: "En cours" },
  { cle: "terminees", libelle: "Terminées" },
  { cle: "immobilisantes", libelle: "Immobilisantes" },
];

export function estFiltreReparation(v: string | undefined): v is FiltreReparation {
  return FILTRES_REPARATION.some((f) => f.cle === v);
}

export interface StatsReparations {
  aFaire: number;
  enCours: number;
  coutMoisGnf: number;
  joursImmobilisation: number;
}

/** Vue transversale : toutes les réparations du parc, tous camions confondus. */
export async function vueReparations(
  periode: Periode,
  options: { filtre?: FiltreReparation; aujourdhui?: Date } = {},
): Promise<{ lignes: LigneReparation[]; stats: StatsReparations; total: number }> {
  const { filtre = "toutes", aujourdhui = new Date() } = options;
  const ceJour = debutDeJour(aujourdhui);

  const reparations = await prisma.reparation.findMany({
    include: { camion: true },
    orderBy: [{ statut: "asc" }, { createdAt: "desc" }],
  });

  const toutes: LigneReparation[] = reparations.map((reparation) => {
    const enCours = reparation.statut === "EN_COURS";
    // Une immobilisation close se compte jusqu'à sa fin ; en cours, jusqu'à ce jour.
    const joursImmobilise = reparation.immobiliseDu
      ? joursEntre(reparation.immobiliseDu, reparation.immobiliseAu ?? ceJour)
      : null;

    return { reparation, coutGnf: n(reparation.coutTotalGnf), joursImmobilise, enCours };
  });

  const duMois = toutes.filter((l) =>
    dansPeriode(l.reparation.immobiliseDu ?? l.reparation.createdAt, periode),
  );

  const stats: StatsReparations = {
    aFaire: toutes.filter((l) => l.reparation.statut === "A_FAIRE").length,
    enCours: toutes.filter((l) => l.enCours).length,
    coutMoisGnf: duMois.reduce((total, l) => total + l.coutGnf, 0),
    // Jours perdus : seules les immobilisations non closes pèsent aujourd'hui.
    joursImmobilisation: toutes
      .filter((l) => l.reparation.immobiliseDu && !l.reparation.immobiliseAu)
      .reduce((total, l) => total + (l.joursImmobilise ?? 0), 0),
  };

  const parFiltre: Record<FiltreReparation, (l: LigneReparation) => boolean> = {
    toutes: () => true,
    "a-faire": (l) => l.reparation.statut === "A_FAIRE",
    "en-cours": (l) => l.enCours,
    terminees: (l) => l.reparation.statut === "TERMINEE",
    immobilisantes: (l) => l.reparation.immobiliseDu != null && l.reparation.immobiliseAu == null,
  };

  return { lignes: toutes.filter(parFiltre[filtre]), stats, total: toutes.length };
}
