import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { n, nOuNull } from "@/lib/utils";

/**
 * Caisse de l'entreprise.
 *
 * Le point délicat est le double comptage. L'argent remis à un chauffeur sort
 * de la caisse **au moment où on le lui donne**. Quand il le dépense ensuite,
 * rien ne ressort une seconde fois : la dépense est déjà financée. Compter les
 * deux ferait apparaître un trou qui n'existe pas.
 *
 * D'où la règle : une dépense payée sur la caisse d'un chauffeur (`depenseId`
 * rattaché à un mouvement) ne pèse pas sur la trésorerie. Seules les dépenses
 * réglées directement par l'entreprise en sortent.
 */

export type SensMouvement = "ENTREE" | "SORTIE";

export interface LigneTresorerie {
  id: string;
  date: Date;
  sens: SensMouvement;
  libelle: string;
  detail: string | null;
  /** `null` quand l'écriture ne déclare aucun moyen. */
  moyen: string | null;
  reference: string | null;
  montantGnf: number;
  /** Solde après cette opération, du plus ancien au plus récent. */
  soldeApresGnf: number;
}

export interface Tresorerie {
  soldeInitialGnf: number;
  dateSoldeInitial: Date | null;
  /** Encaissements clients. */
  entreesGnf: number;
  /** Dépenses directes, avances remises, frais de transfert. */
  sortiesGnf: number;
  /** Commissions d'envoi, isolées : ce sont des coûts, pas de l'argent remis. */
  fraisGnf: number;
  soldeGnf: number;
  /** Argent détenu par les chauffeurs et non encore justifié. */
  detenuParChauffeursGnf: number;
  lignes: LigneTresorerie[];
}

/**
 * Totaux de trésorerie, sur toute la durée.
 *
 * Calculés en base : un solde est cumulatif, le borner le fausserait. Les
 * signes reproduisent exactement ceux du journal affiché — une dépense réglée
 * sur la caisse d'un chauffeur n'y figure pas, sa sortie ayant déjà été comptée
 * à la remise de l'avance.
 */
async function totauxTresorerie() {
  const [regles, depensesDirectes, avances, retours, fraisHorsDepense, fraisTous] =
    await Promise.all([
      prisma.paiement.aggregate({ _sum: { montantGnf: true } }),
      prisma.depense.aggregate({ where: { mouvementCaisse: null }, _sum: { montantGnf: true } }),
      prisma.mouvementCaisse.aggregate({ where: { type: "AVANCE" }, _sum: { montantGnf: true } }),
      // Reliquat rendu : tout ce qui n'est ni une avance ni une dépense de caisse.
      prisma.mouvementCaisse.aggregate({
        where: { type: { notIn: ["AVANCE", "DEPENSE"] } },
        _sum: { montantGnf: true },
      }),
      prisma.mouvementCaisse.aggregate({
        where: { type: { not: "DEPENSE" } },
        _sum: { fraisGnf: true },
      }),
      // Le total « frais » affiché porte sur tous les mouvements, y compris les
      // dépenses de caisse : comportement conservé tel quel.
      prisma.mouvementCaisse.aggregate({ _sum: { fraisGnf: true } }),
      ]);

  const entreesGnf = n(regles._sum.montantGnf) + n(retours._sum.montantGnf);
  const sortiesGnf =
    n(depensesDirectes._sum.montantGnf) +
    n(avances._sum.montantGnf) +
    n(fraisHorsDepense._sum.fraisGnf);

  return {
    entreesGnf,
    sortiesGnf,
    fraisGnf: n(fraisTous._sum.fraisGnf),
    // Ce que les chauffeurs détiennent : avances reçues moins justifié ou rendu.
    detenuGnf: n(avances._sum.montantGnf) - n(retours._sum.montantGnf) - n(await depensesDeCaisse()),
  };
}

/** Dépenses payées sur une caisse chauffeur : elles réduisent ce qu'il détient. */
async function depensesDeCaisse() {
  const r = await prisma.mouvementCaisse.aggregate({
    where: { type: "DEPENSE" },
    _sum: { montantGnf: true },
  });
  return n(r._sum.montantGnf);
}

