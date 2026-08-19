import type { Client, Facture, Reclamation, Voyage } from "@prisma/client";

import { ecartLivraison } from "@/lib/calculs";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export interface LigneReclamation {
  reclamation: Reclamation & {
    client: Client;
    voyage: Voyage | null;
    facture: Facture | null;
  };
  /** Quantité que le chauffeur déclare avoir livrée. */
  /** Marchandise contestée, avec son unité. Absente sur les réclamations non quantitatives. */
  marchandise: string | null;
  symbole: string;
  livree: number | null;
  recue: number | null;
  /** Écart entre la quantité contestée par le client et celle livrée. */
  ecartConteste: number | null;
  /** Écart déjà constaté sur la mission (reçue → livrée), via `ecartLivraison`. */
  perteMission: number | null;
  perteMissionPct: number | null;
  avoirGnf: number | null;
}

export type FiltreReclamation = "toutes" | "ouvertes" | "en-cours" | "resolues" | "rejetees";

export const FILTRES_RECLAMATION: { cle: FiltreReclamation; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "ouvertes", libelle: "Ouvertes" },
  { cle: "en-cours", libelle: "En cours" },
  { cle: "resolues", libelle: "Résolues" },
  { cle: "rejetees", libelle: "Rejetées" },
];

export function estFiltreReclamation(v: string | undefined): v is FiltreReclamation {
  return FILTRES_RECLAMATION.some((f) => f.cle === v);
}

const STATUT_PAR_FILTRE: Record<FiltreReclamation, string[] | null> = {
  toutes: null,
  ouvertes: ["OUVERTE"],
  "en-cours": ["EN_COURS"],
  resolues: ["RESOLUE"],
  rejetees: ["REJETEE"],
};

export interface StatsReclamations {
  ouvertes: number;
  enCours: number;
  avoirsAccordesGnf: number;
  tonnesContestees: number;
}

export async function vueReclamations(
  options: { filtre?: FiltreReclamation } = {},
): Promise<{ lignes: LigneReclamation[]; stats: StatsReclamations; total: number }> {
  const { filtre = "toutes" } = options;

  const reclamations = await prisma.reclamation.findMany({
    include: {
      client: true,
      voyage: true,
      facture: true,
      ligne: { include: { unite: { select: { symbole: true } } } },
    },
    orderBy: { dateOuverture: "desc" },
  });

  const toutes: LigneReclamation[] = reclamations.map((reclamation) => {
    // Les quantités se lisent sur la marchandise contestée, pas sur le voyage :
    // un chargement mixte n'a pas de quantité globale.
    const ligne = reclamation.ligne;
    const livree = ligne?.quantiteLivree != null ? n(ligne.quantiteLivree) : null;
    const recue = ligne?.quantiteRecue != null ? n(ligne.quantiteRecue) : null;
    const contestee =
      reclamation.quantiteContestee != null ? n(reclamation.quantiteContestee) : null;

    // Perte déjà constatée sur la mission, indépendante de la contestation.
    const perte = recue != null && livree != null ? ecartLivraison(recue, livree) : null;

    return {
      reclamation,
      marchandise: ligne?.designation ?? null,
      symbole: ligne?.unite.symbole ?? "",
      livree,
      recue,
      // Ce que le client conteste par rapport à ce que le chauffeur a déclaré.
      ecartConteste:
        contestee != null && livree != null ? Math.round((livree - contestee) * 1000) / 1000 : null,
      perteMission: perte?.manquant ?? null,
      perteMissionPct: perte?.pct ?? null,
      avoirGnf: reclamation.montantAvoirGnf != null ? n(reclamation.montantAvoirGnf) : null,
    };
  });

  const stats: StatsReclamations = {
    ouvertes: toutes.filter((l) => l.reclamation.statut === "OUVERTE").length,
    enCours: toutes.filter((l) => l.reclamation.statut === "EN_COURS").length,
    avoirsAccordesGnf: toutes
      .filter((l) => l.reclamation.statut === "RESOLUE")
      .reduce((total, l) => total + (l.avoirGnf ?? 0), 0),
    tonnesContestees: toutes
      .filter((l) => l.reclamation.statut !== "REJETEE" && l.ecartConteste != null)
      .reduce((total, l) => total + Math.max(l.ecartConteste ?? 0, 0), 0),
  };

  const statuts = STATUT_PAR_FILTRE[filtre];
  const lignes = statuts ? toutes.filter((l) => statuts.includes(l.reclamation.statut)) : toutes;

  return { lignes, stats, total: toutes.length };
}
