import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

/**
 * Historique des taux GNF ⇄ CFA réellement pratiqués.
 *
 * `TauxChange` restait inutilisé et faisait doublon avec
 * `Parametres.tauxReferenceXof`, saisi à la main. Or CLAUDE.md définit le taux
 * de référence comme « le dernier connu » : il doit donc être **observé**, pas
 * tapé. Chaque transaction en devise, qui fige déjà son équivalent GNF au taux
 * réel, alimente cet historique et met à jour la référence de pré-remplissage.
 */
const ECART_SIGNIFICATIF = 0.005; // 0,5 %

/**
 * Enregistre le taux constaté sur une transaction, si l'écart avec le dernier
 * connu le justifie — inutile de créer une ligne pour une variation de 0,1 %.
 */
export async function observerTaux(montantDevise: number, montantGnf: number) {
  if (montantDevise <= 0 || montantGnf <= 0) return;

  const taux = montantGnf / montantDevise;
  // Un taux aberrant vient d'une saisie erronée, pas du marché.
  if (!Number.isFinite(taux) || taux < 1 || taux > 1000) return;

  const dernier = await prisma.tauxChange.findFirst({
    where: { devise: "XOF" },
    orderBy: { dateEffet: "desc" },
  });

  if (dernier) {
    const precedent = n(dernier.tauxEnGnf);
    if (precedent > 0 && Math.abs(taux - precedent) / precedent < ECART_SIGNIFICATIF) return;
  }

  await prisma.tauxChange.create({
    data: { devise: "XOF", tauxEnGnf: taux },
  });

  // La référence de pré-remplissage suit le dernier taux observé.
  const parametres = await prisma.parametres.findFirst({ select: { id: true } });
  if (parametres) {
    await prisma.parametres.update({
      where: { id: parametres.id },
      data: { tauxReferenceXof: taux },
    });
  }
}

export interface PointTaux {
  taux: number;
  dateEffet: Date;
}

/** Derniers taux observés, du plus récent au plus ancien. */
export async function historiqueTaux(limite = 10): Promise<PointTaux[]> {
  const lignes = await prisma.tauxChange.findMany({
    where: { devise: "XOF" },
    orderBy: { dateEffet: "desc" },
    take: limite,
  });

  return lignes.map((l) => ({ taux: n(l.tauxEnGnf), dateEffet: l.dateEffet }));
}
