import { describe, expect, it } from "vitest";

import { formatQuantite, tonnageTotal, UNITES_INITIALES } from "@/lib/unites";

/**
 * Unités et chargements mixtes.
 *
 * Le piège de fond : dès que deux marchandises n'ont pas la même unité, tout
 * total devient faux. L'application doit refuser de totaliser plutôt que
 * d'inventer un nombre — c'est ce que ces tests verrouillent.
 */

describe("unités livrées à l'installation", () => {
  it("couvre les cas courants du corridor", () => {
    const symboles = UNITES_INITIALES.map((u) => u.symbole);
    expect(symboles).toEqual(expect.arrayContaining(["t", "kg", "sac", "carton", "m³"]));
  });

  it("porte un facteur pour ce qui se pèse, aucun pour le reste", () => {
    const sac = UNITES_INITIALES.find((u) => u.symbole === "sac");
    expect(sac?.facteurTonne).toBe(0.05);
    const palette = UNITES_INITIALES.find((u) => u.symbole === "palette");
    expect(palette?.facteurTonne).toBeNull();
  });
});

describe("tonnageTotal", () => {
  it("additionne des lignes toutes convertibles", () => {
    // 12 t + 240 sacs de 50 kg = 12 + 12 = 24 t.
    expect(
      tonnageTotal([
        { quantite: 12, facteurTonne: 1 },
        { quantite: 240, facteurTonne: 0.05 },
      ]),
    ).toBe(24);
  });

  it("refuse de totaliser dès qu'une ligne ne se pèse pas", () => {
    // Additionner des tonnes et des têtes de bétail ne veut rien dire :
    // mieux vaut ne rien afficher qu'un total inventé.
    expect(
      tonnageTotal([
        { quantite: 12, facteurTonne: 1 },
        { quantite: 30, facteurTonne: null },
      ]),
    ).toBeNull();
  });

  it("ignore les quantités non encore constatées", () => {
    expect(
      tonnageTotal([
        { quantite: 12, facteurTonne: 1 },
        { quantite: null, facteurTonne: null },
      ]),
    ).toBe(12);
  });

  it("vaut zéro sur un chargement vide", () => {
    expect(tonnageTotal([])).toBe(0);
  });
});

describe("formatQuantite", () => {
  it("n'affiche pas de décimales inutiles", () => {
    expect(formatQuantite(240, "sac")).toBe("240 sac");
    expect(formatQuantite(12, "t")).toBe("12 t");
  });

  it("garde les décimales utiles", () => {
    expect(formatQuantite(11.4, "t")).toBe("11,4 t");
    expect(formatQuantite(0.605, "t")).toBe("0,605 t");
  });

  it("sépare les milliers", () => {
    expect(formatQuantite(12000, "kg")).toBe("12 000 kg");
  });

  it("affiche un tiret quand la quantité n'est pas connue", () => {
    expect(formatQuantite(null, "t")).toBe("—");
    expect(formatQuantite(undefined, "t")).toBe("—");
  });
});
