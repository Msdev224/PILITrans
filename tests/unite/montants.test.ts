import { describe, expect, it } from "vitest";

import { montantEnLettres } from "@/lib/lettres";

/**
 * Relecture d'un montant en toutes lettres.
 *
 * Les écrans parlent en millions, les champs attendent des francs. Une recette
 * saisie « 46,5 » là où il fallait 50 000 000 a fait apparaître un camion
 * lourdement déficitaire, sans que rien ne le signale. Relire le montant sous
 * le champ rend l'écart d'échelle visible à la frappe.
 */

describe("montant en toutes lettres", () => {
  it("distingue immédiatement deux ordres de grandeur", () => {
    expect(montantEnLettres(46, "GNF")).toContain("quarante-six");
    expect(montantEnLettres(50_000_000, "GNF")).toContain("cinquante millions");
  });

  it("accorde correctement les centaines", () => {
    expect(montantEnLettres(200_000, "GNF")).toContain("deux cent mille");
    expect(montantEnLettres(200, "GNF")).toContain("deux cents");
  });

  it("nomme la devise", () => {
    expect(montantEnLettres(1_000, "GNF")).toContain("guinéens");
    expect(montantEnLettres(1_000, "XOF")).toContain("CFA");
  });
});

describe("écart entre facture et mission", () => {
  /** Reproduit la règle de l'alerte : 1 % de tolérance. */
  const signale = (facture: number, recette: number) =>
    facture > 0 && Math.abs(facture - recette) > facture * 0.01;

  it("signale une recette saisie en millions au lieu de francs", () => {
    // Le cas réel : 46,5 saisi pour 50 000 000.
    expect(signale(50_000_000, 46.5)).toBe(true);
  });

  it("tolère un arrondi ou un avoir mineur", () => {
    expect(signale(50_000_000, 49_800_000)).toBe(false);
  });

  it("ne signale rien quand les deux concordent", () => {
    expect(signale(50_000_000, 50_000_000)).toBe(false);
  });

  it("ne signale rien sans facture", () => {
    expect(signale(0, 0)).toBe(false);
  });
});
