import type { StatutVoyage } from "@prisma/client";

/**
 * Ce que le chauffeur a réellement à faire, selon l'état de sa mission.
 *
 * L'écran présentait tout en même temps : 22 champs et 10 boutons sur quatre
 * écrans de défilement, dont neuf formulaires sans rapport avec l'instant.
 * Debout à un poste-frontière, au pouce, il fallait tout parcourir pour
 * trouver la seule action attendue.
 *
 * Le voyage porte déjà une machine à états complète. Elle sert désormais à
 * décider ce qui s'ouvre : le reste demeure accessible, replié, à un geste.
 */
export type Volet =
  | "rotations"
  | "froid"
  | "arret"
  | "chargement"
  | "livraison"
  | "douane"
  | "depense";

/** Volets ouverts d'office pour un état donné. Les autres restent repliés. */
export function voletsOuverts(statut: StatutVoyage): Volet[] {
  switch (statut) {
    // En route vers le chargement : rien à saisir sinon les frais de route.
    case "PLANIFIE":
    case "EN_ROUTE_CHARGEMENT":
      return ["depense"];

    // Sur place : c'est le moment de constater ce qu'on charge.
    case "EN_ATTENTE_CHARGEMENT":
      return ["chargement"];

    // En route avec la marchandise : température, arrêts, postes de douane.
    case "EN_COURS":
      return ["froid", "arret", "douane"];

    // Arrivé : on décharge et on fait attester la remise.
    case "ARRIVE_DESTINATION":
    case "EN_DECHARGEMENT":
      return ["livraison", "rotations"];

    // Mission close : plus rien n'est attendu, tout reste consultable.
    default:
      return [];
  }
}

/** Phrase affichée en tête : l'action attendue, en clair. */
export function actionAttendue(statut: StatutVoyage): string | null {
  switch (statut) {
    case "PLANIFIE":
      return "Déclare ton départ quand tu prends la route.";
    case "EN_ROUTE_CHARGEMENT":
      return "Signale ton arrivée au point de chargement.";
    case "EN_ATTENTE_CHARGEMENT":
      return "Note les quantités reçues au chargement.";
    case "EN_COURS":
      return "Relève la température et signale tes arrêts.";
    case "ARRIVE_DESTINATION":
    case "EN_DECHARGEMENT":
      return "Note les quantités livrées et fais dicter le code du client.";
    default:
      return null;
  }
}
