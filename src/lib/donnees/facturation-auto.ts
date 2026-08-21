import "server-only";

import { prisma } from "@/lib/prisma";
import { notifierFacture } from "@/lib/sms/declencheurs";
import { n } from "@/lib/utils";

/**
 * Facturation déclenchée par la livraison.
 *
 * La facture part quand la marchandise est **remise**, pas quand la mission
 * est créée : facturer d'avance produit des documents à corriger dès qu'une
 * quantité change ou qu'un poste de douane retient une part du chargement.
 *
 * Le déclencheur est la confirmation par code de la dernière marchandise du
 * voyage : c'est le seul moment où l'on sait que tout a été remis, et à qui.
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

  const parametres = await prisma.parametres.findFirst();
  const dateEmission = new Date();
  const echeance = new Date(
    dateEmission.getTime() + (parametres?.delaiPaiementJours ?? 14) * 86_400_000,
  );

  const facture = await prisma.facture.create({
    data: {
      numero: await numeroLibre(parametres?.prefixeFacture ?? "FAC", dateEmission.getFullYear()),
      clientId: voyage.clientId,
      voyageId: voyage.id,
      montant: voyage.recette,
      devise: voyage.devise,
      montantGnf: recetteGnf,
      dateEmission,
      echeance,
      statut: "EMISE",
    },
  });

  // Le client reçoit sa facture et son lien, par le même canal que le reste.
  await notifierFacture(facture.id);

  return { fait: true, factureId: facture.id, numero: facture.numero };
}
