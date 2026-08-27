import "server-only";

import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { estUrlHebergee } from "@/lib/images";

/**
 * Icône de l'application, dérivée du logo de l'entreprise.
 *
 * Servie depuis notre domaine, jamais depuis Cloudinary : une favicon part
 * avant tout le reste, et ajouter une seconde origine à ce chemin critique
 * coûterait une connexion de plus. Elle doit aussi s'afficher quand Cloudinary
 * est indisponible ou pas encore configuré.
 *
 * Le rendu passe par `sharp` plutôt que par le générateur d'images intégré :
 * ce dernier ignore silencieusement les images en `data:`, et sortait donc
 * toujours la marque d'origine — sans la moindre erreur pour le signaler.
 */

const FOND = { r: 12, g: 36, b: 45, alpha: 1 };
const ACCENT = "#0FA3B1";

/** Marque d'origine : un point sur fond sombre, lisible à seize pixels. */
function marqueParDefaut(cote: number): Buffer {
  const rayon = Math.round(cote * 0.23);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cote}" height="${cote}">
       <rect width="${cote}" height="${cote}" fill="rgb(12,36,45)"/>
       <circle cx="${cote / 2}" cy="${cote / 2}" r="${rayon}" fill="${ACCENT}"/>
     </svg>`,
  );
}

/** Récupère le logo, quel que soit son mode de stockage. */
async function chargerLogo(valeur: string): Promise<Buffer | null> {
  try {
    if (estUrlHebergee(valeur)) {
      const r = await fetch(valeur, { signal: AbortSignal.timeout(5_000) });
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    }
    const base64 = valeur.split(",")[1];
    return base64 ? Buffer.from(base64, "base64") : null;
  } catch {
    // Une icône ne doit jamais faire échouer une page : on retombe sur la marque.
    return null;
  }
}

export async function iconePng(cote: number): Promise<Buffer> {
  const parametres = await prisma.parametres
    .findFirst({ select: { logoUrl: true } })
    .catch(() => null);

  const brut = parametres?.logoUrl ? await chargerLogo(parametres.logoUrl) : null;
  if (!brut) return sharp(marqueParDefaut(cote)).png().toBuffer();

  try {
    // Le logo est ramené à l'intérieur du carré sans être rogné : un logo
    // large recadré perdrait la moitié de son nom.
    const marge = Math.round(cote * 0.12);
    const logo = await sharp(brut)
      .resize(cote - marge * 2, cote - marge * 2, { fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();

    return sharp({
      create: { width: cote, height: cote, channels: 4, background: FOND },
    })
      .composite([{ input: logo, gravity: "center" }])
      .png()
      .toBuffer();
  } catch {
    return sharp(marqueParDefaut(cote)).png().toBuffer();
  }
}
