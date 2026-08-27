import { createHash } from "node:crypto";

/**
 * Images : partie pure.
 *
 * Ni secrets ni accès réseau. Séparée de `cloudinary.ts` — qui lit les clés et
 * porte donc `server-only` — pour que ces fonctions restent testables et
 * utilisables partout.
 */

/**
 * Dossier de rangement, pour ne pas mélanger avec d'autres projets du compte.
 *
 * **Ne pas renommer** malgré le changement de nom de l'exploitation : les
 * images déjà téléversées vivent sous ce préfixe, et leurs URL sont écrites
 * en base. Le dossier est un identifiant technique, pas un libellé.
 */
export const DOSSIER_IMAGES = "pilitrans";

/**
 * Signature d'un téléversement Cloudinary.
 *
 * Cloudinary attend le SHA-1 des paramètres triés par nom, concaténés en
 * chaîne de requête, suivis du secret. Tout paramètre envoyé mais non signé
 * fait rejeter la requête — d'où la liste courte et explicite.
 */
export function signatureCloudinary(secret: string, dossier: string, timestamp: number): string {
  const aSigner = `folder=${dossier}&timestamp=${timestamp}`;
  return createHash("sha1")
    .update(aSigner + secret)
    .digest("hex");
}

/**
 * Reconnaît une image déjà hébergée.
 *
 * Les fiches créées avant Cloudinary portent une image en `data:` directement
 * dans la colonne. Les deux formes coexistent sans conversion forcée : une
 * migration de masse ferait perdre les photos si elle échouait à mi-chemin, et
 * un `<img>` affiche les deux sans distinction.
 */
export function estUrlHebergee(valeur: string | null | undefined): boolean {
  return !!valeur && /^https?:\/\//.test(valeur);
}

/**
 * URL redimensionnée à la volée.
 *
 * Cloudinary applique la transformation à la demande et met le résultat en
 * cache : demander une vignette de 96 pixels n'oblige pas à télécharger
 * l'original. Sans effet sur une image en `data:`, qui est déjà à sa taille.
 */
export function urlImage(valeur: string | null | undefined, cote: number): string | null {
  if (!valeur) return null;
  if (!estUrlHebergee(valeur)) return valeur;

  // On insère la transformation juste après `/upload/`, comme l'attend l'API.
  return valeur.replace(
    "/image/upload/",
    `/image/upload/c_fill,g_auto,w_${cote},h_${cote},q_auto,f_auto/`,
  );
}

/**
 * URL d'un logo, redimensionnée sans le déformer ni le rogner.
 *
 * `urlImage` recadre en carré, ce qui convient à un portrait mais amputerait
 * un logo large. Ici on borne la largeur et on laisse la hauteur suivre.
 */
export function urlLogo(valeur: string | null | undefined, largeur: number): string | null {
  if (!valeur) return null;
  if (!estUrlHebergee(valeur)) return valeur;

  return valeur.replace("/image/upload/", `/image/upload/c_limit,w_${largeur},q_auto,f_auto/`);
}
