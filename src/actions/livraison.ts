"use server";

import { randomInt, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionRequise } from "@/auth";
import { TENTATIVES_MAX_CODE } from "@/lib/donnees/marchandises";
import { peut } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { messageCodeLivraison } from "@/lib/sms/notifications";
import { notifier } from "@/lib/sms/notifications";
import { erreursFormulaire } from "@/lib/validation";

/**
 * Preuve de livraison par code.
 *
 * Le client reçoit un code, le remet au chauffeur à la livraison, et le
 * chauffeur le saisit. Une quantité déclarée par le seul chauffeur ne prouve
 * rien en cas de contestation : ce code atteste que la marchandise a bien été
 * remise à son destinataire.
 */

/** Six chiffres : assez court pour être dicté au téléphone, assez long pour ne pas se deviner. */
const LONGUEUR = 6;
/** Au-delà, on cesse d'accepter les tentatives : c'est de la devinette. */
const TENTATIVES_MAX = TENTATIVES_MAX_CODE;

function genererCode(): string {
  return String(randomInt(0, 10 ** LONGUEUR)).padStart(LONGUEUR, "0");
}

/** Comparaison à durée constante : le temps de réponse ne doit rien révéler. */
function memeCode(saisi: string, attendu: string): boolean {
  const a = Buffer.from(saisi);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface EtatLivraison {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  /** Message de succès, distinct de l'erreur pour l'affichage. */
  message?: string;
}

/** La ligne doit appartenir à une mission que l'utilisateur a le droit de toucher. */
async function ligneAutorisee(ligneId: string) {
  const session = await sessionRequise();

  const ligne = await prisma.ligneMarchandise.findUnique({
    where: { id: ligneId },
    include: {
      unite: { select: { symbole: true } },
      voyage: { select: { id: true, chauffeurId: true, clientId: true } },
      client: { select: { id: true, nom: true, telephone: true, whatsapp: true, whatsappNumero: true } },
    },
  });
  if (!ligne) throw new Error("Marchandise introuvable.");

  if (session.user.role === "CHAUFFEUR") {
    if (ligne.voyage.chauffeurId !== session.user.chauffeurId) {
      throw new Error("Cette mission ne vous est pas attribuée.");
    }
  } else if (!peut(session.user.role, "voyages.ecrire")) {
    throw new Error("Vous n'avez pas les droits pour cette action.");
  }

  return { ligne, session };
}

/**
 * Envoie — ou renvoie — le code au client.
 *
 * Le même code est réexpédié tant que la livraison n'est pas confirmée : en
 * générer un nouveau invaliderait celui que le client a peut-être déjà noté.
 * Le compteur d'envois garde la trace des renvois, utile en cas de litige.
 */
export async function envoyerCodeLivraison(
  ligneId: string,
  _etat: EtatLivraison,
  _donnees: FormData,
): Promise<EtatLivraison> {
  const { ligne } = await ligneAutorisee(ligneId);

  if (ligne.codeConfirmeLe) {
    return { erreur: "Cette marchandise est déjà confirmée livrée." };
  }

  // Destinataire de la ligne, à défaut client principal du voyage.
  const destinataire =
    ligne.client ??
    (ligne.voyage.clientId
      ? await prisma.client.findUnique({
          where: { id: ligne.voyage.clientId },
          select: { id: true, nom: true, telephone: true, whatsapp: true, whatsappNumero: true },
        })
      : null);

  if (!destinataire?.telephone) {
    return {
      erreur:
        "Aucun numéro pour ce client : renseignez-le sur sa fiche, le code ne peut pas être envoyé.",
    };
  }

  const code = ligne.codeLivraison ?? genererCode();
  const parametres = await prisma.parametres.findFirst();

  await prisma.ligneMarchandise.update({
    where: { id: ligne.id },
    data: { codeLivraison: code, codeEnvois: { increment: 1 }, codeEnvoyeLe: new Date() },
  });

  await notifier({
    evenement: "CLIENT_CODE_LIVRAISON",
    destinataire: destinataire.telephone,
    whatsapp: destinataire.whatsapp,
    whatsappNumero: destinataire.whatsappNumero,
    nom: destinataire.nom,
    message: messageCodeLivraison(parametres, code, ligne.designation),
    voyageId: ligne.voyage.id,
    clientId: destinataire.id,
  });

  rafraichir(ligne.voyage.id);
  return {
    ok: true,
    message:
      ligne.codeEnvois > 0
        ? `Code renvoyé à ${destinataire.nom} (envoi n° ${ligne.codeEnvois + 1}).`
        : `Code envoyé à ${destinataire.nom}.`,
  };
}

const schemaConfirmation = z.object({
  ligneId: z.string().min(1),
  code: z
    .string()
    .trim()
    .regex(/^\d+$/, "Le code ne contient que des chiffres")
    .length(LONGUEUR, `${LONGUEUR} chiffres attendus`),
});

/**
 * Le chauffeur saisit le code que le client vient de lui donner.
 *
 * C'est le seul geste qui bascule une marchandise en « livrée » : la quantité
 * seule ne prouve pas la remise.
 */
export async function confirmerParCode(
  _etat: EtatLivraison,
  donnees: FormData,
): Promise<EtatLivraison> {
  const saisie = schemaConfirmation.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatLivraison>(saisie.error, donnees);

  const { ligne } = await ligneAutorisee(saisie.data.ligneId);

  if (ligne.codeConfirmeLe) return { ok: true, message: "Livraison déjà confirmée." };
  if (!ligne.codeLivraison) {
    return { erreur: "Aucun code n'a encore été envoyé au client pour cette marchandise." };
  }
  if (ligne.codeTentatives >= TENTATIVES_MAX) {
    return {
      erreur:
        "Trop de tentatives sur ce code. Demandez au gérant d'en faire renvoyer un nouveau au client.",
    };
  }

  if (!memeCode(saisie.data.code, ligne.codeLivraison)) {
    await prisma.ligneMarchandise.update({
      where: { id: ligne.id },
      data: { codeTentatives: { increment: 1 } },
    });
    const restantes = TENTATIVES_MAX - ligne.codeTentatives - 1;
    return {
      champs: {
        code: `Code incorrect. ${restantes > 0 ? `${restantes} essai${restantes > 1 ? "s" : ""} restant${restantes > 1 ? "s" : ""}.` : "Plus d'essai."}`,
      },
    };
  }

  await prisma.ligneMarchandise.update({
    where: { id: ligne.id },
    data: { codeConfirmeLe: new Date() },
  });

  rafraichir(ligne.voyage.id);
  return { ok: true, message: "Livraison confirmée par le client." };
}

/**
 * Réinitialise le code après trop d'essais ratés.
 * Réservé au gérant : c'est lui qui tranche quand le circuit s'est bloqué.
 */
export async function reinitialiserCode(ligneId: string) {
  const session = await sessionRequise();
  if (!peut(session.user.role, "voyages.ecrire")) {
    throw new Error("Vous n'avez pas les droits pour cette action.");
  }

  await prisma.ligneMarchandise.update({
    where: { id: ligneId },
    data: { codeLivraison: null, codeTentatives: 0, codeEnvois: 0, codeEnvoyeLe: null },
  });

  const ligne = await prisma.ligneMarchandise.findUnique({
    where: { id: ligneId },
    select: { voyageId: true },
  });
  if (ligne) rafraichir(ligne.voyageId);
}

function rafraichir(voyageId: string) {
  revalidatePath(`/voyages/${voyageId}`);
  revalidatePath("/voyages");
  revalidatePath("/chauffeur");
  revalidatePath("/alertes");
}
