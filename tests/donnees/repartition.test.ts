import { describe, expect, it } from "vitest";

import {
  coutCompletTrajet,
  quotePartTrajet,
  type QuotePartVehicule,
} from "@/lib/donnees/repartition";

/**
 * Répartition des coûts véhicule sur les trajets.
 *
 * Le document métier proposait un taux au kilomètre calculé sur un budget
 * annuel : entretien prévu ÷ kilométrage prévu. Cela suppose de connaître
 * d'avance deux chiffres qu'on ne connaît qu'après, et l'écart entre imputé et
 * réel s'accumule sans que personne ne le rapproche.
 *
 * D'où la répartition au réel, dont la propriété tenue ici : la somme des
 * quotes-parts égale exactement le coût engagé.
 */

const base: QuotePartVehicule = {
  aRepartirGnf: 12_000_000,
  kmPeriode: 6_000,
  coutKmGnf: 2_000,
};

describe("quote-part d'un trajet", () => {
  it("est proportionnelle aux kilomètres parcourus", () => {
    expect(quotePartTrajet(base, 800)).toBe(1_600_000);
    expect(quotePartTrajet(base, 400)).toBe(800_000);
  });

  it("la somme des quotes-parts égale le coût engagé", () => {
    // C'est la propriété qui manque à un taux budgété : ici, rien à réconcilier.
    const trajets = [2_000, 1_500, 1_500, 1_000];
    const total = trajets.reduce((t, km) => t + quotePartTrajet(base, km), 0);
    expect(total).toBe(base.aRepartirGnf);
  });

  it("ne répartit rien sans kilomètre parcouru", () => {
    // Inventer une clé de répartition donnerait un chiffre que personne ne
    // pourrait justifier.
    expect(quotePartTrajet({ ...base, kmPeriode: 0 }, 800)).toBe(0);
    expect(quotePartTrajet(base, 0)).toBe(0);
  });
});

describe("coût complet d'un trajet", () => {
  const t = coutCompletTrajet(2_400_000, 980_000, 290_000, 800);

  it("distingue la marge de route et la marge réelle", () => {
    // La première dit ce que le trajet a dégagé sur la route, la seconde ce
    // qu'il laisse une fois le camion payé. Les confondre fait paraître
    // rentables des courses qui ne le sont pas.
    expect(t.margeOperationnelleGnf).toBe(1_420_000);
    expect(t.margeReelleGnf).toBe(1_130_000);
  });

  it("calcule le coût réel comme direct + quote-part", () => {
    expect(t.coutReelGnf).toBe(1_270_000);
  });

  it("rapporte les indicateurs à la même distance", () => {
    expect(t.revenuKmGnf).toBe(3_000);
    expect(t.coutKmGnf).toBe(1_588);
    expect(t.margeKmGnf).toBe(1_413);
  });

  it("les trois indicateurs se réconcilient, à l'arrondi près", () => {
    // La facturation étant au forfait, il n'y a qu'une distance : revenu et
    // coût par km se retranchent pour donner la marge par km. L'écart ne peut
    // venir que des arrondis au franc, jamais d'un dénominateur différent.
    const ecart = Math.abs(t.revenuKmGnf - t.coutKmGnf - t.margeKmGnf);
    expect(ecart).toBeLessThanOrEqual(1);
  });

  it("n'affiche pas de pourcentage sans recette", () => {
    const sansRecette = coutCompletTrajet(0, 500_000, 100_000, 300);
    expect(sansRecette.margeReelleGnf).toBe(-600_000);
    expect(sansRecette.margeReellePct).toBeNull();
  });
});
