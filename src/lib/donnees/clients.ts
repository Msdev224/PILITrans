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

  // Le voyage référence désormais le client : on compte par identifiant.
  // Le rapprochement par nom qu'il fallait faire avant ratait dès qu'une
  // orthographe différait d'un caractère.
  const voyages = await prisma.voyage.groupBy({
    by: ["clientId"],
    where: { statut: { not: "ANNULE" }, clientId: { not: null } },
    _count: { _all: true },
  });

  const parId = new Map<string, number>();
  for (const v of voyages) if (v.clientId) parId.set(v.clientId, v._count._all);

  return clients.map((client) => {
    const situation = creances(
      client.factures.map((f) => ({
        montantGnf: n(f.montantGnf),
        totalTtcGnf: n(f.totalTtcGnf),
        montantPayeGnf: n(f.montantPayeGnf),
        statut: f.statut,
        echeance: f.echeance ?? undefined,
      })),
      aujourdhui,
    );

    return {
      client,
      nbVoyages: parId.get(client.id) ?? 0,
      nbFactures: client.factures.length,
      encoursGnf: situation.encours,
      enRetardGnf: situation.enRetard,
      encaisseGnf: situation.encaisse,
    };
  });
}
