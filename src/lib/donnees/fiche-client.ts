import "server-only";

import { creances } from "@/lib/calculs";
import { INCLURE_LIGNES, vueLignes, type LigneVue } from "@/lib/donnees/marchandises";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

/**
 * Tout ce qui concerne un client, en un seul endroit.
 *
 * Le gérant raisonne par client — « où en est Baldé ? » — bien plus souvent
 * que par voyage isolé. Sans cette vue, il fallait fouiller trois écrans pour
 * répondre.
 */

export interface MissionClient {
  id: string;
  reference: string;
  trajet: string;
  dateDepart: Date;
  statut: string;
  recetteGnf: number;
  aVide: boolean;
  vaChercher: boolean;
  facture: { id: string; numero: string; statut: string } | null;
  marchandises: LigneVue[];
}

export interface FactureClient {
  id: string;
  numero: string;
  dateEmission: Date;
  echeance: Date | null;
  montantGnf: number;
  payeGnf: number;
  resteGnf: number;
  statut: string;
}

export interface FicheClient {
  client: {
    id: string;
    nom: string;
    ville: string | null;
    adresse: string | null;
    telephone: string | null;
    email: string | null;
    contact: string | null;
    telephoneContact: string | null;
    nif: string | null;
    whatsapp: boolean;
  };
  missions: MissionClient[];
  factures: FactureClient[];
  /** Encours, part échue et total encaissé — via `creances()` du cœur métier. */
  encoursGnf: number;
  enRetardGnf: number;
  encaisseGnf: number;
  recetteTotaleGnf: number;
  nbReclamationsOuvertes: number;
}

export async function ficheClient(
  clientId: string,
  aujourdhui: Date = new Date(),
): Promise<FicheClient | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;

  const [voyages, factures, reclamations] = await Promise.all([
    prisma.voyage.findMany({
      // Les marchandises destinées à ce client comptent aussi, même quand la
      // mission a été ouverte au nom d'un autre.
      where: {
        statut: { not: "ANNULE" },
        OR: [{ clientId }, { lignes: { some: { clientId } } }],
      },
      include: { lignes: INCLURE_LIGNES, factures: true },
      orderBy: { dateDepart: "desc" },
    }),
    prisma.facture.findMany({
      where: { clientId },
      include: { paiements: true },
      orderBy: { dateEmission: "desc" },
    }),
    prisma.reclamation.count({ where: { clientId, statut: { not: "RESOLUE" } } }),
  ]);

  const etatCreances = creances(
    factures.map((f) => ({
      montantGnf: n(f.montantGnf),
      totalTtcGnf: n(f.totalTtcGnf),
      montantPayeGnf: n(f.montantPayeGnf),
      statut: f.statut as "EMISE" | "PARTIELLE" | "PAYEE" | "EN_RETARD",
      echeance: f.echeance ?? undefined,
    })),
    aujourdhui,
  );

  return {
    client: {
      id: client.id,
      nom: client.nom,
      ville: client.ville,
      adresse: client.adresse,
      telephone: client.telephone,
      email: client.email,
      contact: client.contact,
      telephoneContact: client.telephoneContact,
      nif: client.nif,
      whatsapp: client.whatsapp,
    },
    missions: voyages.map((v) => {
      const f = v.factures[0];
      return {
        id: v.id,
        reference: v.reference,
        trajet: `${v.villeDepart} → ${v.villeArrivee}`,
        dateDepart: v.dateDepart,
        statut: v.statut,
        recetteGnf: n(v.recetteGnf),
        aVide: v.aVide,
        vaChercher: v.vaChercher,
        facture: f ? { id: f.id, numero: f.numero, statut: f.statut } : null,
        marchandises: vueLignes(v.lignes),
      };
    }),
    factures: factures.map((f) => ({
      id: f.id,
      numero: f.numero,
      dateEmission: f.dateEmission,
      echeance: f.echeance,
      montantGnf: n(f.montantGnf),
      totalTtcGnf: n(f.totalTtcGnf),
      payeGnf: n(f.montantPayeGnf),
      resteGnf: Math.max(n(f.montantGnf) - n(f.montantPayeGnf), 0),
      statut: f.statut,
    })),
    encoursGnf: etatCreances.encours,
    enRetardGnf: etatCreances.enRetard,
    encaisseGnf: etatCreances.encaisse,
    recetteTotaleGnf: voyages.reduce((t, v) => t + n(v.recetteGnf), 0),
    nbReclamationsOuvertes: reclamations,
  };
}
