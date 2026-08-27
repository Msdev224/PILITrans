import { iconePng } from "@/lib/icone-marque";

/**
 * Icône 192 × 192 du manifeste — celle qui s'inscrit sur l'écran d'accueil.
 *
 * Elle était un fichier figé dans `public/` : le chauffeur installait
 * l'application et retrouvait la marque d'origine, jamais le logo de
 * l'exploitation. Elle suit désormais les Paramètres comme la favicon.
 *
 * Le chemin se termine par `.png` volontairement : le middleware laisse
 * passer ces requêtes sans session, et le système d'exploitation peut aller
 * chercher l'icône sans cookie.
 */
export const revalidate = 3600;

export async function GET() {
  const png = await iconePng(192);
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
