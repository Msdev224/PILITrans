import type { EvenementSms, Parametres } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { envoyerSms, envoyerWhatsApp, normaliserNumero, smsConfigure } from "@/lib/sms/nimba";
import { formatDate, formatNombre } from "@/lib/utils";

/**
 * Mise en file et envoi des notifications SMS.
 *
 * Toute notification est d'abord **écrite en base**, puis envoyée si — et
 * seulement si — les SMS sont activés et les identifiants Nimba présents.
 * Sinon elle reste `EN_ATTENTE` : rien n'est perdu et la file se rejoue le
 * jour où les clés arrivent.
 */

/** Le déclencheur correspondant à chaque événement, dans les Paramètres. */
const INTERRUPTEUR: Record<EvenementSms, keyof Parametres | null> = {
  CHAUFFEUR_AFFECTATION: "smsChauffeurAffectation",
  CLIENT_DEPART: "smsClientDepart",
  CLIENT_ARRIVEE: "smsClientArrivee",
  CLIENT_LIVRAISON: "smsClientLivraison",
  CLIENT_FACTURE: "smsClientFacture",
  CLIENT_RELANCE: "smsClientRelance",
  // Le code de retrait n'a pas d'interrupteur : c'est le client qui le
  // réclame, et le refuser bloquerait la livraison.
  CLIENT_CODE_LIVRAISON: null,
  AUTRE: null,
};

export interface DemandeSms {
  evenement: EvenementSms;
  destinataire: string;
  /** Destinataire joignable sur WhatsApp, et son numéro s'il diffère. */
  whatsapp?: boolean;
  whatsappNumero?: string | null;
  nom?: string | null;
  message: string;
  voyageId?: string | null;
  factureId?: string | null;
  chauffeurId?: string | null;
  clientId?: string | null;
}

/**
 * Met une notification en file, et tente l'envoi si tout est en place.
 * Ne lève jamais : l'échec d'un SMS ne doit pas annuler l'opération métier.
 */
export async function notifier(demande: DemandeSms): Promise<void> {
  try {
    const parametres = await prisma.parametres.findFirst();
    const numero = normaliserNumero(demande.destinataire);

    // Un numéro inexploitable est journalisé en échec plutôt qu'ignoré :
    // le gérant doit pouvoir constater que le client n'a pas été prévenu.
    if (!numero) {
      await prisma.notificationSms.create({
        data: {
          evenement: demande.evenement,
          destinataire: demande.destinataire,
          nom: demande.nom ?? null,
          message: demande.message,
          statut: "ECHEC",
          erreur: "Numéro de téléphone inexploitable.",
          voyageId: demande.voyageId ?? null,
          factureId: demande.factureId ?? null,
          chauffeurId: demande.chauffeurId ?? null,
          clientId: demande.clientId ?? null,
        },
      });
      return;
    }

    // WhatsApp est privilégié quand le destinataire y est joignable et que
    // le canal est activé — sinon on reste en SMS.
    const viaWhatsApp = Boolean(parametres?.whatsappActif) && Boolean(demande.whatsapp);
    const numeroCanal = viaWhatsApp
      ? (normaliserNumero(demande.whatsappNumero ?? demande.destinataire) ?? numero)
      : numero;

    const interrupteur = INTERRUPTEUR[demande.evenement];
    const evenementActif =
      interrupteur === null ? true : Boolean(parametres?.[interrupteur] ?? false);
    const actif = Boolean(parametres?.smsActif) && evenementActif;

    const notification = await prisma.notificationSms.create({
      data: {
        evenement: demande.evenement,
        canal: viaWhatsApp ? "WHATSAPP" : "SMS",
        destinataire: numeroCanal,
        nom: demande.nom ?? null,
        message: demande.message,
        statut: "EN_ATTENTE",
        voyageId: demande.voyageId ?? null,
        factureId: demande.factureId ?? null,
        chauffeurId: demande.chauffeurId ?? null,
        clientId: demande.clientId ?? null,
      },
    });

    if (actif && smsConfigure()) {
      await tenterEnvoi(notification.id, parametres?.smsExpediteur ?? "PILITrans");
    }
  } catch {
    // Une notification qui échoue ne remonte pas : l'opération métier prime.
  }
}

