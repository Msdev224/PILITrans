import { soldeCaisse } from "@/lib/calculs";
import { STATUTS_EN_ROUTE } from "@/lib/donnees/voyages";
import { INCLURE_LIGNES } from "@/lib/donnees/marchandises";
import { prisma } from "@/lib/prisma";
import { LIBELLE_TYPE_DEPENSE, n } from "@/lib/utils";

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
        paysDepart: { select: { nom: true, code: true } },
        paysArrivee: { select: { nom: true, code: true } },
      },
      orderBy: { dateDepart: "desc" },
    }),
    prisma.mouvementCaisse.findMany({ where: { chauffeurId }, orderBy: { date: "desc" } }),
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

  /*
   * Détail de ce que le chauffeur a reçu, et pour quoi.
   *
   * Un solde global ne lui dit rien : il a reçu tant pour la route, tant pour
   * manger, tant pour une réparation. Sans ce détail, il ne sait pas ce qui
   * lui reste à justifier ni sur quelle enveloppe il pioche.
   *
   * On ne filtre PAS sur la mission en cours : l'argent d'une mission encore
   * planifiée est déjà dans sa poche, et le masquer lui ferait croire qu'il
   * détient moins qu'en réalité. On s'arrête aux plus récentes — l'historique
   * complet d'un chauffeur qui roule depuis un an n'a pas sa place sur un
   * téléphone.
   */
  const references = new Map(
    (
      await prisma.voyage.findMany({
        where: { id: { in: mouvements.map((m) => m.voyageId).filter((v): v is string => !!v) } },
        select: { id: true, reference: true, villeArrivee: true },
      })
    ).map((v) => [v.id, v.reference ?? v.villeArrivee]),
  );

  const avances = mouvements
    .filter((m) => m.type === "AVANCE")
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      objet: m.objet ? (LIBELLE_TYPE_DEPENSE[m.objet] ?? "Divers") : (m.motif ?? "Frais de voyage"),
      montant: n(m.montant),
      devise: m.devise,
      montantGnf: n(m.montantGnf),
      date: m.date.toISOString(),
      /** Mission financée, pour distinguer deux enveloppes du même objet. */
      mission: m.voyageId ? (references.get(m.voyageId) ?? null) : null,
      pourCetteMission: !!mission && m.voyageId === mission.id,
    }));

  return { chauffeur, mission, prochaine, caisse, avances, parametres };
}

export type EspaceChauffeur = NonNullable<Awaited<ReturnType<typeof espaceChauffeur>>>;
