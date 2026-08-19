import { describe, expect, it } from "vitest";

import { margeCamion, soldeCaisse } from "@/lib/calculs";

/**
 * Frais de route remis au chauffeur.
 *
 * Deux erreurs symétriques sont possibles, et toutes deux faussent la
 * rentabilité :
 *
 *  - compter l'avance ET la dépense → le voyage coûte deux fois ce qu'il coûte ;
 *  - ne compter que l'avance et laisser la sortie de caisse sans rattachement
 *    → l'argent quitte la caisse mais n'entre dans la marge d'aucun camion.
 *
 * La règle retenue : l'avance est un mouvement de trésorerie, jamais une
 * charge. Seule la dépense justifiée est un coût, et toute sortie de caisse
 * est l'ombre d'une dépense (`depenseId` renseigné).
 */

describe("l'avance n'est pas une charge", () => {
  it("remettre de l'argent au chauffeur ne change pas la marge", () => {
    const sansAvance = margeCamion({
      recetteGnf: 20_000_000,
      gasoilGnf: 6_000_000,
      autresDepensesGnf: 0,
      reparationsGnf: 0,
      entretiensGnf: 0,
      remunerationGnf: 0,
    });
    // L'avance ne figure nulle part dans le calcul : elle n'a pas de champ.
    expect(sansAvance.margeExploitation).toBe(14_000_000);
  });

  it("seule la dépense justifiée pèse sur la marge", () => {
    const m = margeCamion({
      recetteGnf: 20_000_000,
      gasoilGnf: 6_000_000,
      // Per diem, péage, frontière, douane, internet, divers.
      autresDepensesGnf: 1_500_000,
      reparationsGnf: 0,
      entretiensGnf: 0,
      remunerationGnf: 1_000_000,
    });
    expect(m.margeExploitation).toBe(11_500_000);
  });
});

describe("solde de caisse du chauffeur", () => {
  it("l'avance monte le solde, la dépense le descend", () => {
    const s = soldeCaisse([
      { type: "AVANCE", montant: 2_000_000, devise: "GNF", montantGnf: 2_000_000 },
      { type: "DEPENSE", montant: 1_500_000, devise: "GNF", montantGnf: 1_500_000 },
    ]);
    expect(s.consolideGnf).toBe(500_000);
  });

  it("le reliquat rendu solde la caisse", () => {
    const s = soldeCaisse([
      { type: "AVANCE", montant: 2_000_000, devise: "GNF", montantGnf: 2_000_000 },
      { type: "DEPENSE", montant: 1_500_000, devise: "GNF", montantGnf: 1_500_000 },
      { type: "REMBOURSEMENT", montant: 500_000, devise: "GNF", montantGnf: 500_000 },
    ]);
    expect(s.consolideGnf).toBe(0);
  });

  it("suit séparément les CFA emportés au Sénégal", () => {
    const s = soldeCaisse([
      { type: "AVANCE", montant: 200_000, devise: "XOF", montantGnf: 2_870_000 },
      { type: "DEPENSE", montant: 180_000, devise: "XOF", montantGnf: 2_583_000 },
    ]);
    expect(s.parDevise.XOF).toBe(20_000);
    expect(s.consolideGnf).toBe(287_000);
  });

  it("un solde positif signale de l'argent détenu, à justifier ou à rendre", () => {
    const s = soldeCaisse([
      { type: "AVANCE", montant: 2_000_000, devise: "GNF", montantGnf: 2_000_000 },
    ]);
    expect(s.consolideGnf).toBeGreaterThan(0);
  });
});

describe("pas de double comptage", () => {
  it("l'avance puis sa dépense ne coûtent que le montant dépensé", () => {
    // Le chauffeur reçoit 2 000 000, en dépense 1 500 000 en frais de route.
    // Le camion doit supporter 1 500 000, pas 3 500 000.
    const marge = margeCamion({
      recetteGnf: 10_000_000,
      gasoilGnf: 0,
      autresDepensesGnf: 1_500_000,
      reparationsGnf: 0,
      entretiensGnf: 0,
      remunerationGnf: 0,
    });
    const caisse = soldeCaisse([
      { type: "AVANCE", montant: 2_000_000, devise: "GNF", montantGnf: 2_000_000 },
      { type: "DEPENSE", montant: 1_500_000, devise: "GNF", montantGnf: 1_500_000 },
    ]);

    expect(marge.margeExploitation).toBe(8_500_000);
    // Et les 500 000 non dépensés restent chez le chauffeur, pas dans les coûts.
    expect(caisse.consolideGnf).toBe(500_000);
  });
});
