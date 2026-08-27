import { iconePng } from "@/lib/icone-marque";

/** Favicon de l'onglet — voir `src/lib/icone-marque.ts` pour le pourquoi. */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Le logo change rarement. Une heure de fraîcheur évite d'interroger la base
 * à chaque onglet ouvert, sans faire attendre un changement de marque.
 */
export const revalidate = 3600;

export default async function Icone() {
  const png = await iconePng(size.width);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": contentType },
  });
}
