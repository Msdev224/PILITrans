import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { LIBELLE_MOYEN_PAIEMENT, n, nOuNull } from "@/lib/utils";

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
  moyen: string;
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

async function tresorerieBrute(): Promise<Tresorerie> {
  const [parametres, paiements, depenses, mouvements] = await Promise.all([
    prisma.parametres.findFirst({
      select: { soldeCaisseInitial: true, dateSoldeInitial: true },
    }),
    prisma.paiement.findMany({
      include: { facture: { select: { numero: true, client: { select: { nom: true } } } } },
      orderBy: { date: "asc" },
    }),
    // Les dépenses réglées sur la caisse d'un chauffeur sont exclues : leur
    // sortie a déjà été comptée à la remise de l'avance.
    prisma.depense.findMany({
      where: { mouvementCaisse: null },
      include: { camion: { select: { nom: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.mouvementCaisse.findMany({
      include: { chauffeur: { select: { nom: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const brut: Omit<LigneTresorerie, "soldeApresGnf">[] = [];

  for (const p of paiements) {
    brut.push({
      id: `pai-${p.id}`,
      date: p.date,
      sens: "ENTREE",
      libelle: `Règlement ${p.facture.client.nom}`,
      detail: p.facture.numero,
      moyen: LIBELLE_MOYEN_PAIEMENT[p.moyen] ?? p.moyen,
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
      moyen: LIBELLE_MOYEN_PAIEMENT[d.moyen] ?? d.moyen,
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
      moyen: LIBELLE_MOYEN_PAIEMENT[m.moyen] ?? m.moyen,
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
        detail: LIBELLE_MOYEN_PAIEMENT[m.moyen] ?? m.moyen,
        moyen: LIBELLE_MOYEN_PAIEMENT[m.moyen] ?? m.moyen,
        reference: m.reference,
        montantGnf: frais,
      });
    }
  }

  brut.sort((a, b) => a.date.getTime() - b.date.getTime());

  const soldeInitialGnf = nOuNull(parametres?.soldeCaisseInitial) ?? 0;
  let solde = soldeInitialGnf;
  const lignes: LigneTresorerie[] = brut.map((l) => {
    solde += l.sens === "ENTREE" ? l.montantGnf : -l.montantGnf;
    return { ...l, soldeApresGnf: solde };
  });

  const entreesGnf = brut
    .filter((l) => l.sens === "ENTREE")
    .reduce((t, l) => t + l.montantGnf, 0);
  const sortiesGnf = brut
    .filter((l) => l.sens === "SORTIE")
    .reduce((t, l) => t + l.montantGnf, 0);
  const fraisGnf = mouvements.reduce((t, m) => t + (nOuNull(m.fraisGnf) ?? 0), 0);

  // Ce que les chauffeurs détiennent encore : avances reçues moins ce qu'ils
  // ont justifié ou rendu. Cet argent est sorti de la caisse mais n'est pas
  // encore une charge.
  const detenuParChauffeursGnf = mouvements.reduce((total, m) => {
    if (m.type === "AVANCE") return total + n(m.montantGnf);
    return total - n(m.montantGnf);
  }, 0);

  return {
    soldeInitialGnf,
    dateSoldeInitial: parametres?.dateSoldeInitial ?? null,
    entreesGnf,
    sortiesGnf,
    fraisGnf,
    soldeGnf: solde,
    detenuParChauffeursGnf: Math.max(detenuParChauffeursGnf, 0),
    lignes: lignes.reverse(),
  };
}

/** Mémoïsé : le rail et la page la demandent tous deux sur un même rendu. */
export const tresorerie = cache(tresorerieBrute);
