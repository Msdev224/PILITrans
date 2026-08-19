import { consoTroncon } from "@/lib/calculs";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export interface TronconCalcule {
  etapeId: string;
  voyageId: string;
  libelle: string;
  distance: number;
  pleins: number;
  litresConsommes: number;
  litresPer100km: number;
}

/**
 * Consommation des tronçons d'une liste de voyages.
 * Un tronçon n'est retenu que s'il est complet : km de départ et d'arrivée
 * relevés, et niveau de réservoir renseigné aux deux bouts.
 */
export async function tronconsDesVoyages(voyageIds: string[]): Promise<TronconCalcule[]> {
  if (voyageIds.length === 0) return [];

  const etapes = await prisma.etapeVoyage.findMany({
    where: { voyageId: { in: voyageIds } },
    include: { ravitaillements: { select: { litres: true } } },
    orderBy: [{ voyageId: "asc" }, { ordre: "asc" }],
  });

  const complet = etapes.filter(
    (e) =>
      e.kmDepart != null &&
      e.kmArrivee != null &&
      e.carburantRestantDepart != null &&
      e.carburantRestantArrivee != null,
  );

  return complet.map((e) => {
    const resultat = consoTroncon({
      kmDepart: e.kmDepart!,
      kmArrivee: e.kmArrivee!,
      carburantRestantDepart: n(e.carburantRestantDepart),
      carburantRestantArrivee: n(e.carburantRestantArrivee),
      pleins: e.ravitaillements.map((r) => n(r.litres)).filter((l) => l > 0),
    });

    return {
      etapeId: e.id,
      voyageId: e.voyageId,
      libelle: `${e.villeDepart} → ${e.villeArrivee}`,
      ...resultat,
    };
  });
}

/**
 * Consommation moyenne (L/100 km) pondérée par la distance.
 * `null` si aucun tronçon exploitable — on n'affiche alors rien plutôt
 * qu'un chiffre inventé.
 */
export async function consoMoyenne(voyageIds: string[]): Promise<number | null> {
  const troncons = (await tronconsDesVoyages(voyageIds)).filter((t) => t.distance > 0);
  if (troncons.length === 0) return null;

  const distance = troncons.reduce((total, t) => total + t.distance, 0);
  const litres = troncons.reduce((total, t) => total + t.litresConsommes, 0);
  if (distance <= 0) return null;

  return Math.round((litres / distance) * 1000) / 10;
}
