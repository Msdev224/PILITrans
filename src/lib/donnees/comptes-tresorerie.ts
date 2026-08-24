import "server-only";

import type { TypeCompte } from "@prisma/client";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export interface SoldeCompte {
  id: string;
  nom: string;
  type: TypeCompte;
  reference: string | null;
  devise: "GNF" | "XOF";
  actif: boolean;
  /** Nom du chauffeur qui détient ce compte, le cas échéant. */
  detenteur: string | null;
  soldeInitialGnf: number;
  entreesGnf: number;
  sortiesGnf: number;
  /** Ce que le compte détient réellement aujourd'hui. */
  soldeGnf: number;
  /** Nombre d'écritures rattachées : un compte à zéro écriture se supprime. */
  nbEcritures: number;
}

/**
 * Solde de chaque emplacement où l'argent se trouve.
 *
 * Le calcul additionne quatre sources qui, chacune, déplacent de l'argent :
 *
 *  - les **règlements clients**, qui entrent quelque part ;
 *  - les **dépenses**, qui sortent de quelque part ;
 *  - les **mouvements de caisse** des chauffeurs — une avance sort du compte
 *    qui la finance et entre sur celui du chauffeur ;
 *  - les **opérations de trésorerie** — dépôts, retraits, transferts,
 *    apports, ajustements — qui ne correspondent à aucune opération
 *    commerciale mais déplacent bien de l'argent.
 *
 * Les écritures sans emplacement renseigné ne sont comptées nulle part : les
 * rattacher au hasard donnerait des soldes faux, ce qui est pire que des
 * soldes incomplets. L'écran le signale explicitement.
 */
