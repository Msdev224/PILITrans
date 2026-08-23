import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * Lecture du journal des opérations.
 *
 * L'historique se consulte en remontant le temps, éventuellement filtré. Il
 * n'existe volontairement aucune fonction d'écriture ou de suppression ici :
 * le journal s'alimente par `journaliser()` et ne se réécrit jamais.
 */

export interface FiltreJournal {
  /** Type d'objet : `Facture`, `MouvementCaisse`, `Depense`, `Voyage`. */
  objet?: string;
  /** Auteur, pour répondre à « qu'a fait cette personne ». */
  auteurId?: string;
  /** Ne garder que les opérations portant sur de l'argent. */
  argentSeulement?: boolean;
  depuis?: Date;
  jusqua?: Date;
  limite?: number;
}

export const journal = cache(async (filtre: FiltreJournal = {}) => {
  const lignes = await prisma.journal.findMany({
    where: {
      ...(filtre.objet ? { objet: filtre.objet } : {}),
      ...(filtre.auteurId ? { auteurId: filtre.auteurId } : {}),
      ...(filtre.argentSeulement ? { montantGnf: { not: null } } : {}),
      ...(filtre.depuis || filtre.jusqua
        ? {
            date: {
              ...(filtre.depuis ? { gte: filtre.depuis } : {}),
              ...(filtre.jusqua ? { lt: filtre.jusqua } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    // Une borne par défaut : sans elle, l'écran ramènerait des années
    // d'historique et deviendrait inutilisable au bout de quelques mois.
    take: filtre.limite ?? 200,
  });

  return lignes;
});

/** Auteurs ayant laissé au moins une trace — pour le filtre par personne. */
export const auteursDuJournal = cache(async () => {
  const lignes = await prisma.journal.findMany({
    distinct: ["auteurId"],
    select: { auteurId: true, auteurNom: true },
    orderBy: { auteurNom: "asc" },
  });
  return lignes.filter((l) => l.auteurId !== null) as { auteurId: string; auteurNom: string }[];
});

/** Types d'objets présents dans le journal — pour le filtre par nature. */
export const objetsDuJournal = cache(async () => {
  const lignes = await prisma.journal.findMany({
    distinct: ["objet"],
    select: { objet: true },
    orderBy: { objet: "asc" },
  });
  return lignes.map((l) => l.objet);
});
