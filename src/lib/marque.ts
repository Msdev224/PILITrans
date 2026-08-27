/**
 * Nom de l'application, faute de mieux.
 *
 * Constantes pures, sans accès base : elles servent de **repli** quand les
 * Paramètres ne sont pas encore renseignés — première installation, écran rendu
 * avant la première requête, ou base injoignable. Dès qu'une `raisonSociale`
 * existe, c'est elle qui s'affiche partout.
 *
 * Ne pas confondre avec les identifiants techniques (`DOSSIER_IMAGES`, nom de
 * la base hors-ligne du chauffeur, clés `localStorage`) : ceux-là gardent leur
 * valeur d'origine, la renommer romprait le lien avec les données déjà écrites.
 */
export const NOM_APPLICATION = "MS Trans";

/** Ce que fait l'application, affiché sous son nom. */
export const ACCROCHE_APPLICATION = "Cockpit flotte frigo";