export const soldesParCompte = cache(async (): Promise<SoldeCompte[]> => {
  const [comptes, paiements, depenses, mouvements, operations, transferts] = await Promise.all([
    prisma.compteTresorerie.findMany({
      orderBy: [{ ordre: "asc" }, { nom: "asc" }],
      include: { chauffeur: { select: { nom: true } } },
    }),
    prisma.paiement.groupBy({
      by: ["compteId"],
      where: { compteId: { not: null } },
      _sum: { montantGnf: true },
      _count: true,
    }),
    prisma.depense.groupBy({
      by: ["compteId"],
      where: { compteId: { not: null } },
      _sum: { montantGnf: true },
      _count: true,
    }),
    prisma.mouvementCaisse.findMany({
      where: { compteId: { not: null } },
      select: { compteId: true, type: true, montantGnf: true, chauffeurId: true },
    }),
    prisma.operationTresorerie.findMany({
      select: { compteId: true, versId: true, motif: true, montantGnf: true, fraisGnf: true },
    }),
    // Les comptes chauffeur sont alimentés par les avances : on les retrouve
    // par le chauffeur, pas par `compteId` — l'avance sort du compte payeur.
    prisma.mouvementCaisse.findMany({
      select: { chauffeurId: true, type: true, montantGnf: true },
    }),
  ]);

  const entrees = new Map<string, number>();
  const sorties = new Map<string, number>();
  const ecritures = new Map<string, number>();

  const ajouter = (carte: Map<string, number>, cle: string | null, valeur: number) => {
    if (!cle) return;
    carte.set(cle, (carte.get(cle) ?? 0) + valeur);
  };

  // --- Règlements clients : de l'argent qui entre ---
  for (const p of paiements) {
    ajouter(entrees, p.compteId, n(p._sum.montantGnf));
    ajouter(ecritures, p.compteId, p._count);
  }

  // --- Dépenses : de l'argent qui sort ---
  for (const d of depenses) {
    ajouter(sorties, d.compteId, n(d._sum.montantGnf));
    ajouter(ecritures, d.compteId, d._count);
  }

  /*
   * --- Caisse des chauffeurs ---
   *
   * Une avance a DEUX effets : elle sort du compte qui la finance et entre sur
   * celui du chauffeur. Ne compter que le premier ferait disparaître l'argent
   * au moment précis où il change de mains.
   */
  const compteParChauffeur = new Map(
    comptes.filter((c) => c.chauffeurId).map((c) => [c.chauffeurId!, c.id]),
  );

  for (const m of mouvements) {
    const montant = n(m.montantGnf);
    ajouter(ecritures, m.compteId, 1);
    if (m.type === "AVANCE") ajouter(sorties, m.compteId, montant);
    else ajouter(entrees, m.compteId, montant); // remboursement rendu au compte
  }

  for (const m of transferts) {
    const compteChauffeur = compteParChauffeur.get(m.chauffeurId);
    if (!compteChauffeur) continue;
    const montant = n(m.montantGnf);

    if (m.type === "AVANCE") ajouter(entrees, compteChauffeur, montant);
    else ajouter(sorties, compteChauffeur, montant); // dépense justifiée ou reliquat rendu
    ajouter(ecritures, compteChauffeur, 1);
  }

  // --- Opérations purement financières ---
  for (const o of operations) {
    const montant = n(o.montantGnf);
    const frais = n(o.fraisGnf);
    ajouter(ecritures, o.compteId, 1);

    if (o.motif === "APPORT") {
      ajouter(entrees, o.compteId, montant);
    } else if (o.motif === "AJUSTEMENT") {
      // Un ajustement peut aller dans les deux sens : le signe porte le sens.
      if (montant >= 0) ajouter(entrees, o.compteId, montant);
      else ajouter(sorties, o.compteId, -montant);
    } else {
      // Dépôt, retrait, transfert, prélèvement : ça sort d'ici…
      ajouter(sorties, o.compteId, montant);
      // …et ça arrive là, quand une destination est connue.
      if (o.versId) {
        ajouter(entrees, o.versId, montant);
        ajouter(ecritures, o.versId, 1);
      }
    }

    // Les frais sortent du compte d'origine sans arriver nulle part.
    if (frais > 0) ajouter(sorties, o.compteId, frais);
  }

  return comptes.map((c) => {
    const initial = n(c.soldeInitial);
    const e = entrees.get(c.id) ?? 0;
    const s = sorties.get(c.id) ?? 0;

    return {
      id: c.id,
      nom: c.nom,
      type: c.type,
      reference: c.reference,
      devise: c.devise,
      actif: c.actif,
      detenteur: c.chauffeur?.nom ?? null,
      soldeInitialGnf: initial,
      entreesGnf: e,
      sortiesGnf: s,
      soldeGnf: initial + e - s,
      nbEcritures: ecritures.get(c.id) ?? 0,
    };
  });
});

/**
 * Écritures d'argent qui ne disent pas d'où elles viennent.
 *
 * Tant qu'il en reste, le total des emplacements ne reconstitue pas la
 * trésorerie réelle. L'écran doit le dire plutôt que d'afficher un total
 * faussement rassurant.
 */
export const ecrituresSansCompte = cache(async () => {
  const [paiements, depenses, mouvements] = await Promise.all([
    prisma.paiement.aggregate({ where: { compteId: null }, _sum: { montantGnf: true }, _count: true }),
    prisma.depense.aggregate({ where: { compteId: null }, _sum: { montantGnf: true }, _count: true }),
    prisma.mouvementCaisse.aggregate({ where: { compteId: null }, _sum: { montantGnf: true }, _count: true }),
  ]);

  return {
    nb: paiements._count + depenses._count + mouvements._count,
    reglementsGnf: n(paiements._sum.montantGnf),
    depensesGnf: n(depenses._sum.montantGnf),
    caisseGnf: n(mouvements._sum.montantGnf),
  };
});

/** Comptes proposés à la saisie. */
export const comptesActifs = cache(async () => {
  return prisma.compteTresorerie.findMany({
    where: { actif: true },
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    select: { id: true, nom: true, type: true, devise: true },
  });
});
