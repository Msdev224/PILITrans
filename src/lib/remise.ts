/**
 * Ce qui est remis au chauffeur au départ — partie pure.
 *
 * Le formulaire envoie des colonnes parallèles : un objet, un montant, une
 * devise et un équivalent GNF par ligne. L'alignement entre ces colonnes est
 * ce qui fait tenir la ventilation, et il casse en silence — une ligne en GNF
 * n'affiche pas de champ d'équivalent, si bien qu'un champ caché doit tout de
 * même occuper sa place. Sans lui, l'équivalent d'une ligne en CFA se
 * retrouverait attribué à la ligne suivante.
 */
import type { Devise, TypeDepense } from "@prisma/client";

/** Une somme remise, avec ce à quoi elle est destinée. */
export interface LigneRemise {
  objet: TypeDepense;
  montant: number;
  devise: Devise;
  montantGnf: number;
}

/** "1 200,50" → 1200.5 ; "" ou illisible → 0. */
function nombre(brut: string | undefined): number {
  const net = (brut ?? "").replace(",", ".").replace(/\s/g, "");
  if (net === "") return 0;
  const valeur = Number(net);
  return Number.isFinite(valeur) ? valeur : 0;
}

/** Les lignes de remise saisies dans le formulaire, à plat. */
export function lignesRemise(colonnes: {
  objets: string[];
  montants: string[];
  devises: string[];
  equivalents: string[];
}): LigneRemise[] {
  return colonnes.objets
    .map((objet, i) => {
      const devise = (colonnes.devises[i] ?? "GNF") as Devise;
      const montant = nombre(colonnes.montants[i]);
      return {
        objet: objet as TypeDepense,
        montant,
        devise,
        // En devise, l'équivalent est saisi au taux réel du jour, jamais
        // calculé : le taux GNF⇄CFA bouge d'une semaine à l'autre.
        montantGnf: devise === "GNF" ? montant : nombre(colonnes.equivalents[i]),
      };
    })
    // Une ligne à zéro est une saisie abandonnée, pas une remise.
    .filter((l) => l.montant > 0);
}
