import type { Camion, Chauffeur, Voyage } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { calculerPnl, kmVoyage, remunerationDuVoyage } from "@/lib/donnees/camions";
import { moisCourant } from "@/lib/periode";

/**
 * Rentabilité par véhicule.
 *
 * Règle centrale vérifiée ici : le prix d'achat n'entre jamais dans la marge
 * du mois. Il est engagé une fois, et suivi séparément comme capital à
 * rembourser. L'inclure ferait apparaître deux marges différentes pour un même
 * camion selon l'écran consulté.
 */

const PERIODE = moisCourant(new Date(2026, 7, 15));

function camion(surcharge: Partial<Camion> = {}): Camion {
  return {
    id: "cam-1",
    nom: "PILI-01",
    typeVehicule: "TRACTEUR_REMORQUE",
    carrosserie: "FRIGO",
    refrigere: true,
    immatTracteur: "RC-4821-A",
    immatRemorque: null,
    marqueGroupeFroid: "Thermo King",
    telephoneBord1: null,
    telephoneBord2: null,
    kilometrage: 120_000,
    statut: "DISPONIBLE",
    coutAcquisition: 420_000_000 as unknown as Camion["coutAcquisition"],
    dateAcquisition: new Date(2024, 2, 1),
    dureeAmortissementMois: 60,
    actif: true,
    createdAt: new Date(2024, 2, 1),
    ...surcharge,
  } as Camion;
}

function chauffeur(surcharge: Partial<Chauffeur> = {}): Chauffeur {
  return {
    id: "chf-1",
    nom: "Mamadou Diallo",
    modeRemuneration: "FORFAIT_VOYAGE",
    tauxRemuneration: 250_000 as unknown as Chauffeur["tauxRemuneration"],
    actif: true,
    ...surcharge,
  } as Chauffeur;
}

function voyage(
  surcharge: Partial<Voyage & { chauffeur: Chauffeur }> = {},
): Voyage & { chauffeur: Chauffeur } {
  return {
    id: "voy-1",
    camionId: "cam-1",
    chauffeurId: "chf-1",
    dateDepart: new Date(2026, 7, 3),
    statut: "TERMINE",
    recetteGnf: 12_000_000 as unknown as Voyage["recetteGnf"],
    distanceKm: 500,
    kmDepart: null,
    kmArrivee: null,
    nbRotations: 1,
    aVide: false,
    remunerationChauffeur: null,
    chauffeur: chauffeur(),
    ...surcharge,
  } as Voyage & { chauffeur: Chauffeur };
}

describe("kmVoyage", () => {
  it("préfère le compteur réel quand il est relevé", () => {
    expect(kmVoyage({ kmDepart: 120_000, kmArrivee: 120_540, distanceKm: 500 })).toBe(540);
  });

  it("retombe sur la distance théorique sans relevé", () => {
    expect(kmVoyage({ kmDepart: null, kmArrivee: null, distanceKm: 500 })).toBe(500);
  });

  it("multiplie par le nombre de rotations", () => {
    // Une benne fait plusieurs allers-retours courts dans la journée : ne
    // compter qu'une distance sous-estimerait le coût au kilomètre.
    expect(kmVoyage({ kmDepart: null, kmArrivee: null, distanceKm: 18, nbRotations: 6 })).toBe(108);
  });

  it("ignore un compteur incohérent plutôt que de rendre une distance négative", () => {
    expect(kmVoyage({ kmDepart: 120_540, kmArrivee: 120_000, distanceKm: 500 })).toBe(500);
  });
});

describe("remunerationDuVoyage", () => {
  it("retient la paie réellement versée quand elle est saisie", () => {
    const v = voyage({ remunerationChauffeur: 400_000 as unknown as Voyage["remunerationChauffeur"] });
    expect(remunerationDuVoyage(v)).toBe(400_000);
  });

  it("l'estime depuis le mode du chauffeur à défaut", () => {
    expect(remunerationDuVoyage(voyage())).toBe(250_000);
  });

  it("applique la commission sur la recette du voyage", () => {
    const v = voyage({ chauffeur: chauffeur({ modeRemuneration: "COMMISSION", tauxRemuneration: 10 as unknown as Chauffeur["tauxRemuneration"] }) });
    expect(remunerationDuVoyage(v)).toBe(1_200_000);
  });
});

describe("calculerPnl — le prix d'achat reste dehors", () => {
  const mouvements = {
    voyages: [voyage()],
    depenses: [
      { type: "GASOIL_TRACTEUR", montantGnf: 3_000_000, date: new Date(2026, 7, 3), camionId: "cam-1" },
      { type: "PEAGE", montantGnf: 200_000, date: new Date(2026, 7, 3), camionId: "cam-1" },
    ],
    reparations: [],
    entretiens: [],
  } as unknown as Parameters<typeof calculerPnl>[1];

  it("retranche les charges d'exploitation de la recette", () => {
    const pnl = calculerPnl(camion(), mouvements, PERIODE);
    // 12 000 000 − (3 000 000 gasoil + 200 000 péage + 250 000 chauffeur)
    expect(pnl.recetteGnf).toBe(12_000_000);
    expect(pnl.margeExploitation).toBe(8_550_000);
  });

  it("n'expose plus de marge nette incluant l'acquisition", () => {
    const pnl = calculerPnl(camion(), mouvements, PERIODE);
    expect("marge" in pnl).toBe(false);
  });

  it("donne la même marge à un camion payé cher et à un camion sans prix connu", () => {
    // C'est la raison d'être de la règle : à travail égal, deux véhicules
    // doivent se comparer sans que leur date ou leur prix d'achat s'en mêle.
    const cher = calculerPnl(camion({ coutAcquisition: 900_000_000 as unknown as Camion["coutAcquisition"] }), mouvements, PERIODE);
    const inconnu = calculerPnl(camion({ coutAcquisition: null, dateAcquisition: null }), mouvements, PERIODE);
    expect(cher.margeExploitation).toBe(inconnu.margeExploitation);
  });

  it("calcule la marge au km sur l'exploitation, pas sur une marge nette", () => {
    const pnl = calculerPnl(camion(), mouvements, PERIODE);
    expect(pnl.km).toBe(500);
    expect(pnl.margeKm).toBe(Math.round(8_550_000 / 500));
    // Marge positive et marge au km positive doivent aller de pair : elles
    // s'affichent côte à côte sur la fiche.
    expect(Math.sign(pnl.margeKm)).toBe(Math.sign(pnl.margeExploitation));
  });

  it("ignore les voyages hors période", () => {
    const horsPeriode = { ...mouvements, voyages: [voyage({ dateDepart: new Date(2026, 5, 3) })] };
    const pnl = calculerPnl(camion(), horsPeriode as typeof mouvements, PERIODE);
    expect(pnl.recetteGnf).toBe(0);
    expect(pnl.nbVoyages).toBe(0);
  });

  it("rend une marge négative pour un camion à l'arrêt qui coûte quand même", () => {
    const arret = { ...mouvements, voyages: [] };
    const pnl = calculerPnl(camion(), arret as typeof mouvements, PERIODE);
    expect(pnl.margeExploitation).toBe(-3_200_000);
  });
});
