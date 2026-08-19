import type { Client } from "@prisma/client";

import { creances } from "@/lib/calculs";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export interface LigneClient {
  client: Client;
  nbVoyages: number;
  nbFactures: number;
  /** Encours et retard du client, calculés par `creances()`. */
  encoursGnf: number;
  enRetardGnf: number;
  encaisseGnf: number;
}

/** Liste des clients enrichie de leur situation financière. */
export async function vueClients(aujourdhui: Date = new Date()): Promise<LigneClient[]> {
  const clients = await prisma.client.findMany({
    include: { factures: true },
    orderBy: { nom: "asc" },
  });

  // Le voyage porte le nom du client en texte libre (champ dénormalisé du
  // schéma) : on compte donc par correspondance de nom.
  const voyages = await prisma.voyage.findMany({
    where: { statut: { not: "ANNULE" }, client: { not: null } },
    select: { client: true },
  });

  const parNom = new Map<string, number>();
  for (const v of voyages) {
    const cle = (v.client ?? "").trim().toLowerCase();
    parNom.set(cle, (parNom.get(cle) ?? 0) + 1);
  }

  return clients.map((client) => {
    const situation = creances(
      client.factures.map((f) => ({
        montantGnf: n(f.montantGnf),
        montantPayeGnf: n(f.montantPayeGnf),
        statut: f.statut,
        echeance: f.echeance ?? undefined,
      })),
      aujourdhui,
    );

    return {
      client,
      nbVoyages: parNom.get(client.nom.trim().toLowerCase()) ?? 0,
      nbFactures: client.factures.length,
      encoursGnf: situation.encours,
      enRetardGnf: situation.enRetard,
      encaisseGnf: situation.encaisse,
    };
  });
}
