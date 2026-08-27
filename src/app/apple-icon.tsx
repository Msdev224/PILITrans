import { iconePng } from "@/lib/icone-marque";

/**
 * Icône d'accueil iOS.
 *
 * Fond opaque et sans coins arrondis : iOS applique lui-même son masque, et
 * un PNG transparent y ressortirait noir.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function IconeApple() {
  const png = await iconePng(size.width);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": contentType },
  });
}