/** Tente l'envoi d'une notification en file et consigne le résultat. */
export async function tenterEnvoi(id: string, expediteur: string): Promise<boolean> {
  const notification = await prisma.notificationSms.findUnique({ where: { id } });
  if (!notification || notification.statut === "ENVOYE") return false;

  // WhatsApp d'abord si c'est le canal demandé ; repli automatique sur SMS,
  // car mieux vaut un SMS reçu qu'un message resté en file.
  let resultat =
    notification.canal === "WHATSAPP"
      ? await envoyerWhatsApp(notification.destinataire, notification.message, expediteur)
      : await envoyerSms(notification.destinataire, notification.message, expediteur);
  let canalUtilise = notification.canal;

  if (!resultat.ok && notification.canal === "WHATSAPP") {
    resultat = await envoyerSms(notification.destinataire, notification.message, expediteur);
    if (resultat.ok) canalUtilise = "SMS";
  }

  await prisma.notificationSms.update({
    where: { id },
    data: {
      statut: resultat.ok ? "ENVOYE" : "ECHEC",
      canalUtilise: resultat.ok ? canalUtilise : null,
      referenceApi: resultat.referenceApi ?? null,
      erreur: resultat.erreur ?? null,
      tentatives: { increment: 1 },
      envoyeLe: resultat.ok ? new Date() : null,
    },
  });

  return resultat.ok;
}

// ------------------------------------------------------------
//  Rédaction des messages
//  Courts et concrets : un SMS se lit sur un téléphone de bord.
// ------------------------------------------------------------

const enseigne = (p: Parametres | null) => p?.raisonSociale ?? "PILITrans";

export function messageAffectation(
  parametres: Parametres | null,
  trajet: string,
  camion: string,
  date: Date,
): string {
  return `${enseigne(parametres)} : nouvelle mission ${trajet} avec ${camion}, départ le ${formatDate(date)}.`;
}

export function messageDepart(parametres: Parametres | null, trajet: string, marchandise: string | null): string {
  const quoi = marchandise ? ` (${marchandise})` : "";
  return `${enseigne(parametres)} : votre marchandise${quoi} est chargée. Trajet ${trajet} en cours. Nous vous tenons informé.`;
}

export function messageArrivee(parametres: Parametres | null, ville: string): string {
  return `${enseigne(parametres)} : votre marchandise est arrivée à ${ville}. Le déchargement va commencer.`;
}

export function messageLivraison(
  parametres: Parametres | null,
  ville: string,
  /** Déjà mis en forme avec son unité : « 12 t », « 12 t + 240 sacs ». */
  quantiteLivree: string | null,
): string {
  const quantite = quantiteLivree ? ` ${quantiteLivree}` : "";
  return `${enseigne(parametres)} : livraison effectuée à ${ville}${quantite}. Merci de votre confiance.`;
}

/**
 * Code de retrait envoyé au client.
 *
 * Volontairement sec : ce message circule sur un téléphone qui peut être lu
 * par d'autres. Il ne dit ni le montant ni la valeur de la marchandise.
 */
export function messageCodeLivraison(
  parametres: Parametres | null,
  code: string,
  marchandise: string,
): string {
  return `${enseigne(parametres)} : code de retrait pour ${marchandise} — ${code}. À communiquer au chauffeur au moment de la remise, à personne d'autre.`;
}

export function messageFacture(
  parametres: Parametres | null,
  numero: string,
  montantGnf: number,
  echeance: Date | null,
  lien: string | null,
): string {
  const quand = echeance ? ` Échéance : ${formatDate(echeance)}.` : "";
  const url = lien ? ` Facture : ${lien}` : "";
  return `${enseigne(parametres)} : facture ${numero} de ${formatNombre(montantGnf)} GNF.${quand}${url}`;
}

export function messageRelance(
  parametres: Parametres | null,
  numero: string,
  resteGnf: number,
  joursRetard: number,
  lien: string | null,
): string {
  const url = lien ? ` ${lien}` : "";
  return `${enseigne(parametres)} : facture ${numero}, ${formatNombre(resteGnf)} GNF restant dû, en retard de ${joursRetard} j. Merci de régulariser.${url}`;
}

/** Lien public vers une facture, si l'URL de l'application est renseignée. */
export function lienFacture(parametres: Parametres | null, factureId: string): string | null {
  const base = parametres?.urlApplication?.trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/factures/${factureId}/impression`;
}
