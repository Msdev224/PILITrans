/**
 * Pays desservis — partie pure.
 *
 * Même raison d'être que `UNITES_INITIALES` : cette liste sert au seed, au
 * script de création du gérant et à la réinitialisation. Elle reste hors du
 * module serveur (`src/lib/donnees/pays.ts`) pour ne pas y traîner
 * `server-only`, qui casse toute exécution hors Next.
 *
 * Ce n'est qu'un point de départ. Ouvrir un corridor se fait depuis l'écran
 * Pays, sans redéploiement.
 */
export const PAYS_INITIAUX = [
  { nom: "Guinée", code: "GN", indicatif: "+224", longueurTelephone: 9, ordre: 10 },
  { nom: "Sénégal", code: "SN", indicatif: "+221", longueurTelephone: 9, ordre: 20 },
  { nom: "Mali", code: "ML", indicatif: "+223", longueurTelephone: 8, ordre: 30 },
  { nom: "Guinée-Bissau", code: "GW", indicatif: "+245", longueurTelephone: 9, ordre: 40 },
  { nom: "Côte d'Ivoire", code: "CI", indicatif: "+225", longueurTelephone: 10, ordre: 50 },
  { nom: "Sierra Leone", code: "SL", indicatif: "+232", longueurTelephone: 8, ordre: 60 },
  { nom: "Liberia", code: "LR", indicatif: "+231", longueurTelephone: 8, ordre: 70 },
  { nom: "Mauritanie", code: "MR", indicatif: "+222", longueurTelephone: 8, ordre: 80 },
] as const;
