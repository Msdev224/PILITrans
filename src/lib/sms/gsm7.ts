/**
 * Alphabet GSM 03.38 — ce qui décide du prix d'un SMS.
 *
 * Un message composé uniquement de caractères de cet alphabet tient en 160
 * caractères par segment. Un seul caractère en dehors — une flèche, un tiret
 * cadratin, un « À » majuscule, l'espace fine des montants — bascule le
 * message entier en UCS-2 : 70 caractères par segment, donc deux à trois fois
 * plus de segments facturés pour le même texte.
 *
 * Ce module n'est pas une préciosité typographique : c'est la facture Nimba.
 */

/** Caractères occupant un seul septet. */
const BASE =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** Caractères de la table d'extension : deux septets chacun. */
const EXTENSION = "^{}\\[~]|€";

export function estGsm7(texte: string): boolean {
  return [...texte].every((c) => BASE.includes(c) || EXTENSION.includes(c));
}

/** Caractères du texte qui forceraient l'UCS-2 — pour diagnostiquer. */
export function caracteresHorsGsm7(texte: string): string[] {
  return [...new Set([...texte].filter((c) => !BASE.includes(c) && !EXTENSION.includes(c)))];
}

/**
 * Nombre de segments facturés.
 *
 * Un message court tient en un segment ; au-delà, l'en-tête de concaténation
 * mange quelques caractères sur chacun — 153 au lieu de 160 en GSM-7, 67 au
 * lieu de 70 en UCS-2.
 */
export function segmentsSms(texte: string): number {
  if (estGsm7(texte)) {
    const longueur = [...texte].reduce((n, c) => n + (EXTENSION.includes(c) ? 2 : 1), 0);
    return longueur <= 160 ? 1 : Math.ceil(longueur / 153);
  }
  return texte.length <= 70 ? 1 : Math.ceil(texte.length / 67);
}

/**
 * Remplacements sûrs des caractères courants absents de l'alphabet.
 *
 * On ne retire pas les accents à l'aveugle : `é`, `è`, `à`, `ù` sont dans
 * l'alphabet et un texte sans eux paraîtrait bâclé. Seuls ceux qui coûtent
 * réellement sont convertis.
 */
const REMPLACEMENTS: Record<string, string> = {
  "→": ">",
  "—": "-",
  "–": "-",
  "…": "...",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  " ": " ", // espace fine insécable des montants
  " ": " ", // espace insécable
  "−": "-", // signe moins typographique
  "À": "A",
  "Â": "A",
  "Ê": "E",
  "È": "E",
  "Î": "I",
  "Ô": "O",
  "Û": "U",
  "Ù": "U",
  "â": "a",
  "ê": "e",
  "î": "i",
  "ô": "o",
  "û": "u",
  "ç": "c",
  "Ç": "C",
  "œ": "oe",
  "Œ": "OE",
  "°": " deg",
};

/**
 * Ramène un texte dans l'alphabet GSM, sans le dénaturer.
 *
 * Dernier filet : les messages sont écrits pour être déjà conformes, mais un
 * nom de client, une ville ou une désignation de marchandise viennent de la
 * saisie et peuvent contenir n'importe quoi.
 */
export function assainirGsm7(texte: string): string {
  let sortie = "";
  for (const c of texte) {
    if (BASE.includes(c) || EXTENSION.includes(c)) {
      sortie += c;
      continue;
    }
    const remplacement = REMPLACEMENTS[c];
    if (remplacement !== undefined) {
      sortie += remplacement;
      continue;
    }
    // Inconnu : on tente la décomposition Unicode (retire l'accent), sinon on
    // laisse une espace plutôt qu'un caractère qui ferait basculer tout le
    // message en UCS-2.
    const sansAccent = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    sortie += BASE.includes(sansAccent) ? sansAccent : " ";
  }
  return sortie;
}

/** Montant pour un SMS : espaces ordinaires, jamais l'espace fine. */
export function montantSms(valeur: number): string {
  const [entiere, decimales] = Math.abs(valeur).toFixed(2).split(".");
  const chiffres = entiere.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const reste = decimales.replace(/0+$/, "");
  return (valeur < 0 ? "-" : "") + chiffres + (reste ? `,${reste}` : "");
}

/** Date pour un SMS : numérique, car « août » et « décembre » coûtent cher. */
export function dateSms(date: Date): string {
  const jj = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${jj}/${mm}/${date.getFullYear()}`;
}
