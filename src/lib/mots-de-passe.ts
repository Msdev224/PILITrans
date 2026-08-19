import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  motDePasse: string,
  sel: Buffer,
  longueur: number,
) => Promise<Buffer>;

const LONGUEUR = 64;

/** Empreinte scrypt au format `sel:empreinte` (hexadécimal). */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(16);
  const empreinte = await scrypt(motDePasse, sel, LONGUEUR);
  return `${sel.toString("hex")}:${empreinte.toString("hex")}`;
}

/** Vérifie un mot de passe en clair contre une empreinte, en temps constant. */
export async function verifierMotDePasse(motDePasse: string, stocke: string | null): Promise<boolean> {
  if (!stocke) return false;
  const [selHex, empreinteHex] = stocke.split(":");
  if (!selHex || !empreinteHex) return false;

  const attendue = Buffer.from(empreinteHex, "hex");
  if (attendue.length !== LONGUEUR) return false;

  const calculee = await scrypt(motDePasse, Buffer.from(selHex, "hex"), LONGUEUR);
  return timingSafeEqual(attendue, calculee);
}
