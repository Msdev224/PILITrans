/**
 * Saisies du chauffeur pouvant attendre le réseau — partie pure.
 *
 * Ce module ne touche ni au navigateur ni à la base : il décrit ce qu'une
 * saisie différée contient et ce qu'on accepte de rejouer. Il sert donc aussi
 * bien au téléphone qu'au serveur qui applique la file, et aux tests.
 */

/**
 * Actions applicables hors réseau.
 *
 * La confirmation par code de retrait n'y figure pas volontairement : elle
 * doit être vérifiée en direct contre la base. L'accepter hors ligne
 * reviendrait à confirmer une livraison sur un code faux, que le rejeu
 * rejetterait des heures plus tard — la marchandise serait déjà remise.
 */
export const ACTIONS_DIFFEREES = [
  "avancerMission",
  "ajouterRotation",
  "confirmerChargement",
  "confirmerLivraison",
  "signalerArret",
  "saisirDepense",
  "enregistrerReleve",
  "declarerPrelevement",
] as const;

export type ActionDifferee = (typeof ACTIONS_DIFFEREES)[number];

export function estActionDifferee(valeur: string): valeur is ActionDifferee {
  return (ACTIONS_DIFFEREES as readonly string[]).includes(valeur);
}

/** Champ portant l'instant réel de la saisie, ajouté au moment de l'envoi. */
export const CHAMP_SAISIE = "_saisieLe";

/** Une saisie en attente, telle qu'elle est conservée sur l'appareil. */
export interface OperationEnAttente {
  /**
   * Identifiant produit par le téléphone.
   *
   * C'est la clé qui empêche le double comptage : un envoi parti dont la
   * réponse s'est perdue sera renvoyé, et le serveur reconnaîtra la saisie.
   */
  id: string;
  action: ActionDifferee;
  /** Le formulaire, à plat. Les saisies du chauffeur n'ont pas de fichier. */
  champs: Record<string, string>;
  /** Instant de la saisie sur le terrain, pas celui du rejeu. */
  saisieLe: string;
  /** Libellé montré au chauffeur dans la liste d'attente. */
  libelle: string;
  essais: number;
  /** Dernier refus du serveur, s'il y en a eu un. */
  erreur?: string;
}

/**
 * Âge maximal accepté pour une date de saisie venue du téléphone.
 *
 * L'horloge d'un appareil peut être fausse, et la valeur arrive d'un
 * formulaire : sans borne, une saisie pourrait se ranger dans un mois déjà
 * clôturé et fausser une marge après coup.
 */
export const ANCIENNETE_MAX_JOURS = 30;

/**
 * Instant à retenir pour une saisie rejouée.
 *
 * Hors des bornes — horloge déréglée, valeur trafiquée, date future — on
 * retombe sur l'heure du serveur : mieux vaut une saisie datée du rejeu
 * qu'une saisie datée n'importe quand.
 */
export function instantSaisie(valeur: string | null | undefined, maintenant = new Date()): Date {
  if (!valeur) return maintenant;

  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return maintenant;

  const plancher = maintenant.getTime() - ANCIENNETE_MAX_JOURS * 24 * 60 * 60 * 1000;
  // Une minute de tolérance : les horloges ne sont jamais exactement d'accord.
  const plafond = maintenant.getTime() + 60 * 1000;

  if (date.getTime() < plancher || date.getTime() > plafond) return maintenant;
  return date;
}
