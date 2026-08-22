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
  /** Nom du destinataire, quand il diffère du client principal du voyage. */
  client: string | null;
  clientId: string | null;
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

  /** Preuve de livraison : où en est le code remis au client. */
  codeEnvoye: boolean;
  codeConfirme: boolean;
  codeEnvois: number;
  /** Trop d'essais ratés : la saisie est bloquée jusqu'à un code neuf. */
  codeBloque: boolean;
  /**
   * Le code en clair, pour dérouler une démonstration sans SMS réel.
   *
   * Vaut `null` sauf si l'exploitation a coché l'option correspondante dans
   * les Paramètres. Le code est une preuve de livraison : le montrer au
   * gérant lui permet de confirmer une livraison à la place du client, ce
   * qui vide la protection de son sens.
   */
  codeVisible: string | null;
  /**
   * Statut porté sur la facture. Une marchandise n'est « livrée » qu'une fois
   * le code confirmé ; conforme si aucun manquant ne subsiste après déduction
   * des prélèvements de douane.
   */
  statutLivraison: "EN_ATTENTE" | "CONFORME" | "NON_CONFORME";
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
  client: { nom: string } | null;
  clientId: string | null;
  uniteId: string;
  ordre: number;
  quantiteACharger: Decimalish;
  quantiteRecue: Decimalish;
  quantiteLivree: Decimalish;
  codeLivraison?: string | null;
  codeConfirmeLe?: Date | null;
  codeEnvois?: number;
  codeTentatives?: number;
  unite: { nom: string; symbole: string; facteurTonne: Decimalish };
  prelevements?: {
    id: string;
    quantite: Decimalish;
    lieu: string;
    pays: { nom: string } | null;
    motif: string | null;
    montantGnf: Decimalish;
    reference: string | null;
    date: Date;
  }[];
}

/**
 * Essais autorisés sur un code de livraison avant blocage.
 *
 * Déclaré ici et importé par l'action : deux constantes pour une même règle
 * finissent toujours par diverger, et l'écart se verrait comme un bouton
 * proposé alors que la saisie est déjà refusée.
 */
export const TENTATIVES_MAX_CODE = 8;

export function vueLignes(lignes: LigneBrute[], montrerCode = false): LigneVue[] {
  return [...lignes]
    .sort((a, b) => a.ordre - b.ordre)
    .map((l) => {
      const prelevements = (l.prelevements ?? []).map((p) => ({
        id: p.id,
        quantite: n(p.quantite),
        lieu: p.lieu,
        pays: p.pays?.nom ?? "—",
        motif: p.motif,
        montantGnf: p.montantGnf != null ? n(p.montantGnf) : null,
        reference: p.reference,
        date: p.date.toISOString(),
      }));

      const prelevementQuantite = prelevements.reduce((t, p) => t + p.quantite, 0);
      const recue = nOuNull(l.quantiteRecue);
      const livree = nOuNull(l.quantiteLivree);

      const ecart =
        recue !== undefined && livree !== undefined
          ? ecartLivraison(Math.max(recue - prelevementQuantite, 0), livree)
          : null;
      const codeConfirme = !!l.codeConfirmeLe;

      return {
        id: l.id,
        designation: l.designation,
        client: l.client?.nom ?? null,
        clientId: l.clientId,
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
        ecart,
        codeEnvoye: !!l.codeLivraison,
        codeConfirme,
        codeEnvois: l.codeEnvois ?? 0,
        codeBloque: (l.codeTentatives ?? 0) >= TENTATIVES_MAX_CODE,
        codeVisible: montrerCode ? (l.codeLivraison ?? null) : null,
        // Tant que le client n'a pas confirmé par son code, la livraison reste
        // en attente — même si le chauffeur a saisi une quantité.
        statutLivraison: !codeConfirme
          ? "EN_ATTENTE"
          : ecart && ecart.manquant > 0
            ? "NON_CONFORME"
            : "CONFORME",
      };
    });
}

/** `include` Prisma commun à tous les écrans qui affichent des marchandises. */
export const INCLURE_LIGNES = {
  orderBy: { ordre: "asc" },
  include: {
    unite: { select: { nom: true, symbole: true, facteurTonne: true } },
    client: { select: { nom: true } },
    prelevements: { orderBy: { date: "asc" }, include: { pays: { select: { nom: true } } } },
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
