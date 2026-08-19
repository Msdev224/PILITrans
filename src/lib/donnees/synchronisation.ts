import { prisma } from "@/lib/prisma";

/**
 * Recalcule l'état d'un camion depuis les faits, plutôt que de le modifier
 * à la main à chaque endroit.
 *
 * Sans cela le statut saisi diverge de la réalité : un voyage démarre et le
 * camion reste « Disponible », une réparation l'immobilise sans que le parc
 * le sache. Les écrans devaient alors recouper voyages et statut pour compter
 * les camions en route — deux sources de vérité pour la même information.
 *
 * Priorité : une immobilisation prime sur une mission (un camion en panne au
 * milieu d'un voyage n'est pas « en voyage »), et un véhicule sorti du parc
 * reste hors service.
 */
export async function synchroniserCamion(camionId: string) {
  const camion = await prisma.camion.findUnique({
    where: { id: camionId },
    select: { id: true, actif: true, statut: true, kilometrage: true, refrigere: true },
  });
  if (!camion) return;

  // Un camion retiré du parc n'est pas remis en circulation par un calcul.
  if (!camion.actif) return;

  const [immobilisation, mission, dernierKm] = await Promise.all([
    prisma.reparation.findFirst({
      where: { camionId, statut: "EN_COURS", immobiliseDu: { not: null }, immobiliseAu: null },
      select: { id: true },
    }),
    prisma.voyage.findFirst({
      where: {
        camionId,
        statut: { in: ["EN_ATTENTE_CHARGEMENT", "EN_COURS", "ARRIVE_DESTINATION", "EN_DECHARGEMENT"] },
      },
      select: { id: true },
    }),
    // Compteur : le plus haut relevé jamais enregistré, voyages et étapes
    // confondus. On ne recule jamais un compteur kilométrique.
    prisma.$transaction([
      prisma.voyage.aggregate({ where: { camionId }, _max: { kmArrivee: true } }),
      prisma.etapeVoyage.aggregate({ where: { voyage: { camionId } }, _max: { kmArrivee: true } }),
    ]),
  ]);

  const statut = immobilisation ? "IMMOBILISE" : mission ? "EN_VOYAGE" : "DISPONIBLE";
  const kilometrage = Math.max(
    camion.kilometrage,
    dernierKm[0]._max.kmArrivee ?? 0,
    dernierKm[1]._max.kmArrivee ?? 0,
  );

  if (statut === camion.statut && kilometrage === camion.kilometrage) return;

  await prisma.camion.update({ where: { id: camionId }, data: { statut, kilometrage } });
}

/** Synchronise le camion d'un voyage, quand on ne connaît que le voyage. */
export async function synchroniserCamionDuVoyage(voyageId: string) {
  const voyage = await prisma.voyage.findUnique({
    where: { id: voyageId },
    select: { camionId: true },
  });
  if (voyage) await synchroniserCamion(voyage.camionId);
}
