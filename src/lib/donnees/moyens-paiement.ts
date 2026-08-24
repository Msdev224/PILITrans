import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

export interface OptionMoyen {
  id: string;
  nom: string;
}

/**
 * Moyens de paiement proposés à la saisie.
 *
 * Seuls les actifs : un moyen retiré du service ne doit plus apparaître dans
 * les listes, mais les écritures passées gardent le leur — c'est pourquoi on
 * désactive au lieu de supprimer.
 *
 * `cache()` déduplique l'appel sur un même rendu : plusieurs formulaires d'un
 * même écran demandent la liste, et sans cela la requête partirait autant de
 * fois qu'il y a de dialogues.
 */
export const moyensActifs = cache(async (): Promise<OptionMoyen[]> => {
  return prisma.moyenPaiement.findMany({
    where: { actif: true },
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true },
  });
});

/** Tous les moyens, actifs ou non — pour l'écran de configuration. */
export const tousLesMoyens = cache(async () => {
  return prisma.moyenPaiement.findMany({
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    include: {
      _count: { select: { paiements: true, mouvements: true, depenses: true } },
    },
  });
});
