/**
 * Unités de mesure — partie pure.
 *
 * Ces constantes et fonctions ne touchent pas la base : elles servent aussi
 * bien au seed, aux composants clients qu'aux tests. Les laisser dans le
 * module serveur (`src/lib/donnees/unites.ts`) y ferait entrer `server-only`,
 * qui casse toute exécution hors Next.
 */

/**
 * Unités livrées à l'installation. Elles ne sont qu'un point de départ :
 * l'exploitation ajoute les siennes depuis l'écran Unités.
 */
export const UNITES_INITIALES = [
  { nom: "Tonne", symbole: "t", facteurTonne: 1, ordre: 10 },
  { nom: "Kilogramme", symbole: "kg", facteurTonne: 0.001, ordre: 20 },
  { nom: "Sac de 50 kg", symbole: "sac", facteurTonne: 0.05, ordre: 30 },
  { nom: "Carton", symbole: "carton", facteurTonne: null, ordre: 40 },
  { nom: "Palette", symbole: "palette", facteurTonne: null, ordre: 50 },
  { nom: "Mètre cube", symbole: "m³", facteurTonne: null, ordre: 60 },
  { nom: "Litre", symbole: "L", facteurTonne: null, ordre: 70 },
  { nom: "Tête", symbole: "tête", facteurTonne: null, ordre: 80 },
  { nom: "Unité", symbole: "u", facteurTonne: null, ordre: 90 },
] as const;

/**
 * Tonnage total d'un chargement, lorsque toutes les lignes sont convertibles.
 *
 * Renvoie `null` dès qu'une seule ligne ne l'est pas : additionner des tonnes
 * et des têtes de bétail donnerait un nombre qui ne veut rien dire, et il vaut
 * mieux ne rien afficher qu'un total faux.
 */
export function tonnageTotal(
  lignes: { quantite: number | null; facteurTonne: number | null }[],
): number | null {
  let total = 0;
  for (const l of lignes) {
    if (l.quantite === null) continue;
    if (l.facteurTonne === null) return null;
    total += l.quantite * l.facteurTonne;
  }
  return Math.round(total * 1000) / 1000;
}

/** Espace fine insécable, comme pour les montants. */
const ESPACE = " ";

/** Formate une quantité avec son unité : `12 t`, `240 sac`. */
export function formatQuantite(
  quantite: number | null | undefined,
  symbole: string,
): string {
  if (quantite === null || quantite === undefined) return "—";
  // Les décimales ne s'affichent que si la quantité en porte : « 240 sac »
  // plutôt que « 240,000 sac ».
  const texte = Number.isInteger(quantite)
    ? Math.abs(quantite).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE)
    : quantite.toFixed(3).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  return `${quantite < 0 ? "−" : ""}${texte}${ESPACE}${symbole}`;
}
