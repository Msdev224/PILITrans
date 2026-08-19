import { soldeCaisse } from "@/lib/calculs";
import { STATUTS_EN_ROUTE } from "@/lib/donnees/voyages";
import { INCLURE_LIGNES } from "@/lib/donnees/marchandises";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

/**
 * Tout ce dont l'espace chauffeur a besoin, pour le chauffeur connecté
 * uniquement — il ne voit jamais les missions des autres.
 */
export async function espaceChauffeur(chauffeurId: string) {
  const chauffeur = await prisma.chauffeur.findUnique({ where: { id: chauffeurId } });
  if (!chauffeur) return null;

  const [mission, mouvements, parametres] = await Promise.all([
    prisma.voyage.findFirst({
      where: { chauffeurId, statut: { in: [...STATUTS_EN_ROUTE] } },
      include: {
        camion: true,
        etapes: { orderBy: { ordre: "asc" } },
        depenses: { orderBy: { date: "desc" }, take: 5 },
        relevesTemp: { orderBy: { releveLe: "desc" }, take: 1 },
        lignes: INCLURE_LIGNES,
      },
      orderBy: { dateDepart: "desc" },
    }),
    prisma.mouvementCaisse.findMany({ where: { chauffeurId } }),
    prisma.parametres.findFirst(),
  ]);

  // Prochaine mission planifiée, s'il n'y a rien en cours.
  const prochaine = mission
    ? null
    : await prisma.voyage.findFirst({
        where: { chauffeurId, statut: "PLANIFIE" },
        include: { camion: true },
        orderBy: { dateDepart: "asc" },
      });

  const caisse = soldeCaisse(
    mouvements.map((m) => ({
      type: m.type,
      montant: n(m.montant),
      devise: m.devise,
      montantGnf: n(m.montantGnf),
    })),
  );

  return { chauffeur, mission, prochaine, caisse, parametres };
}

export type EspaceChauffeur = NonNullable<Awaited<ReturnType<typeof espaceChauffeur>>>;
