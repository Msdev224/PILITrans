/**
 * Moyens de paiement de départ — partie pure.
 *
 * Même raison d'être que `UNITES_INITIALES` et `PAYS_INITIAUX` : la liste sert
 * au seed, à la création du gérant et à la réinitialisation, et reste hors du
 * module serveur pour ne pas y traîner `server-only`.
 *
 * Elle existe parce que ces cinq lignes n'étaient posées que par la migration
 * `20260824180000_moyens_de_paiement_en_table`. Une migration ne s'exécute
 * qu'une fois : une base réinitialisée après coup se retrouvait avec **zéro**
 * moyen de paiement, et toute écriture de caisse échouait sur la clé étrangère
 * `MouvementCaisse_moyenId_fkey`. Une table de référence doit pouvoir être
 * reconstruite par le code, pas seulement par l'historique des migrations.
 *
 * Les identifiants sont repris tels quels de la migration : une base déjà en
 * service garde les siens, et les deux chemins convergent sur les mêmes clés.
 */
export const MOYENS_INITIAUX = [
  { id: "moyen_especes", code: "ESPECES", nom: "Espèces", ordre: 10 },
  { id: "moyen_orange_money", code: "ORANGE_MONEY", nom: "Orange Money", ordre: 20 },
  { id: "moyen_virement", code: "VIREMENT", nom: "Virement", ordre: 30 },
  { id: "moyen_cheque", code: "CHEQUE", nom: "Chèque", ordre: 40 },
  { id: "moyen_autre", code: "AUTRE", nom: "Autre", ordre: 90 },
] as const;
