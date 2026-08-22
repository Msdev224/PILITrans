import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Pays desservis.
 *
 * Saisis par l'exploitation plutôt que figés dans le code : ouvrir un corridor
 * ne doit pas demander un redéploiement. Chaque pays porte son indicatif
 * téléphonique, si bien qu'en ajouter un rend du même coup ses numéros
 * saisissables.
 */

export interface PaysVue {
  id: string;
  nom: string;
  code: string;
  indicatif: string;
  longueurTelephone: number | null;
  actif: boolean;
  ordre: number;
  /** Voyages, étapes et prélèvements qui s'y réfèrent. */
  nbUtilisations: number;
}

export interface OptionPays {
  id: string;
  nom: string;
  code: string;
  indicatif: string;
  longueurTelephone: number | null;
}

/** Pays proposés à la saisie. */
export async function paysActifs(): Promise<OptionPays[]> {
  return prisma.pays.findMany({
    where: { actif: true },
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true, code: true, indicatif: true, longueurTelephone: true },
  });
}

export async function listePays(): Promise<PaysVue[]> {
  const pays = await prisma.pays.findMany({
    orderBy: [{ actif: "desc" }, { ordre: "asc" }, { nom: "asc" }],
    include: {
      _count: {
        select: {
          voyagesDepart: true,
          voyagesArrivee: true,
          etapesDepart: true,
          etapesArrivee: true,
          prelevements: true,
        },
      },
    },
  });

  return pays.map((p) => ({
    id: p.id,
    nom: p.nom,
    code: p.code,
    indicatif: p.indicatif,
    longueurTelephone: p.longueurTelephone,
    actif: p.actif,
    ordre: p.ordre,
    nbUtilisations:
      p._count.voyagesDepart +
      p._count.voyagesArrivee +
      p._count.etapesDepart +
      p._count.etapesArrivee +
      p._count.prelevements,
  }));
}

/** Pays du siège, proposé par défaut à la saisie. */
export async function paysParDefaut(): Promise<OptionPays | null> {
  const liste = await paysActifs();
  return liste[0] ?? null;
}

/**
 * Indicatifs proposés à la saisie d'un numéro.
 *
 * Vient de la même table que les pays des voyages : ajouter un pays dans la
 * configuration le rend aussitôt disponible pour les téléphones. Les deux
 * listes ont divergé un temps, et on voyait dans les numéros des pays absents
 * de la configuration.
 */
export async function indicatifsPays() {
  const pays = await paysActifs();
  return pays.map((p) => ({
    code: p.indicatif,
    libelle: p.nom,
    longueur: p.longueurTelephone,
  }));
}
