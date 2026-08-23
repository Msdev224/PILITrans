/**
 * Client Nimba SMS.
 *
 * Contrat repris du SDK officiel (github.com/nimbasms/nimbasms-python) :
 *   POST https://api.nimbasms.com/v1/messages
 *   Authorization: Basic base64(SERVICE_ID:SECRET_TOKEN)
 *   { to: string[], sender_name: string, message: string }
 *
 * `sender_name` est sensible à la casse chez Nimba.
 */

import { normaliserTelephone, telephoneValide } from "@/lib/telephone";

const BASE_URL = process.env.NIMBA_SMS_BASE_URL ?? "https://api.nimbasms.com";

export interface ResultatEnvoi {
  ok: boolean;
  referenceApi?: string;
  erreur?: string;
}

/** Les identifiants vivent dans l'environnement, jamais en base. */
export function identifiantsNimba(): { serviceId: string; secretToken: string } | null {
  const serviceId = process.env.NIMBA_SMS_SERVICE_ID?.trim();
  const secretToken = process.env.NIMBA_SMS_SECRET_TOKEN?.trim();
  if (!serviceId || !secretToken) return null;
  return { serviceId, secretToken };
}

export const smsConfigure = () => identifiantsNimba() !== null;

/**
 * Numéro tel que Nimba l'attend : chiffres internationaux, sans `+`.
 *
 * La normalisation elle-même est déléguée à `@/lib/telephone`. Deux règles
 * concurrentes finiraient par diverger, et un numéro sénégalais enregistré
 * sans indicatif partirait vers un abonné guinéen portant le même numéro.
 */
export function normaliserNumero(numero: string, indicatifDefaut = "+224"): string | null {
  const e164 = normaliserTelephone(numero, indicatifDefaut);
  if (!e164 || !telephoneValide(e164)) return null;
  return e164.slice(1);
}

/**
 * Traduit un refus de l'API en phrase actionnable.
 *
 * Nimba répond par un objet dont les clés sont les champs fautifs :
 * `{"sender_name":"Sender Name invalid."}`. Affiché tel quel dans le suivi des
 * SMS, c'est illisible pour un gérant — et surtout, ça ne dit pas quoi faire.
 * Or ces refus ont presque toujours la même poignée de causes, et chacune a
 * une correction précise.
 */
function traduireErreur(statut: number, charge: Record<string, unknown>, brut: string): string {
  const champ = (cle: string) => {
    const v = charge[cle];
    return typeof v === "string" ? v : Array.isArray(v) ? String(v[0]) : null;
  };

  if (champ("sender_name")) {
    return (
      "Nom d'expéditeur refusé par Nimba. Il doit correspondre exactement à un nom " +
      "validé chez eux — casse comprise, 11 caractères maximum. " +
      "Corrigez-le dans Paramètres, Notifications SMS."
    );
  }

  if (champ("to")) {
    return `Numéro refusé par Nimba : ${champ("to")}. Vérifiez l'indicatif du destinataire.`;
  }

  if (statut === 401 || statut === 403) {
    return (
      "Identifiants Nimba refusés. Vérifiez NIMBA_SMS_SERVICE_ID et " +
      "NIMBA_SMS_SECRET_TOKEN dans les variables d'environnement."
    );
  }

  if (statut === 402 || /credit|solde|balance/i.test(brut)) {
    return "Crédit SMS épuisé chez Nimba. Rechargez le compte, la file repartira seule.";
  }

  if (statut === 429) {
    return "Trop d'envois d'un coup : Nimba a temporisé. Le message reste en file.";
  }

  const detail =
    (charge.message as string) ??
    (charge.detail as string) ??
    // Dernier recours : la première valeur lisible de la réponse.
    Object.values(charge).find((v) => typeof v === "string") ??
    brut.slice(0, 160);

  return `Refus de Nimba (HTTP ${statut}) : ${detail || "raison non précisée"}`;
}

/**
 * Envoie un SMS. Ne lève jamais : un échec de notification ne doit pas faire
 * échouer l'opération métier qui l'a déclenchée (un voyage reste enregistré
 * même si le SMS ne part pas).
 */
export async function envoyerSms(
  destinataire: string,
  message: string,
  expediteur: string,
): Promise<ResultatEnvoi> {
  const identifiants = identifiantsNimba();
  if (!identifiants) {
    return { ok: false, erreur: "Identifiants Nimba SMS absents." };
  }

  const autorisation = Buffer.from(
    `${identifiants.serviceId}:${identifiants.secretToken}`,
  ).toString("base64");

  try {
    const reponse = await fetch(`${BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${autorisation}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: [destinataire],
        sender_name: expediteur,
        message,
      }),
      // Le réseau est instable : mieux vaut échouer vite et remettre en file.
      signal: AbortSignal.timeout(15_000),
    });

    const brut = await reponse.text();
    let charge: Record<string, unknown> = {};
    try {
      charge = brut ? JSON.parse(brut) : {};
    } catch {
      // Réponse non JSON : on garde le texte brut comme message d'erreur.
    }

    if (!reponse.ok) {
      return { ok: false, erreur: traduireErreur(reponse.status, charge, brut) };
    }

    return {
      ok: true,
      referenceApi: (charge.messageid as string) ?? (charge.id as string) ?? undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, erreur: `Réseau : ${message}` };
  }
}

/**
 * Envoi WhatsApp via Nimba.
 *
 * ⚠️ Le contrat HTTP n'est PAS implémenté, et volontairement.
 *
 * Deux raisons. D'abord, l'endpoint WhatsApp de Nimba n'est pas documenté
 * publiquement — l'inventer produirait du code faux qui semblerait marcher.
 * Ensuite et surtout, WhatsApp Business interdit le texte libre à l'initiative
 * de l'entreprise : chaque message doit correspondre à un **gabarit validé par
 * Meta**, avec ses variables. Nos messages actuels sont rédigés librement ;
 * les basculer sur WhatsApp suppose de déclarer un gabarit par événement dans
 * le tableau de bord Nimba, puis d'envoyer un identifiant de gabarit et ses
 * paramètres — pas une chaîne de caractères.
 *
 * D'ici là, une notification destinée à WhatsApp reste en file avec ce motif,
 * exactement comme lorsqu'il manque les clés API.
 */
export async function envoyerWhatsApp(
  _destinataire: string,
  _message: string,
  _expediteur: string,
): Promise<ResultatEnvoi> {
  return {
    ok: false,
    erreur:
      "Canal WhatsApp non activé : gabarits Meta à déclarer chez Nimba et contrat d'API à confirmer.",
  };
}
