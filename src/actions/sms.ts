"use server";

import { revalidatePath } from "next/cache";

import { exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { smsConfigure } from "@/lib/sms/nimba";
import { tenterEnvoi } from "@/lib/sms/notifications";
import { NOM_APPLICATION } from "@/lib/marque";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("parametres.ecrire");
}

/**
 * Rejoue la file d'attente.
 *
 * C'est ce qui rend l'absence de clés API supportable : tout ce qui n'a pas pu
 * partir est conservé et s'enverra en une fois, le jour où les identifiants
 * Nimba seront renseignés.
 */
/**
 * Abandonne les messages en file — sans les envoyer.
 *
 * `viderFileSms()` porte un nom trompeur qu'on lui garde par compatibilité :
 * elle **envoie** la file, elle ne la vide pas. Quand l'envoi échoue de façon
 * répétée — nom d'expéditeur refusé, numéro invalide — il faut pouvoir
 * renoncer. Les messages passent en « annulé » plutôt que d'être supprimés :
 * ce qu'on a voulu dire à un client reste consultable, même si ce n'est jamais
 * parti.
 */
export async function abandonnerFileSms(): Promise<{ abandonnes: number; message: string }> {
  await droitEcriture();

  const { count } = await prisma.notificationSms.updateMany({
    where: { statut: { in: ["EN_ATTENTE", "ECHEC"] } },
    data: { statut: "ANNULE" },
  });

  await journaliser({
    action: "sms.file.abandonnee",
    objet: "NotificationSms",
    libelle: `${count} message(s) SMS abandonné(s) sans envoi`,
  });

  revalidatePath("/parametres");
  return {
    abandonnes: count,
    message:
      count > 0
        ? `${count} message(s) abandonné(s). Ils restent consultables, marqués « annulé ».`
        : "Aucun message à abandonner.",
  };
}

export async function viderFileSms(): Promise<{ envoyes: number; echecs: number; message: string }> {
  await droitEcriture();

  const parametres = await prisma.parametres.findFirst();
  if (!parametres?.smsActif) {
    return { envoyes: 0, echecs: 0, message: "Les SMS sont désactivés dans les paramètres." };
  }
  if (!smsConfigure()) {
    return {
      envoyes: 0,
      echecs: 0,
      message:
        "Identifiants Nimba absents : renseigner NIMBA_SMS_SERVICE_ID et NIMBA_SMS_SECRET_TOKEN.",
    };
  }

  const enAttente = await prisma.notificationSms.findMany({
    where: { statut: { in: ["EN_ATTENTE", "ECHEC"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  let envoyes = 0;
  let echecs = 0;
  for (const notification of enAttente) {
    const ok = await tenterEnvoi(notification.id, parametres.smsExpediteur ?? NOM_APPLICATION);
    if (ok) envoyes += 1;
    else echecs += 1;
  }

  revalidatePath("/parametres");
  return {
    envoyes,
    echecs,
    message: `${envoyes} envoyé(s), ${echecs} en échec.`,
  };
}

/** Annule une notification en file — un message devenu sans objet. */
export async function annulerNotification(id: string) {
  await droitEcriture();

  await prisma.notificationSms.update({
    where: { id },
    data: { statut: "ANNULE" },
  });
  revalidatePath("/parametres");
}
