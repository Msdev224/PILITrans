/**
 * Détail des pièces d'une réparation — partie pure.
 *
 * Une intervention se paie rarement d'une seule façon. Le garage chiffre à
 * part la pièce dont on a discuté le prix, et met les autres dans un montant
 * global qu'il ne détaille pas. Les deux coexistent dans la même facture.
 *
 * Ce module n'invente pas de clé de répartition pour le forfait : le répartir
 * entre les pièces donnerait des chiffres que personne n'a payés. Il reste un
 * poste à lui, à côté des lignes chiffrées.
 */

/** Une pièce, telle qu'elle se saisit. */
export interface LignePiece {
  designation: string;
  /** Prix d'achat. Zéro quand la pièce a été réparée, pas rachetée. */
  coutAchat: number;
  /** Prix de la remise en état, quand il est chiffré pour cette pièce seule. */
  coutReparation: number;
  /** Vrai quand la remise en état est couverte par le forfait. */
  auForfait: boolean;
}

/** Nombre saisi dans un formulaire : virgule française, espaces, vide. */
function nombre(valeur: FormDataEntryValue | undefined): number {
  if (typeof valeur !== "string") return 0;
  const net = valeur.replace(/\s/g, "").replace(",", ".");
  const n = Number(net);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Relit les lignes de pièces envoyées par le formulaire.
 *
 * Les quatre champs arrivent en colonnes parallèles, une entrée par ligne.
 * `Object.fromEntries` — utilisé pour le reste du formulaire — ne garderait
 * que la dernière valeur de chaque nom : ces champs se lisent donc à part,
 * avec `getAll`.
 *
 * `auForfait` voyage dans un champ caché valant « 1 » ou « 0 », jamais dans
 * une case à cocher : une case décochée n'est pas envoyée, et la colonne se
 * décalerait d'un cran par rapport aux trois autres — le forfait se
 * retrouverait attribué à la mauvaise pièce.
 *
 * Une ligne sans désignation est ignorée : c'est une ligne vide qu'on a
 * ajoutée puis laissée de côté, pas une pièce.
 */
export function lirePieces(donnees: FormData): LignePiece[] {
  const designations = donnees.getAll("pieceDesignation");
  const achats = donnees.getAll("pieceAchat");
  const reparations = donnees.getAll("pieceReparation");
  const forfaits = donnees.getAll("pieceAuForfait");

  const lignes: LignePiece[] = [];
  for (const [i, brut] of designations.entries()) {
    const designation = typeof brut === "string" ? brut.trim() : "";
    if (!designation) continue;

    const auForfait = forfaits[i] === "1";
    lignes.push({
      designation,
      coutAchat: nombre(achats[i]),
      // Une pièce au forfait n'a pas de coût de réparation propre : le
      // montant est porté par le forfait de l'intervention.
      coutReparation: auForfait ? 0 : nombre(reparations[i]),
      auForfait,
    });
  }
  return lignes;
}

/**
 * Ce que coûtent les pièces d'une réparation.
 *
 * Achats + remises en état chiffrées + forfait. Le résultat alimente
 * `Reparation.coutPieces`, que lisent la fiche du camion, la marge et les
 * alertes : elles continuent de ne voir qu'un seul nombre, quelle que soit la
 * façon dont il a été composé.
 */
export function totalPieces(lignes: LignePiece[], forfait: number): number {
  const detail = lignes.reduce((t, p) => t + p.coutAchat + p.coutReparation, 0);
  return detail + (forfait > 0 ? forfait : 0);
}
