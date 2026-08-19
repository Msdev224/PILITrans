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
