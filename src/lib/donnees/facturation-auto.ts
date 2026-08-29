import "server-only";

import { prisma } from "@/lib/prisma";
import { notifierFacture } from "@/lib/sms/declencheurs";
import { n } from "@/lib/utils";

/**
 * Émission des factures.
 *
 * Deux moments, et le premier l'emporte en pratique.
 *
 * **À la création de la mission** — dès qu'elle porte un client, un montant
 * convenu et une marchandise. La créance existe alors dès le départ du camion,
 * et la facture se retrouve dans la liste sans attendre.
 *
 * **À la confirmation de livraison** (`facturerSiLivre`) — filet pour les
 * missions créées sans montant, ou dont le client a été rattaché en route.
 * Elle ne fait rien si une facture existe déjà.
 *
 * Ce module documentait auparavant le choix inverse : n'émettre qu'à la
 * livraison, pour éviter les documents à corriger quand une quantité change.
 * L'arbitrage a été tranché autrement — une course facturable pouvait rouler
 * des jours sans apparaître nulle part. La contrepartie est réelle : si la
 * recette de la mission est modifiée après coup, la facture ne suit pas d'
 * elle-même. L'écart est signalé par une alerte, et la fiche du voyage propose
 * d'aligner l'un sur l'autre — délibérément, jamais tout seul.
 */

/**
 * Numéro libre pour l'année, au format `FAC-2026-001`.
 *
 * Exporté et utilisé aussi par la création manuelle : deux compteurs séparés
 * finiraient par attribuer le même numéro à deux factures.
 */
export async function numeroLibre(prefixe: string, annee: number) {
  const debut = `${prefixe}-${annee}`;
  const existantes = await prisma.facture.findMany({
    where: { numero: { startsWith: debut } },
    select: { numero: true },
  });

  const rangs = existantes
    .map((f) => Number.parseInt(f.numero.split("-")[2] ?? "", 10))
    .filter((r) => Number.isFinite(r));
  return `${debut}-${String((rangs.length ? Math.max(...rangs) : 0) + 1).padStart(3, "0")}`;
}

/**
 * Champs d'une facture émise depuis une mission.
 *
 * Rassemblés ici parce que trois chemins créent des factures — création
 * manuelle, émission à la livraison, émission à la création de la mission — et
 * qu'ils divergeaient : seul le premier posait la TVA et recopiait l'identité
 * de l'émetteur. Les factures automatiques sortaient donc sans taux, sans
 * total TTC et sans adresse, c'est-à-dire inexploitables comme pièces.
 */
export interface DonneesEmission {
  clientId: string;
  voyageId: string;
  montant: unknown;
  devise: "GNF" | "XOF";
  recetteGnf: number;
}

export async function champsFacture(d: DonneesEmission, dateEmission = new Date()) {
  const parametres = await prisma.parametres.findFirst();

  const echeance = new Date(
    dateEmission.getTime() + (parametres?.delaiPaiementJours ?? 14) * 86_400_000,
  );

  // La TVA est figée sur le document : le taux courant ne doit pas réécrire
  // une facture déjà partie chez le client.
  const tauxTva = n(parametres?.tvaTaux);
  const montantTvaGnf = Math.round((d.recetteGnf * tauxTva) / 100);

  return {
    numero: await numeroLibre(parametres?.prefixeFacture ?? "FAC", dateEmission.getFullYear()),
    clientId: d.clientId,
    voyageId: d.voyageId,
    montant: d.montant as never,
    devise: d.devise,
    montantGnf: d.recetteGnf,
    tauxTva,
    montantTvaGnf,
    totalTtcGnf: d.recetteGnf + montantTvaGnf,
    dateEmission,
    echeance,
    statut: "EMISE" as const,
    // Identité recopiée : une pièce comptable est opposable parce qu'elle ne
    // bouge plus.
    emetteurRaisonSociale: parametres?.raisonSociale ?? null,
    emetteurAdresse: parametres?.adresse ?? null,
    emetteurTelephone: parametres?.telephone ?? null,
    emetteurEmail: parametres?.email ?? null,
    emetteurRccm: parametres?.rccm ?? null,
    emetteurNif: parametres?.nif ?? null,
    emetteurOrangeMoney: parametres?.orangeMoney ?? null,
    emetteurBanque: parametres?.banque ?? null,
    emetteurCompte: parametres?.compteBancaire ?? null,
    emetteurConditions: parametres?.conditionsPaiement ?? null,
  };
}

export type ResultatFacturation =
  | { fait: true; factureId: string; numero: string }
  | { fait: false; motif: string };

/**
 * Émet la facture d'un voyage si la livraison est complète.
 *
 * Ne fait rien — et le dit — quand une condition manque. Chaque refus a une
 * raison lisible, parce qu'un gérant qui n'a pas vu partir sa facture doit
 * savoir pourquoi plutôt que de la croire perdue.
 */
export async function facturerSiLivre(voyageId: string): Promise<ResultatFacturation> {
  const voyage = await prisma.voyage.findUnique({
    where: { id: voyageId },
    include: { lignes: { select: { codeConfirmeLe: true, designation: true } }, factures: true },
  });
  if (!voyage) return { fait: false, motif: "Voyage introuvable." };

  if (voyage.factures.length > 0) {
    return { fait: false, motif: "Ce voyage est déjà facturé." };
  }
  if (!voyage.clientId) {
    return { fait: false, motif: "Aucun client rattaché à la mission : rien à facturer." };
  }

  const recetteGnf = n(voyage.recetteGnf);
  if (recetteGnf <= 0) {
    return { fait: false, motif: "Recette non renseignée : la facture serait à zéro." };
  }

  if (voyage.lignes.length === 0) {
    return { fait: false, motif: "Aucune marchandise déclarée sur la mission." };
  }

  // Toutes les marchandises doivent être confirmées : facturer alors qu'une
  // partie n'est pas remise reviendrait à réclamer ce qui n'a pas été livré.
  const restantes = voyage.lignes.filter((l) => !l.codeConfirmeLe);
  if (restantes.length > 0) {
    return {
      fait: false,
      motif: `Livraison incomplète : ${restantes.map((l) => l.designation).join(", ")} sans confirmation du client.`,
    };
  }

  const facture = await prisma.facture.create({
    data: await champsFacture({
      clientId: voyage.clientId,
      voyageId: voyage.id,
      montant: voyage.recette,
      devise: voyage.devise,
      recetteGnf,
    }),
  });

  // Le client reçoit sa facture et son lien, par le même canal que le reste.
  await notifierFacture(facture.id);

  return { fait: true, factureId: facture.id, numero: facture.numero };
}
