import "server-only";

import { ecartLivraison } from "@/lib/calculs";
import { n, nOuNull } from "@/lib/utils";

/**
 * Suivi d'une marchandise sur un voyage.
 *
 * Chaque ligne se lit seule : sa quantité chargée, ce que la douane a retenu,
 * ce qui a été livré, et le manquant qui en résulte. Un chargement mixte
 * n'autorise aucun total — additionner des tonnes et des sacs ne veut rien
 * dire, et un écart global masquerait la marchandise réellement en cause.
 */

export interface PrelevementLigne {
  id: string;
  quantite: number;
  lieu: string;
  pays: string;
  motif: string | null;
  montantGnf: number | null;
  reference: string | null;
  date: string;
}

export interface LigneVue {
  id: string;
  designation: string;
  client: string | null;
  uniteId: string;
  unite: string;
  symbole: string;
  facteurTonne: number | null;
  quantiteACharger: number | null;
  quantiteRecue: number | null;
  quantiteLivree: number | null;
  prelevements: PrelevementLigne[];
  /** Total retenu en douane, dans l'unité de la ligne. */
  prelevementQuantite: number;
  /** Contrepartie en argent des prélèvements, quand le poste en a réclamé. */
  prelevementGnf: number;
  /**
   * Manquant après déduction des prélèvements de douane. `null` tant que le
   * chargement ou la livraison n'a pas été constaté.
   */
  ecart: { manquant: number; pct: number } | null;
}

/**
 * Forme minimale attendue depuis Prisma, pour rester indépendant des `include`.
 * Les colonnes `Decimal` arrivent en objets : `Decimalish` couvre aussi bien
 * l'objet Prisma que le nombre issu d'un test.
 */
type Decimalish = { toString(): string } | number | string | null;

interface LigneBrute {
  id: string;
  designation: string;
  client: string | null;
  uniteId: string;
  ordre: number;
  quantiteACharger: Decimalish;
  quantiteRecue: Decimalish;
  quantiteLivree: Decimalish;
  unite: { nom: string; symbole: string; facteurTonne: Decimalish };
  prelevements?: {
    id: string;
    quantite: Decimalish;
    lieu: string;
    pays: string;
    motif: string | null;
    montantGnf: Decimalish;
    reference: string | null;
    date: Date;
  }[];
}

export function vueLignes(lignes: LigneBrute[]): LigneVue[] {
  return [...lignes]
    .sort((a, b) => a.ordre - b.ordre)
    .map((l) => {
      const prelevements = (l.prelevements ?? []).map((p) => ({
        id: p.id,
        quantite: n(p.quantite),
        lieu: p.lieu,
        pays: p.pays,
        motif: p.motif,
        montantGnf: p.montantGnf != null ? n(p.montantGnf) : null,
        reference: p.reference,
        date: p.date.toISOString(),
      }));

      const prelevementQuantite = prelevements.reduce((t, p) => t + p.quantite, 0);
      const recue = nOuNull(l.quantiteRecue);
      const livree = nOuNull(l.quantiteLivree);

      return {
        id: l.id,
        designation: l.designation,
        client: l.client,
        uniteId: l.uniteId,
        unite: l.unite.nom,
        symbole: l.unite.symbole,
        facteurTonne: nOuNull(l.unite.facteurTonne) ?? null,
        quantiteACharger: nOuNull(l.quantiteACharger) ?? null,
        quantiteRecue: recue ?? null,
        quantiteLivree: livree ?? null,
        prelevements,
        prelevementQuantite,
        prelevementGnf: prelevements.reduce((t, p) => t + (p.montantGnf ?? 0), 0),
        // La base de comparaison est ce qui a été chargé MOINS ce que la douane
        // a retenu : seul le reliquat est réellement manquant.
        ecart:
          recue !== undefined && livree !== undefined
            ? ecartLivraison(Math.max(recue - prelevementQuantite, 0), livree)
            : null,
      };
    });
}

/** `include` Prisma commun à tous les écrans qui affichent des marchandises. */
export const INCLURE_LIGNES = {
  orderBy: { ordre: "asc" },
  include: {
    unite: { select: { nom: true, symbole: true, facteurTonne: true } },
    prelevements: { orderBy: { date: "asc" } },
  },
} as const;

/** Résumé lisible d'un chargement : « Produits frais 12 t · Riz 240 sacs ». */
export function resumeChargement(lignes: LigneVue[], max = 3): string {
  if (lignes.length === 0) return "—";
  const parts = lignes
    .slice(0, max)
    .map((l) => `${l.designation}${l.quantiteACharger != null ? ` ${l.quantiteACharger} ${l.symbole}` : ""}`);
  return lignes.length > max ? `${parts.join(" · ")} +${lignes.length - max}` : parts.join(" · ");
}

/** Lignes présentant un manquant inexpliqué. */
export function lignesEnEcart(lignes: LigneVue[]): LigneVue[] {
  return lignes.filter((l) => l.ecart !== null && l.ecart.manquant > 0);
}
