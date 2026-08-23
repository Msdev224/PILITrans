import type { EvenementSms, Parametres } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { assainirGsm7, dateSms, montantSms } from "@/lib/sms/gsm7";
import { envoyerSms, envoyerWhatsApp, normaliserNumero, smsConfigure } from "@/lib/sms/nimba";

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
//
//  Trois règles, dans cet ordre :
//
//  1. Rester dans l'alphabet GSM. Un seul caractère en dehors — flèche, tiret
//     cadratin, « À » majuscule, espace fine d'un montant — double le prix du
//     message. Les dates sont donc numériques : « août » contient un û.
//  2. Tenir en un segment, soit 160 caractères. Les valeurs insérées viennent
//     de la saisie et peuvent être longues : les tests bornent les cas réels.
//  3. Dire ce que le destinataire doit savoir ou faire, rien de plus. Un SMS
//     se lit d'un coup d'œil sur un téléphone de bord.
// ------------------------------------------------------------

const enseigne = (p: Parametres | null) => assainirGsm7(p?.raisonSociale ?? "PILITrans");

/** Numéro à rappeler, quand il est renseigné : sans lui, le client ne peut rien faire. */
function rappel(p: Parametres | null): string {
  const tel = p?.telephone?.trim();
  return tel ? ` Info : ${tel}.` : "";
}

/** Trajet sans flèche : le « > » coûte un septet, la flèche fait basculer tout le message. */
function trajetSms(trajet: string): string {
  return assainirGsm7(trajet.replace(/\s*(?:→|->)\s*/g, " > "));
}

export function messageAffectation(
  parametres: Parametres | null,
  trajet: string,
  camion: string,
  date: Date,
): string {
  return assainirGsm7(
    `${enseigne(parametres)} : nouvelle mission ${trajetSms(trajet)} avec ${camion}, ` +
      `départ prévu le ${dateSms(date)}. Détails dans ton espace chauffeur.`,
  );
}

export function messageDepart(
  parametres: Parametres | null,
  trajet: string,
  marchandise: string | null,
): string {
  // La désignation entre parenthèses : « votre Produits frais est chargée »
  // ne s'accorde avec rien. Le nom commun porte la phrase, la marchandise
  // vient la préciser.
  const quoi = marchandise ? ` (${assainirGsm7(marchandise)})` : "";
  return assainirGsm7(
    `${enseigne(parametres)} : votre marchandise${quoi} est chargée, en route ${trajetSms(trajet)}. ` +
      `Nous vous prévenons à l'arrivée.${rappel(parametres)}`,
  );
}

export function messageArrivee(parametres: Parametres | null, ville: string): string {
  return assainirGsm7(
    `${enseigne(parametres)} : votre marchandise est arrivée à ${assainirGsm7(ville)}. ` +
      `Le déchargement commence. Merci de prévoir sa réception.${rappel(parametres)}`,
  );
}

export function messageLivraison(
  parametres: Parametres | null,
  ville: string,
  /** Déjà mis en forme avec son unité : « 12 t », « 12 t + 240 sacs ». */
  quantiteLivree: string | null,
): string {
  const quantite = quantiteLivree ? ` de ${assainirGsm7(quantiteLivree)}` : "";
  return assainirGsm7(
    `${enseigne(parametres)} : livraison${quantite} effectuée à ${assainirGsm7(ville)}. ` +
      `Merci de votre confiance.${rappel(parametres)}`,
  );
}

/**
 * Code de retrait envoyé au client.
 *
 * Volontairement sec : ce message circule sur un téléphone qui peut être lu
 * par d'autres. Il ne dit ni le montant, ni la valeur de la marchandise, ni
 * même d'où elle vient. Il dit en revanche explicitement à qui remettre le
 * code — c'est la seule protection contre une livraison à la mauvaise
 * personne, et elle ne tient que si le client comprend la règle.
 */
export function messageCodeLivraison(
  parametres: Parametres | null,
  code: string,
  marchandise: string,
): string {
  return assainirGsm7(
    `${enseigne(parametres)} : code de retrait ${code} pour ${assainirGsm7(marchandise)}. ` +
      `Donnez-le au chauffeur au moment de la remise, à personne d'autre.`,
  );
}

export function messageFacture(
  parametres: Parametres | null,
  numero: string,
  montantGnf: number,
  echeance: Date | null,
  lien: string | null,
): string {
  const quand = echeance ? ` à régler avant le ${dateSms(echeance)}.` : ".";
  const url = lien ? ` ${lien}` : "";
  return assainirGsm7(
    `${enseigne(parametres)} : facture ${numero} de ${montantSms(montantGnf)} GNF${quand}` +
      `${url}${url ? "" : rappel(parametres)}`,
  );
}

export function messageRelance(
  parametres: Parametres | null,
  numero: string,
  resteGnf: number,
  joursRetard: number,
  lien: string | null,
): string {
  const url = lien ? ` ${lien}` : "";
  return assainirGsm7(
    `${enseigne(parametres)} : il reste ${montantSms(resteGnf)} GNF à régler sur la facture ` +
      `${numero}, échéance dépassée de ${joursRetard} j. Merci de régulariser.${url}`,
  );
}

/** Lien public vers une facture, si l'URL de l'application est renseignée. */
export function lienFacture(parametres: Parametres | null, factureId: string): string | null {
  const base = parametres?.urlApplication?.trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/factures/${factureId}/impression`;
}
