"use server";

import { sessionRequise } from "@/auth";
import { signerTeleversement, type SignatureTeleversement } from "@/lib/cloudinary";

/**
 * Délivre une signature de téléversement au navigateur.
 *
 * Réservée aux comptes connectés : sans ce contrôle, n'importe qui pourrait
 * obtenir une signature et déposer des fichiers sur le compte Cloudinary de
 * l'exploitation.
 *
 * Renvoie `null` quand Cloudinary n'est pas configuré. L'appelant retombe
 * alors sur l'ancien mode — l'image reste en base — plutôt que d'échouer :
 * une photo est un confort, elle ne doit jamais bloquer la création d'une
 * fiche chauffeur.
 */
export async function obtenirSignature(): Promise<SignatureTeleversement | null> {
  await sessionRequise();
  return signerTeleversement();
}
