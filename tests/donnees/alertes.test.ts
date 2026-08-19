import { describe, expect, it } from "vitest";

import { ecartLivraison } from "@/lib/calculs";

/**
 * Écart de livraison et prélèvements de douane.
 *
 * Sans déduction des retenues de douane, l'application accuse le chauffeur
 * d'un vol qu'il n'a pas commis : elle compare le chargé au livré et lève une
 * alerte urgente sur la différence. C'est cette soustraction que ces tests
 * verrouillent.
 */

/** Reproduit le calcul appliqué par la fiche voyage et le moteur d'alertes. */
function manquantNet(recue: number, livree: number, preleveDouane: number) {
  const base = Math.max(recue - preleveDouane, 0);
  return ecartLivraison(base, livree);
}

describe("écart de livraison net des prélèvements", () => {
  it("signale un manquant quand rien n'est déclaré en douane", () => {
    const e = manquantNet(12, 11.4, 0);
    expect(e.manquant).toBe(0.6);
    expect(e.pct).toBe(5);
  });

  it("n'accuse plus personne une fois le prélèvement déclaré", () => {
    const e = manquantNet(12, 11.4, 0.6);
    expect(e.manquant).toBe(0);
  });

  it("ne retient que l'écart résiduel lorsque le prélèvement n'explique pas tout", () => {
    const e = manquantNet(12, 11, 0.6);
    expect(e.manquant).toBeCloseTo(0.4, 5);
  });

  it("cumule plusieurs postes de douane sur un même corridor", () => {
    // Un Conakry–Dakar en croise au moins deux.
    const e = manquantNet(12, 11.1, 0.5 + 0.4);
    expect(e.manquant).toBe(0);
  });

  it("ne rend pas de base négative si la déclaration dépasse le chargement", () => {
    const e = manquantNet(12, 0, 15);
    expect(e.manquant).toBe(0);
    expect(e.pct).toBe(0);
  });
});
