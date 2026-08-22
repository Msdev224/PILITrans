// Calcul pur : ni base ni requête. Pas de `server-only`, sinon le module
// ne serait ni testable ni utilisable côté client.
import type { PnlCamion } from "@/lib/donnees/camions";

/**
 * Répartition des coûts d'un camion sur ses trajets.
 *
 * Un entretien, une assurance, un jeu de pneus ne se rattachent à aucune
 * mission précise — pourtant chaque mission les consomme. Sans les répartir,
 * un trajet paraît plus rentable qu'il ne l'est.
 *
 * La méthode retenue est la répartition **au réel** : les coûts effectivement
 * engagés sur la période, au prorata des kilomètres effectivement parcourus.
 *
 * L'alternative — un taux au kilomètre calculé sur un budget annuel — suppose
 * de connaître d'avance l'entretien de l'année et le kilométrage. En pratique
 * on les connaît après, et l'écart entre coûts imputés et coûts réels
 * s'accumule sans que personne ne le rapproche. Ici, la somme des quotes-parts
 * égale toujours exactement le coût réel : il n'y a rien à réconcilier.
 */

export interface QuotePartVehicule {
  /** Coûts du camion à répartir sur la période. */
  aRepartirGnf: number;
  /** Kilomètres parcourus sur la période, base de la répartition. */
  kmPeriode: number;
  /** Coût véhicule au kilomètre, constaté et non budgété. */
  coutKmGnf: number;
}

export function baseRepartition(pnl: PnlCamion): QuotePartVehicule {
  // Ce que le camion a coûté sans être imputable à un trajet : réparations et
  // entretiens. Le prix d'achat reste dehors — il est suivi comme capital.
  const aRepartirGnf = pnl.reparationsGnf + pnl.entretiensGnf;
  return {
    aRepartirGnf,
    kmPeriode: pnl.km,
    coutKmGnf: pnl.km > 0 ? Math.round(aRepartirGnf / pnl.km) : 0,
  };
}

/**
 * Quote-part revenant à un trajet, au prorata de ses kilomètres.
 *
 * Sans kilomètre parcouru sur la période, aucune répartition n'est possible :
 * on rend zéro plutôt que d'inventer une clé.
 */
export function quotePartTrajet(base: QuotePartVehicule, kmTrajet: number): number {
  if (base.kmPeriode <= 0 || kmTrajet <= 0) return 0;
  return Math.round((base.aRepartirGnf * kmTrajet) / base.kmPeriode);
}

export interface CoutCompletTrajet {
  /** Charges consommées par le trajet lui-même. */
  coutsDirectsGnf: number;
  /** Part des coûts du camion revenant à ce trajet. */
  quotePartVehiculeGnf: number;
  coutReelGnf: number;
  recetteGnf: number;
  /** Recette − coûts directs : la marge que le trajet dégage sur la route. */
  margeOperationnelleGnf: number;
  /** Recette − coût réel : ce que le trajet laisse vraiment. */
  margeReelleGnf: number;
  margeReellePct: number | null;
  km: number;
  coutKmGnf: number;
  revenuKmGnf: number;
  margeKmGnf: number;
}

export function coutCompletTrajet(
  recetteGnf: number,
  coutsDirectsGnf: number,
  quotePartVehiculeGnf: number,
  km: number,
): CoutCompletTrajet {
  const coutReelGnf = coutsDirectsGnf + quotePartVehiculeGnf;
  const margeReelleGnf = recetteGnf - coutReelGnf;

  return {
    coutsDirectsGnf,
    quotePartVehiculeGnf,
    coutReelGnf,
    recetteGnf,
    margeOperationnelleGnf: recetteGnf - coutsDirectsGnf,
    margeReelleGnf,
    // Un pourcentage sans recette ne veut rien dire : mieux vaut ne rien
    // afficher qu'un nombre qu'on interpréterait de travers.
    margeReellePct:
      recetteGnf > 0 ? Math.round((margeReelleGnf / recetteGnf) * 1000) / 10 : null,
    km,
    coutKmGnf: km > 0 ? Math.round(coutReelGnf / km) : 0,
    revenuKmGnf: km > 0 ? Math.round(recetteGnf / km) : 0,
    margeKmGnf: km > 0 ? Math.round(margeReelleGnf / km) : 0,
  };
}
