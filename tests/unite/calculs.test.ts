import { describe, expect, it } from "vitest";

import {
  conformiteFroid,
  consoTroncon,
  creances,
  ecartLivraison,
  equivalentGnf,
  joursEntre,
  margeCamion,
  paybackMois,
  proposerTrajet,
  remunerationVoyage,
  soldeCaisse,
  tauxAVide,
} from "@/lib/calculs";

/**
 * Cœur métier fourni. Ces tests ne cherchent pas à le réécrire mais à le
 * verrouiller : ce sont les règles dont dépend la rentabilité affichée, et
 * une régression silencieuse ici fausserait toutes les décisions du gérant.
 */

describe("equivalentGnf — multi-devise à taux réel", () => {
  it("laisse un montant GNF intact", () => {
    expect(equivalentGnf(1_500_000, "GNF")).toBe(1_500_000);
  });

  it("convertit un montant CFA au taux appliqué à la transaction", () => {
    // Le taux varie d'un passage de frontière à l'autre : c'est celui de la
    // transaction qui fait foi, pas un taux de référence.
    expect(equivalentGnf(100_000, "XOF", 14.35)).toBe(1_435_000);
    expect(equivalentGnf(100_000, "XOF", 15.1)).toBe(1_510_000);
  });
});

describe("soldeCaisse", () => {
  it("solde une avance dépensée puis remboursée", () => {
    const solde = soldeCaisse([
      { type: "AVANCE", montant: 5_000_000, devise: "GNF", montantGnf: 5_000_000 },
      { type: "DEPENSE", montant: 3_000_000, devise: "GNF", montantGnf: 3_000_000 },
      { type: "REMBOURSEMENT", montant: 2_000_000, devise: "GNF", montantGnf: 2_000_000 },
    ]);
    expect(solde.consolideGnf).toBe(0);
    expect(solde.parDevise.GNF).toBe(0);
  });

  it("suit chaque devise séparément tout en consolidant en GNF", () => {
    // Le solde par devise dit ce que le chauffeur a encore en poche ; le
    // consolidé dit ce que ça vaut, au taux réellement pratiqué.
    const solde = soldeCaisse([
      { type: "AVANCE", montant: 5_000_000, devise: "GNF", montantGnf: 5_000_000 },
      { type: "DEPENSE", montant: 100_000, devise: "XOF", montantGnf: 1_435_000 },
    ]);
    expect(solde.parDevise.GNF).toBe(5_000_000);
    expect(solde.parDevise.XOF).toBe(-100_000);
    expect(solde.consolideGnf).toBe(3_565_000);
  });
});

describe("consoTroncon — carburant en litres", () => {
  it("compte restant au départ + pleins − restant à l'arrivée", () => {
    const r = consoTroncon({
      kmDepart: 10_000,
      kmArrivee: 10_500,
      carburantRestantDepart: 200,
      carburantRestantArrivee: 60,
      pleins: [100, 50],
    });
    expect(r.distance).toBe(500);
    expect(r.pleins).toBe(150);
    expect(r.litresConsommes).toBe(290);
    expect(r.litresPer100km).toBe(58);
  });

  it("ne divise pas par zéro quand le camion n'a pas bougé", () => {
    const r = consoTroncon({
      kmDepart: 10_000,
      kmArrivee: 10_000,
      carburantRestantDepart: 100,
      carburantRestantArrivee: 80,
      pleins: [],
    });
    expect(r.litresPer100km).toBe(0);
  });
});

describe("margeCamion", () => {
  const base = {
    recetteGnf: 20_000_000,
    gasoilGnf: 6_000_000,
    autresDepensesGnf: 1_000_000,
    reparationsGnf: 2_000_000,
    entretiensGnf: 500_000,
    remunerationGnf: 1_500_000,
  };

  it("retranche les seules charges d'exploitation", () => {
    const m = margeCamion(base);
    expect(m.margeExploitation).toBe(9_000_000);
  });

  it("sans amortissement transmis, marge nette et marge d'exploitation coïncident", () => {
    // C'est ainsi que l'application l'appelle : le prix d'achat n'est pas une
    // charge du mois, il est suivi comme capital à rembourser.
    const m = margeCamion(base);
    expect(m.marge).toBe(m.margeExploitation);
  });

  it("distingue les deux marges lorsqu'un amortissement est fourni", () => {
    const m = margeCamion({ ...base, amortissementGnf: 7_000_000 });
    expect(m.margeExploitation).toBe(9_000_000);
    expect(m.marge).toBe(2_000_000);
  });

  it("rend une marge négative quand le camion coûte plus qu'il ne rapporte", () => {
    const m = margeCamion({ ...base, recetteGnf: 0 });
    expect(m.margeExploitation).toBe(-11_000_000);
  });
});

