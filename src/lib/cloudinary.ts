import "server-only";

import { DOSSIER_IMAGES, signatureCloudinary } from "@/lib/images";

/**
 * Hébergement des images sur Cloudinary.
 *
 * Les photos vivaient en base, encodées en texte : une colonne de 400 Ko par
 * chauffeur et par camion, relue à chaque affichage de liste. Cloudinary les
 * sort de là et les sert redimensionnées selon l'écran — ce qui compte sur un
 * téléphone en 3G.
 *
 * Le téléversement est **signé et direct** : le navigateur demande une
 * signature au serveur, puis envoie le fichier à Cloudinary sans passer par
 * nos fonctions. Deux raisons — le secret d'API ne quitte jamais le serveur,
 * et un fichier de plusieurs mégaoctets ne traverse pas une fonction Vercel,
 * qui plafonne la taille des requêtes.
 */

export interface ConfigCloudinary {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Les identifiants vivent dans l'environnement, jamais en base ni dans le code. */
export function configCloudinary(): ConfigCloudinary | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

export const cloudinaryConfigure = () => configCloudinary() !== null;

export interface SignatureTeleversement {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

/**
 * Signature d'un téléversement, valable quelques minutes.
 *
 * Cloudinary attend le SHA-1 des paramètres triés par nom, concaténés en
 * chaîne de requête, suivis du secret. Tout paramètre envoyé mais non signé
 * fait rejeter la requête — d'où la liste courte et explicite.
 */
export function signerTeleversement(): SignatureTeleversement | null {
  const config = configCloudinary();
  if (!config) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    folder: DOSSIER_IMAGES,
    signature: signatureCloudinary(config.apiSecret, DOSSIER_IMAGES, timestamp),
  };
}

export { estUrlHebergee, urlImage } from "@/lib/images";