async function tresorerieBrute(): Promise<Tresorerie> {
  /*
   * Les totaux portent sur toute la durée, l'affichage sur les dernières
   * écritures.
   *
   * Le journal était relu en entier — tous les règlements, toutes les dépenses,
   * tous les mouvements de caisse — pour afficher un écran. Les totaux, eux, ne
   * se fenêtrent pas : un solde est cumulatif par nature. Ils passent donc par
   * des agrégats SQL, exacts quel que soit le volume, et le solde courant de
   * chaque ligne affichée se déduit en remontant depuis le solde final.
   */
  const DERNIERES = 200;

  const [parametres, paiements, depenses, mouvements, totaux] = await Promise.all([
    prisma.parametres.findFirst({
      select: { soldeCaisseInitial: true, dateSoldeInitial: true },
    }),
    prisma.paiement.findMany({
      include: {
        facture: { select: { numero: true, client: { select: { nom: true } } } },
        moyen: { select: { nom: true } },
      },
      orderBy: { date: "desc" },
      take: DERNIERES,
    }),
    // Les dépenses réglées sur la caisse d'un chauffeur sont exclues : leur
    // sortie a déjà été comptée à la remise de l'avance.
    prisma.depense.findMany({
      where: { mouvementCaisse: null },
      include: { camion: { select: { nom: true } }, moyen: { select: { nom: true } } },
      orderBy: { date: "desc" },
      take: DERNIERES,
    }),
    prisma.mouvementCaisse.findMany({
      include: { chauffeur: { select: { nom: true } }, moyen: { select: { nom: true } } },
      orderBy: { date: "desc" },
      take: DERNIERES,
    }),
    totauxTresorerie(),
  ]);

  const brut: Omit<LigneTresorerie, "soldeApresGnf">[] = [];

  for (const p of paiements) {
    brut.push({
      id: `pai-${p.id}`,
      date: p.date,
      sens: "ENTREE",
      libelle: `Règlement ${p.facture.client.nom}`,
      detail: p.facture.numero,
      moyen: p.moyen?.nom ?? null,
      reference: p.reference,
      montantGnf: n(p.montantGnf),
    });
  }

  for (const d of depenses) {
    brut.push({
      id: `dep-${d.id}`,
      date: d.date,
      sens: "SORTIE",
      libelle: d.description || d.type.replaceAll("_", " ").toLowerCase(),
      detail: d.camion?.nom ?? null,
      moyen: d.moyen?.nom ?? null,
      reference: null,
      montantGnf: n(d.montantGnf),
    });
  }

  for (const m of mouvements) {
    // Une DÉPENSE de caisse chauffeur ne touche pas la trésorerie : l'argent
    // était déjà sorti à l'avance. Seuls l'avance et le remboursement comptent.
    if (m.type === "DEPENSE") continue;

    brut.push({
      id: `cai-${m.id}`,
      date: m.date,
      sens: m.type === "AVANCE" ? "SORTIE" : "ENTREE",
      libelle:
        m.type === "AVANCE"
          ? `Avance à ${m.chauffeur.nom}`
          : `Reliquat rendu par ${m.chauffeur.nom}`,
      detail: m.motif,
      moyen: m.moyen?.nom ?? null,
      reference: m.reference,
      montantGnf: n(m.montantGnf),
    });

    // Les frais d'envoi sont une sortie distincte : ils ne sont pas remis au
    // chauffeur et ne lui seront jamais réclamés.
    const frais = nOuNull(m.fraisGnf) ?? 0;
    if (frais > 0) {
      brut.push({
        id: `frais-${m.id}`,
        date: m.date,
        sens: "SORTIE",
        libelle: `Frais d'envoi — ${m.chauffeur.nom}`,
        detail: m.moyen?.nom ?? null,
        moyen: m.moyen?.nom ?? null,
        reference: m.reference,
        montantGnf: frais,
      });
    }
  }

  // Du plus récent au plus ancien : c'est l'ordre d'affichage, et celui dans
  // lequel le solde se remonte.
  brut.sort((a, b) => b.date.getTime() - a.date.getTime());

  const soldeInitialGnf = nOuNull(parametres?.soldeCaisseInitial) ?? 0;
  const soldeGnf = soldeInitialGnf + totaux.entreesGnf - totaux.sortiesGnf;

  /*
   * Le solde de chaque ligne se déduit en remontant depuis le solde final.
   *
   * Le calcul partait du solde d'ouverture et parcourait tout le journal ;
   * il fallait donc tout charger. Or le solde après la dernière écriture est
   * connu — c'est le solde actuel — et celui de l'écriture précédente s'en
   * déduit en retirant l'effet de la plus récente. Le résultat est identique,
   * sans lire une ligne de plus que ce qui s'affiche.
   */
  let courant = soldeGnf;
  const lignes: LigneTresorerie[] = brut.map((l) => {
    const ligne = { ...l, soldeApresGnf: courant };
    courant -= l.sens === "ENTREE" ? l.montantGnf : -l.montantGnf;
    return ligne;
  });

  return {
    soldeInitialGnf,
    dateSoldeInitial: parametres?.dateSoldeInitial ?? null,
    entreesGnf: totaux.entreesGnf,
    sortiesGnf: totaux.sortiesGnf,
    fraisGnf: totaux.fraisGnf,
    soldeGnf,
    detenuParChauffeursGnf: Math.max(totaux.detenuGnf, 0),
    lignes,
  };
}

/** Mémoïsé : le rail et la page la demandent tous deux sur un même rendu. */
export const tresorerie = cache(tresorerieBrute);