describe("creances", () => {
  const echue = new Date("2026-07-01");
  const aVenir = new Date("2026-12-01");
  const aujourdhui = new Date("2026-08-19");

  it("sépare l'encours de la part échue", () => {
    const r = creances(
      [
        { montantGnf: 10_000_000, montantPayeGnf: 0, statut: "EMISE", echeance: aVenir },
        { montantGnf: 8_000_000, montantPayeGnf: 3_000_000, statut: "PARTIELLE", echeance: echue },
        { montantGnf: 5_000_000, montantPayeGnf: 5_000_000, statut: "PAYEE" },
      ],
      aujourdhui,
    );
    expect(r.encours).toBe(15_000_000);
    expect(r.enRetard).toBe(5_000_000);
    expect(r.encaisse).toBe(8_000_000);
  });

  it("compte l'encaissement d'une facture soldée sans la remettre en encours", () => {
    const r = creances(
      [{ montantGnf: 4_000_000, montantPayeGnf: 4_000_000, statut: "PAYEE" }],
      aujourdhui,
    );
    expect(r.encours).toBe(0);
    expect(r.encaisse).toBe(4_000_000);
  });
});

describe("conformiteFroid", () => {
  it("tolère l'écart admis autour de la consigne", () => {
    expect(conformiteFroid(2.5, 2, 1)).toBe("CONFORME");
    expect(conformiteFroid(1, 2, 1)).toBe("CONFORME");
  });

  it("alerte entre une et deux fois la tolérance", () => {
    expect(conformiteFroid(3.5, 2, 1)).toBe("ALERTE");
  });

  it("déclare la rupture au-delà", () => {
    expect(conformiteFroid(6, 2, 1)).toBe("RUPTURE");
    expect(conformiteFroid(-3, 2, 1)).toBe("RUPTURE");
  });
});

describe("remunerationVoyage — cinq modes", () => {
  it("forfait par voyage", () => {
    expect(remunerationVoyage({ mode: "FORFAIT_VOYAGE", taux: 250_000 })).toBe(250_000);
  });

  it("commission sur recette", () => {
    expect(remunerationVoyage({ mode: "COMMISSION", taux: 10, recetteGnf: 12_000_000 })).toBe(1_200_000);
  });

  it("au kilomètre", () => {
    expect(remunerationVoyage({ mode: "PAR_KM", taux: 1_200, km: 850 })).toBe(1_020_000);
  });

  it("mixte : un fixe plus une commission", () => {
    expect(
      remunerationVoyage({ mode: "MIXTE", taux: 5, forfait: 300_000, recetteGnf: 10_000_000 }),
    ).toBe(800_000);
  });

  it("fixe mensuel : rien n'est imputé au voyage", () => {
    // Le salaire est déjà payé au mois ; l'imputer au voyage le compterait deux fois.
    expect(remunerationVoyage({ mode: "FIXE_MENSUEL", taux: 3_000_000 })).toBe(0);
  });
});

describe("paybackMois", () => {
  it("calcule les mois de remboursement à marge positive", () => {
    expect(paybackMois(420_000_000, 7_000_000)).toBe(60);
  });

  it("est infini si la marge est nulle ou négative", () => {
    expect(paybackMois(420_000_000, 0)).toBe(Infinity);
    expect(paybackMois(420_000_000, -1_000_000)).toBe(Infinity);
  });
});

describe("proposerTrajet", () => {
  const historique = [
    { villeDepart: "Conakry", villeArrivee: "Dakar", distanceKm: 1_100, litresConsommes: 400, recetteGnf: 20_000_000 },
    { villeDepart: "Dakar", villeArrivee: "Conakry", distanceKm: 1_140, litresConsommes: 420, recetteGnf: 18_000_000 },
  ];

  it("retrouve un trajet déjà fait, sens inverse compris", () => {
    const p = proposerTrajet(historique, "Conakry", "Dakar");
    expect(p.trouve).toBe(true);
    if (!p.trouve) return;
    expect(p.occurrences).toBe(2);
    expect(p.inverseInclus).toBe(true);
    expect(p.distanceMoyKm).toBe(1_120);
  });

  it("ne propose rien sur un trajet inconnu", () => {
    const p = proposerTrajet(historique, "Conakry", "Bamako");
    expect(p.trouve).toBe(false);
    expect(p.occurrences).toBe(0);
  });
});

describe("joursEntre", () => {
  it("compte les jours d'attente de chargement", () => {
    expect(joursEntre(new Date("2026-08-14"), new Date("2026-08-17"))).toBe(3);
  });

  it("ne rend jamais de durée négative", () => {
    expect(joursEntre(new Date("2026-08-17"), new Date("2026-08-14"))).toBe(0);
  });
});

describe("ecartLivraison", () => {
  it("mesure le manquant entre reçu et livré", () => {
    const e = ecartLivraison(12, 11.4);
    expect(e.manquant).toBe(0.6);
    expect(e.pct).toBe(5);
  });

  it("ne signale rien quand tout est livré", () => {
    expect(ecartLivraison(12, 12).manquant).toBe(0);
  });
});

describe("tauxAVide", () => {
  it("rapporte les km à vide au total parcouru", () => {
    expect(tauxAVide(300, 1_200)).toBe(25);
  });

  it("vaut zéro sans kilomètre parcouru", () => {
    expect(tauxAVide(0, 0)).toBe(0);
  });
});
