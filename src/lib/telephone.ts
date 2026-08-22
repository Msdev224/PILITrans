/**
 * Numéros de téléphone au format international.
 *
 * Deux raisons de ne jamais stocker un numéro local :
 *  - l'exploitation est transfrontalière, un `77 555 44 33` est sénégalais ou
 *    guinéen selon qui le lit ;
 *  - Nimba SMS n'accepte que des numéros internationaux : un numéro sans
 *    indicatif part en échec silencieux, et le client n'est jamais prévenu.
 *
 * Tout numéro est donc conservé sous la forme `+224620223344` (E.164) et
 * réaffiché en groupes lisibles.
 */

export interface Indicatif {
  /** Code pays ISO utilisé par l'enum `Pays` quand il existe. */
  cle: string;
  libelle: string;
  /** Indicatif avec le `+`. */
  code: string;
  /** Longueur attendue du numéro national, pour signaler une saisie douteuse. */
  longueur: number;
}

/**
 * Indicatifs connus du module, utilisés pour **analyser** un numéro déjà
 * enregistré : reconnaître « 224620… » comme guinéen, séparer l'indicatif de
 * la partie nationale.
 *
 * Ce n'est PAS la liste proposée à la saisie : celle-ci vient de la table
 * `Pays`, tenue par l'exploitation. Les deux ont divergé un temps — on voyait
 * ici des pays absents de la configuration.
 */
export const INDICATIFS: Indicatif[] = [
  { cle: "GUINEE", libelle: "Guinée", code: "+224", longueur: 9 },
  { cle: "SENEGAL", libelle: "Sénégal", code: "+221", longueur: 9 },
  { cle: "MALI", libelle: "Mali", code: "+223", longueur: 8 },
  { cle: "GUINEE_BISSAU", libelle: "Guinée-Bissau", code: "+245", longueur: 9 },
  { cle: "COTE_IVOIRE", libelle: "Côte d'Ivoire", code: "+225", longueur: 10 },
  { cle: "SIERRA_LEONE", libelle: "Sierra Leone", code: "+232", longueur: 8 },
  { cle: "LIBERIA", libelle: "Liberia", code: "+231", longueur: 8 },
  { cle: "MAURITANIE", libelle: "Mauritanie", code: "+222", longueur: 8 },
  { cle: "GAMBIE", libelle: "Gambie", code: "+220", longueur: 7 },
  { cle: "MAROC", libelle: "Maroc", code: "+212", longueur: 9 },
  { cle: "FRANCE", libelle: "France", code: "+33", longueur: 9 },
];

/** Indicatif du pays de l'exploitation : celui proposé par défaut à la saisie. */
export const INDICATIF_DEFAUT = "+224";

/** Indicatifs du plus long au plus court, pour reconnaître `+225` avant `+22`. */
const CODES_TRIES = [...INDICATIFS].sort((a, b) => b.code.length - a.code.length);

/**
 * Ramène une saisie libre à la forme `+<indicatif><national>`.
 *
 * Accepte les formes rencontrées sur le terrain : espaces et tirets, `00224…`,
 * `(224)…`, ou un numéro purement local — auquel cas `indicatifDefaut`
 * s'applique. Renvoie `null` si rien d'exploitable n'a été saisi.
 */
export function normaliserTelephone(
  saisie: string | null | undefined,
  indicatifDefaut: string = INDICATIF_DEFAUT,
): string | null {
  if (!saisie) return null;

  // On ne garde que les chiffres, en mémorisant si un `+` ouvrait la saisie.
  const brut = saisie.trim();
  const commenceParPlus = brut.startsWith("+");
  let chiffres = brut.replace(/\D/g, "");
  if (!chiffres) return null;

  // `00` est la forme internationale composée depuis un fixe.
  if (!commenceParPlus && chiffres.startsWith("00")) {
    chiffres = chiffres.slice(2);
    return `+${chiffres}`;
  }

  if (commenceParPlus) return `+${chiffres}`;

  // Sans `+`, le numéro peut tout de même porter son indicatif (« 224620… »).
  const connu = CODES_TRIES.find((i) => {
    const code = i.code.slice(1);
    return chiffres.startsWith(code) && chiffres.length === code.length + i.longueur;
  });
  if (connu) return `+${chiffres}`;

  return `${indicatifDefaut}${chiffres}`;
}

/** Sépare un numéro E.164 en indicatif reconnu + partie nationale. */
export function decomposerTelephone(e164: string | null | undefined): {
  indicatif: string;
  national: string;
} {
  if (!e164) return { indicatif: INDICATIF_DEFAUT, national: "" };
  const normalise = normaliserTelephone(e164) ?? "";
  const connu = CODES_TRIES.find((i) => normalise.startsWith(i.code));
  if (!connu) return { indicatif: INDICATIF_DEFAUT, national: normalise.replace(/^\+/, "") };
  return { indicatif: connu.code, national: normalise.slice(connu.code.length) };
}

/** `+224620223344` → `+224 620 22 33 44`. */
export function formatTelephone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const { indicatif, national } = decomposerTelephone(e164);
  if (!national) return indicatif;
  // Groupes de 3 puis de 2 : la lecture usuelle des numéros de la sous-région.
  const groupes: string[] = [];
  let reste = national;
  if (reste.length > 4) {
    groupes.push(reste.slice(0, 3));
    reste = reste.slice(3);
  }
  while (reste.length > 0) {
    groupes.push(reste.slice(0, 2));
    reste = reste.slice(2);
  }
  return `${indicatif} ${groupes.join(" ")}`;
}

/**
 * Vérifie qu'un numéro normalisé est plausible. On reste tolérant : un numéro
 * d'une longueur inattendue est accepté (les plans de numérotation changent),
 * seul l'invraisemblable est rejeté.
 */
export function telephoneValide(e164: string | null | undefined): boolean {
  if (!e164) return false;
  const chiffres = e164.replace(/\D/g, "");
  return e164.startsWith("+") && chiffres.length >= 8 && chiffres.length <= 15;
}
