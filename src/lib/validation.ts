import { z } from "zod";

import { normaliserTelephone, telephoneValide } from "@/lib/telephone";

/**
 * Aides de validation partagées par les Server Actions.
 *
 * Point clé : un champ masqué par l'interface (litres hors gasoil, groupe froid
 * sur un non-frigo…) est **absent** du FormData, pas vide. Un `z.string()`
 * le rejetterait comme « requis », et l'erreur porterait sur un champ que
 * l'utilisateur ne voit pas — formulaire bloqué sans explication.
 * Ces helpers traitent donc « absent » et « vide » de la même façon.
 */

const estVide = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/** Nombre optionnel, virgule décimale et espaces acceptés (saisie française). */
export const nombreOptionnel = z.preprocess(
  (v) => (estVide(v) ? undefined : Number(String(v).replace(",", ".").replace(/\s/g, ""))),
  z.number({ message: "Nombre attendu" }).nonnegative("Valeur négative impossible").optional(),
);

/** Nombre obligatoire et strictement positif. */
export const nombrePositif = (message: string) =>
  z.preprocess(
    (v) => (estVide(v) ? undefined : Number(String(v).replace(",", ".").replace(/\s/g, ""))),
    z.number({ message }).positive(message),
  );

/** Date optionnelle depuis un `<input type="date">`. */
export const dateOptionnelle = z.preprocess(
  (v) => (estVide(v) ? undefined : new Date(String(v))),
  z.date({ message: "Date invalide" }).optional(),
);

/** Texte optionnel : « absent » et « vide » donnent tous deux `undefined`. */
export const texteOptionnel = z.preprocess(
  (v) => (estVide(v) ? undefined : String(v).trim()),
  z.string().optional(),
);

/** Enum optionnel (listes déroulantes avec une option « — »). */
export const enumOptionnel = <T extends Record<string, string>>(valeurs: T) =>
  z.preprocess((v) => (estVide(v) ? undefined : v), z.nativeEnum(valeurs).optional());

/** Case à cocher : absente = false. */
export const caseACocher = z.preprocess((v) => v === "true" || v === "on" || v === true, z.boolean());

/** Erreurs Zod → map par champ + renvoi de la saisie pour ne rien perdre. */
export function erreursFormulaire<E extends { erreur?: string; champs?: Record<string, string>; valeurs?: Record<string, string> }>(
  erreur: z.ZodError,
  donnees: FormData,
): E {
  const champs: Record<string, string> = {};
  for (const issue of erreur.issues) {
    const cle = issue.path.join(".") || "_";
    if (!champs[cle]) champs[cle] = issue.message;
  }

  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }

  return { erreur: "Corrige les champs signalés.", champs, valeurs } as E;
}

/**
 * Numéro de téléphone facultatif, ramené au format international.
 *
 * La normalisation se fait ici et pas seulement dans le composant de saisie :
 * un numéro peut arriver d'un import, d'un formulaire sans JavaScript ou d'une
 * ancienne fiche. Stocker deux écritures du même numéro casserait aussi bien
 * l'envoi de SMS que l'unicité du compte à la connexion.
 */
export const telephoneOptionnel = z.preprocess(
  (v) => (estVide(v) ? undefined : (normaliserTelephone(String(v)) ?? String(v).trim())),
  z
    .string()
    .refine((v) => telephoneValide(v), "Numéro invalide : indiquez l'indicatif du pays")
    .optional(),
);

/** Idem, mais obligatoire. */
export const telephoneRequis = z.preprocess(
  (v) => (estVide(v) ? "" : (normaliserTelephone(String(v)) ?? String(v).trim())),
  z.string().refine((v) => telephoneValide(v), "Numéro invalide : indiquez l'indicatif du pays"),
);

// ------------------------------------------------------------
//  Garde-fous de saisie
//
//  Une date ou un montant aberrant ne se voit pas : il se glisse dans les
//  moyennes, fausse une marge, et personne ne se souvient de ce qui a été
//  tapé. Mieux vaut refuser à la saisie que corriger six mois plus tard.
// ------------------------------------------------------------

/** L'exploitation n'a pas d'antériorité avant cette date. */
const ANNEE_MIN = 2000;
/** Deux ans devant : au-delà, c'est une faute de frappe sur l'année. */
const ANNEES_AVANT = 2;

export function dateRaisonnable(date: Date, aujourdhui = new Date()): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const limite = new Date(aujourdhui.getFullYear() + ANNEES_AVANT, 11, 31);
  return date.getFullYear() >= ANNEE_MIN && date <= limite;
}

/** Date obligatoire, bornée pour écarter les fautes de frappe sur l'année. */
export const dateBornee = z.coerce
  .date({ message: "Date invalide" })
  .refine((d) => dateRaisonnable(d), {
    message: `Date hors période plausible (entre ${ANNEE_MIN} et dans ${ANNEES_AVANT} ans)`,
  });

/** Idem, facultative. */
export const dateBorneeOptionnelle = z.preprocess(
  (v) => (estVide(v) ? undefined : v),
  z.coerce
    .date({ message: "Date invalide" })
    .refine((d) => dateRaisonnable(d), { message: "Date hors période plausible" })
    .optional(),
);

/**
 * Date d'expiration d'un document.
 *
 * Horizon large : un permis, une assurance ou une autorisation courent
 * couramment sur plusieurs années. La borne de deux ans, valable pour une
 * opération, refuserait ici des saisies parfaitement justes.
 */
export const dateExpiration = z.coerce
  .date({ message: "Date invalide" })
  .refine((d) => !Number.isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= new Date().getFullYear() + 15, {
    message: "Date d'expiration hors période plausible",
  });

export const dateExpirationOptionnelle = z.preprocess(
  (v) => (estVide(v) ? undefined : v),
  dateExpiration.optional(),
);

/**
 * Distance d'une mission, en kilomètres.
 *
 * Le corridor le plus long de l'exploitation dépasse à peine 1 500 km. Un
 * nombre à cinq chiffres vient d'une frappe, pas de la route — et il écrase
 * tous les coûts au kilomètre de la période.
 */
export const distanceKm = nombreOptionnel.pipe(
  z
    .number()
    .max(10_000, "Distance invraisemblable : vérifiez la saisie")
    .optional(),
);
