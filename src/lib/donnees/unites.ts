import "server-only";

import { prisma } from "@/lib/prisma";
import { nOuNull } from "@/lib/utils";

/** Unité telle qu'elle est proposée à la saisie, sérialisable. */
export interface UniteProposee {
  id: string;
  nom: string;
  symbole: string;
  facteurTonne: number | null;
}

export interface UniteChoisie {
  id: string;
  nom: string;
  symbole: string;
  facteurTonne: number | null;
  actif: boolean;
  ordre: number;
  /** Nombre de lignes de marchandise qui s'en servent. */
  nbUtilisations: number;
}

/**
 * Unités proposées à la saisie.
 *
 * Une unité désactivée disparaît des listes mais reste lisible sur les voyages
 * passés : supprimer une unité utilisée rendrait illisibles des quantités déjà
 * enregistrées.
 */
export async function unitesActives(): Promise<UniteProposee[]> {
  const unites = await prisma.unite.findMany({
    where: { actif: true },
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true, symbole: true, facteurTonne: true },
  });

  /*
   * Le facteur revient de Prisma en `Decimal`, un objet.
   *
   * Ces unités sont passées telles quelles aux formulaires, qui sont des
   * composants clients : React refuse de sérialiser autre chose que des
   * valeurs simples et le signalait à chaque rendu. On rend donc un nombre,
   * comme le fait déjà `listeUnites`.
   */
  return unites.map((u) => ({
    id: u.id,
    nom: u.nom,
    symbole: u.symbole,
    facteurTonne: nOuNull(u.facteurTonne) ?? null,
  }));
}

export async function listeUnites(): Promise<UniteChoisie[]> {
  const unites = await prisma.unite.findMany({
    orderBy: [{ actif: "desc" }, { ordre: "asc" }, { nom: "asc" }],
    include: { _count: { select: { lignes: true } } },
  });

  return unites.map((u) => ({
    id: u.id,
    nom: u.nom,
    symbole: u.symbole,
    facteurTonne: nOuNull(u.facteurTonne) ?? null,
    actif: u.actif,
    ordre: u.ordre,
    nbUtilisations: u._count.lignes,
  }));
}

// Les helpers purs vivent dans `@/lib/unites` : le seed et les composants
// clients en ont besoin sans embarquer `server-only`.
export { formatQuantite, tonnageTotal, UNITES_INITIALES } from "@/lib/unites";

