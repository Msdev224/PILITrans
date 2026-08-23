import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Refuse toute écriture sur une mission annulée.
 *
 * Une mission annulée reste consultable — ses frais engagés et l'argent remis
 * au chauffeur doivent rester lisibles. Mais elle n'accepte plus rien : ni
 * dépense, ni étape, ni facture, ni avance, ni avancement de statut.
 *
 * Sans ce verrou, une saisie faite par erreur sur une course abandonnée
 * réapparaissait dans les coûts du camion sans qu'aucun écran ne la relie à
 * une mission vivante. Pour reprendre la main, on rétablit la mission — un
 * geste explicite, tracé au journal.
 */
export async function exigerMissionActive(voyageId: string | null | undefined): Promise<void> {
  if (!voyageId) return;

  const voyage = await prisma.voyage.findUnique({
    where: { id: voyageId },
    select: { statut: true, reference: true },
  });
  if (!voyage) return; // L'appelant a ses propres contrôles d'existence.

  if (voyage.statut === "ANNULE") {
    throw new Error(
      `La mission ${voyage.reference} est annulée : rien ne peut y être ajouté. ` +
        "Rétablis-la depuis sa fiche si elle doit reprendre.",
    );
  }
}

/**
 * Même contrôle, mais qui rend le motif au lieu de lever.
 *
 * Les actions de formulaire renvoient un état d'erreur affiché dans la
 * fenêtre. Une exception, elle, la fait disparaître sans un mot : on croit
 * que la saisie est passée alors qu'elle a été refusée. Les actions du
 * chauffeur, elles, gardent la version qui lève — leur file d'attente
 * s'appuie dessus pour marquer la saisie comme refusée.
 */
export async function refusMissionAnnulee(
  voyageId: string | null | undefined,
): Promise<string | null> {
  try {
    await exigerMissionActive(voyageId);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Cette mission est annulée.";
  }
}
