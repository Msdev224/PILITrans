import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  dateBornee,
  dateExpiration,
  dateRaisonnable,
  distanceKm,
} from "@/lib/validation";

/**
 * Garde-fous de saisie.
 *
 * Une date ou une distance aberrante ne se voit pas : elle se glisse dans les
 * moyennes, fausse un coût au kilomètre, et personne ne se souvient de ce qui
 * a été tapé. Ces règles refusent à la saisie ce qu'on ne pourrait plus
 * expliquer six mois plus tard.
 */

const AUJOURDHUI = new Date(2026, 7, 22);

describe("dates d'opération", () => {
  it("accepte une date de l'exercice", () => {
    expect(dateRaisonnable(new Date(2026, 7, 14), AUJOURDHUI)).toBe(true);
  });

  it("refuse une année manifestement fautive", () => {
    // Les deux fautes de frappe courantes sur un champ date.
    expect(dateRaisonnable(new Date(226, 7, 14), AUJOURDHUI)).toBe(false);
    expect(dateRaisonnable(new Date(2062, 7, 14), AUJOURDHUI)).toBe(false);
  });

  it("laisse une marge devant pour planifier", () => {
    expect(dateRaisonnable(new Date(2027, 5, 1), AUJOURDHUI)).toBe(true);
  });

  it("rejette la saisie au niveau du schéma", () => {
    expect(z.object({ d: dateBornee }).safeParse({ d: "2062-08-14" }).success).toBe(false);
    expect(z.object({ d: dateBornee }).safeParse({ d: "2026-08-14" }).success).toBe(true);
  });
});

describe("dates d'expiration", () => {
  it("laisse un horizon large", () => {
    // Un permis ou une assurance courent sur plusieurs années : la borne des
    // opérations refuserait ici des saisies parfaitement justes.
    const dans5ans = `${new Date().getFullYear() + 5}-04-01`;
    expect(z.object({ d: dateExpiration }).safeParse({ d: dans5ans }).success).toBe(true);
  });

  it("refuse tout de même l'invraisemblable", () => {
    expect(z.object({ d: dateExpiration }).safeParse({ d: "2099-01-01" }).success).toBe(false);
  });
});

describe("distance d'une mission", () => {
  const schema = z.object({ km: distanceKm });

  it("accepte le plus long corridor de l'exploitation", () => {
    // Conakry–Dakar tourne autour de 1 500 km.
    expect(schema.safeParse({ km: "1500" }).success).toBe(true);
  });

  it("refuse un nombre qui écraserait tous les coûts au kilomètre", () => {
    expect(schema.safeParse({ km: "800000" }).success).toBe(false);
  });

  it("tolère l'absence de distance", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });
});
