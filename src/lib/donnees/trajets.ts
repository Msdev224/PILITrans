import { proposerTrajet, type TrajetHistorique } from "@/lib/calculs";
import { tronconsDesVoyages } from "@/lib/donnees/carburant";
import { kmVoyage } from "@/lib/donnees/camions";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

/**
 * Historique exploitable pour la suggestion de trajet : un voyage n'y entre
 * que si sa distance est connue. La consommation vient des tronçons saisis
 * (elle vaut 0 si le chauffeur n'a pas relevé le carburant).
 */
export async function historiqueTrajets(): Promise<TrajetHistorique[]> {
  /*
   * Deux ans d'historique, pas davantage.
   *
   * La suggestion propose une distance et une recette d'après les courses
   * déjà faites. Un trajet vieux de cinq ans ne dit plus rien d'utile — ni sur
   * l'état de la route, ni sur le prix — et il pesait sur chaque ouverture du
   * formulaire de voyage, qui est l'écran le plus utilisé du cockpit.
   */
  const depuis = new Date(Date.now() - 730 * 86_400_000);

  const voyages = await prisma.voyage.findMany({
    where: { statut: { notIn: ["ANNULE", "PLANIFIE"] }, dateDepart: { gte: depuis } },
    select: {
      id: true,
      villeDepart: true,
      villeArrivee: true,
      distanceKm: true,
      kmDepart: true,
      kmArrivee: true,
      recetteGnf: true,
    },
  });

  const troncons = await tronconsDesVoyages(voyages.map((v) => v.id));
  const litresParVoyage = new Map<string, number>();
  for (const t of troncons) {
    litresParVoyage.set(t.voyageId, (litresParVoyage.get(t.voyageId) ?? 0) + t.litresConsommes);
  }

  return voyages
    .map((v) => ({
      villeDepart: v.villeDepart,
      villeArrivee: v.villeArrivee,
      distanceKm: kmVoyage(v),
      litresConsommes: litresParVoyage.get(v.id) ?? 0,
      recetteGnf: n(v.recetteGnf) || undefined,
    }))
    .filter((t) => t.distanceKm > 0);
}

export type Suggestion = ReturnType<typeof proposerTrajet>;

/** Estimation d'un trajet à partir des missions passées, sens inverse compris. */
export async function suggestionTrajet(depart: string, arrivee: string): Promise<Suggestion> {
  if (!depart.trim() || !arrivee.trim()) return { trouve: false, occurrences: 0 };
  return proposerTrajet(await historiqueTrajets(), depart, arrivee);
}
