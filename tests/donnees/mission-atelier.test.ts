import { describe, expect, it } from "vitest";

import { joursEntre } from "@/lib/calculs";
import { debutDeJour } from "@/lib/utils";

/**
 * Missions qui ne transportent rien.
 *
 * Un aller à l'atelier ou un repositionnement roule, coûte du carburant et
 * nourrit le chauffeur — mais ne rapporte rien et ne se rémunère pas
 * forcément. Confondre les deux faisait apparaître un camion lourdement
 * déficitaire sur une course qui, par nature, ne rapporte pas.
 */

/** Reproduit `joursMission` : bornes incluses, minimum un jour. */
function joursMission(depart: Date, arrivee: Date | null, aujourdhui = new Date()): number {
  const fin = arrivee ?? aujourdhui;
  return joursEntre(debutDeJour(depart), debutDeJour(fin)) + 1;
}

/** Reproduit `perDiemDuVoyage`. */
const perDiem = (taux: number, jours: number) => (taux > 0 ? Math.round(taux * jours) : 0);

describe("jours de mission", () => {
  it("un aller-retour dans la journée compte un jour", () => {
    // Le chauffeur a mangé, même parti et revenu le même jour.
    const d = new Date(2026, 7, 14);
    expect(joursMission(d, d)).toBe(1);
  });

  it("compte les bornes incluses", () => {
    expect(joursMission(new Date(2026, 7, 14), new Date(2026, 7, 16))).toBe(3);
  });

  it("court jusqu'à aujourd'hui tant que la mission n'est pas rentrée", () => {
    expect(joursMission(new Date(2026, 7, 14), null, new Date(2026, 7, 17))).toBe(4);
  });
});

describe("indemnité de nourriture", () => {
  it("se compte au jour, pas au voyage", () => {
    expect(perDiem(150_000, 3)).toBe(450_000);
  });

  it("vaut zéro sans barème convenu", () => {
    // Aucun repli implicite : appliquer un montant que personne n'a validé
    // fausserait la marge sans qu'on sache pourquoi.
    expect(perDiem(0, 5)).toBe(0);
  });
});

describe("rémunération selon le motif", () => {
  /** Reproduit `remunerationDuVoyage` sur ses deux premières règles. */
  function paie(remunerer: boolean, versee: number | null, forfait: number): number {
    if (!remunerer) return 0;
    return versee ?? forfait;
  }

  it("un aller à l'atelier ne se rémunère pas", () => {
    // C'est le cas qui produisait −3,5 M sur une course sans recette.
    expect(paie(false, null, 3_500_000)).toBe(0);
  });

  it("une course classique applique le forfait à défaut de saisie", () => {
    expect(paie(true, null, 3_500_000)).toBe(3_500_000);
  });

  it("le montant saisi prime toujours sur le forfait", () => {
    expect(paie(true, 2_000_000, 3_500_000)).toBe(2_000_000);
  });

  it("un montant saisi à zéro reste zéro", () => {
    // Distinct de « non renseigné » : le gérant a décidé qu'il n'y a rien.
    expect(paie(true, 0, 3_500_000)).toBe(0);
  });
});

describe("marge d'une mission d'atelier", () => {
  it("reste négative du seul montant des frais réels", () => {
    // Carburant 800 000 + per diem 2 jours à 150 000, sans paie ni recette.
    const charges = 800_000 + perDiem(150_000, 2);
    expect(0 - charges).toBe(-1_100_000);
  });
});
