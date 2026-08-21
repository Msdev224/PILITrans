import type { StatutVoyage } from "@prisma/client";

import { INCLURE_LIGNES, vueLignes } from "@/lib/donnees/marchandises";
import { formatQuantite } from "@/lib/donnees/unites";
import { prisma } from "@/lib/prisma";
import {
  lienFacture,
  messageAffectation,
  messageArrivee,
  messageDepart,
  messageFacture,
  messageLivraison,
  messageRelance,
  notifier,
} from "@/lib/sms/notifications";
import { n } from "@/lib/utils";

/**
 * Rattachement des notifications aux étapes réelles du transport.
 *
 * Le client est stocké en texte libre sur le voyage : on retrouve sa fiche
 * par correspondance de nom pour récupérer son téléphone. Sans fiche client
 * ou sans numéro, aucun SMS n'est produit — il n'y a personne à prévenir.
 */
/**
 * Client destinataire des notifications d'une mission.
 *
 * Recherche par identifiant : le rapprochement par nom qu'il fallait faire
 * avant échouait dès qu'une orthographe différait, et le client n'était alors
 * jamais prévenu — sans que rien ne le signale.
 */
async function clientDuVoyage(clientId: string | null) {
  if (!clientId) return null;
  return prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, nom: true, telephone: true, whatsapp: true, whatsappNumero: true },
  });
}

/** Étape du transport → événement SMS. Les autres états ne notifient pas. */
const EVENEMENT_PAR_STATUT: Partial<
  Record<StatutVoyage, "CLIENT_DEPART" | "CLIENT_ARRIVEE" | "CLIENT_LIVRAISON">
> = {
  EN_COURS: "CLIENT_DEPART",
  ARRIVE_DESTINATION: "CLIENT_ARRIVEE",
  TERMINE: "CLIENT_LIVRAISON",
};

/** Prévient le client du passage d'une mission à une nouvelle étape. */
export async function notifierEtapeVoyage(voyageId: string, statut: StatutVoyage) {
  const evenement = EVENEMENT_PAR_STATUT[statut];
  if (!evenement) return;

  const [voyage, parametres] = await Promise.all([
    prisma.voyage.findUnique({ where: { id: voyageId }, include: { lignes: INCLURE_LIGNES } }),
    prisma.parametres.findFirst(),
  ]);
  if (!voyage) return;

  const client = await clientDuVoyage(voyage.clientId);
  if (!client?.telephone) return;

  const trajet = `${voyage.villeDepart} → ${voyage.villeArrivee}`;
  const lignes = vueLignes(voyage.lignes);

  // Un chargement mixte se décrit article par article : « 12 t + 240 sacs ».
  // Un total serait faux dès que les unités diffèrent.
  const marchandises = lignes.map((l) => l.designation).join(", ") || null;
  const livrees =
    lignes
      .filter((l) => l.quantiteLivree != null)
      .map((l) => formatQuantite(l.quantiteLivree, l.symbole))
      .join(" + ") || null;

  const message =
    evenement === "CLIENT_DEPART"
      ? messageDepart(parametres, trajet, marchandises)
      : evenement === "CLIENT_ARRIVEE"
        ? messageArrivee(parametres, voyage.villeArrivee)
        : messageLivraison(parametres, voyage.villeArrivee, livrees);

  await notifier({
    evenement,
    destinataire: client.telephone,
    whatsapp: client.whatsapp,
    whatsappNumero: client.whatsappNumero,
    nom: client.nom,
    message,
    voyageId: voyage.id,
    clientId: client.id,
  });
}

/** Prévient le chauffeur qu'une mission lui est attribuée. */
export async function notifierAffectationChauffeur(voyageId: string) {
  const [voyage, parametres] = await Promise.all([
    prisma.voyage.findUnique({
      where: { id: voyageId },
      include: { chauffeur: true, camion: { select: { nom: true } } },
    }),
    prisma.parametres.findFirst(),
  ]);
  if (!voyage?.chauffeur.telephone) return;

  await notifier({
    evenement: "CHAUFFEUR_AFFECTATION",
    destinataire: voyage.chauffeur.telephone,
    whatsapp: voyage.chauffeur.whatsapp,
    whatsappNumero: voyage.chauffeur.whatsappNumero,
    nom: voyage.chauffeur.nom,
    message: messageAffectation(
      parametres,
      `${voyage.villeDepart} → ${voyage.villeArrivee}`,
      voyage.camion.nom,
      voyage.dateDepart,
    ),
    voyageId: voyage.id,
    chauffeurId: voyage.chauffeurId,
  });
}

/** Transmet au client sa facture et le lien pour la consulter. */
export async function notifierFacture(factureId: string) {
  const [facture, parametres] = await Promise.all([
    prisma.facture.findUnique({ where: { id: factureId }, include: { client: true } }),
    prisma.parametres.findFirst(),
  ]);
  if (!facture?.client.telephone) return;

  await notifier({
    evenement: "CLIENT_FACTURE",
    destinataire: facture.client.telephone,
    whatsapp: facture.client.whatsapp,
    whatsappNumero: facture.client.whatsappNumero,
    nom: facture.client.nom,
    message: messageFacture(
      parametres,
      facture.numero,
      n(facture.montantGnf),
      facture.echeance,
      lienFacture(parametres, facture.id),
    ),
    factureId: facture.id,
    clientId: facture.clientId,
    voyageId: facture.voyageId,
  });
}

/** Relance une facture échue. Déclenchée à la main depuis l'écran Factures. */
export async function notifierRelance(factureId: string, joursRetard: number) {
  const [facture, parametres] = await Promise.all([
    prisma.facture.findUnique({ where: { id: factureId }, include: { client: true } }),
    prisma.parametres.findFirst(),
  ]);
  if (!facture?.client.telephone) return;

  const reste = n(facture.montantGnf) - n(facture.montantPayeGnf);
  if (reste <= 0) return;

  await notifier({
    evenement: "CLIENT_RELANCE",
    destinataire: facture.client.telephone,
    whatsapp: facture.client.whatsapp,
    whatsappNumero: facture.client.whatsappNumero,
    nom: facture.client.nom,
    message: messageRelance(
      parametres,
      facture.numero,
      reste,
      joursRetard,
      lienFacture(parametres, facture.id),
    ),
    factureId: facture.id,
    clientId: facture.clientId,
  });
}
