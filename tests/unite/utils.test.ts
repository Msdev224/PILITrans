import { describe, expect, it } from "vitest";

import {
  carrosseriesDisponibles,
  debutDeJour,
  estTransportPersonnes,
  formatDate,
  formatDecimal,
  formatDevise,
  formatGnf,
  formatMillions,
  formatNombre,
  formatSigne,
  initiales,
  n,
  nOuNull,
} from "@/lib/utils";

/** Espace fine insécable — le séparateur de milliers imposé par la maquette. */
const ESPACE = "\u202F";

describe("conversion des Decimal Prisma", () => {
  it("convertit l'objet Decimal via sa représentation texte", () => {
    // Prisma renvoie des objets ; passer par Number() directement perdrait la
    // précision sur les grands montants en GNF.
    expect(n({ toString: () => "14200000" })).toBe(14_200_000);
  });

  it("traite l'absence de valeur comme zéro", () => {
    expect(n(null)).toBe(0);
    expect(n(undefined)).toBe(0);
  });

  it("nOuNull conserve l'absence de valeur", () => {
    expect(nOuNull(null)).toBeUndefined();
    expect(nOuNull(0)).toBe(0);
  });

  it("ne propage pas NaN dans les calculs", () => {
    expect(n("abc")).toBe(0);
  });
});

describe("formatage des montants — GNF sans décimales", () => {
  it("sépare les milliers par une espace fine insécable", () => {
    expect(formatNombre(14_200_000)).toBe(`14${ESPACE}200${ESPACE}000`);
  });

  it("suffixe la devise", () => {
    expect(formatGnf(14_200_000)).toBe(`14${ESPACE}200${ESPACE}000${ESPACE}GNF`);
  });

  it("arrondit à l'entier : le GNF n'a pas de centimes", () => {
    expect(formatNombre(1_499.6)).toBe(`1${ESPACE}500`);
  });

  it("utilise le signe moins typographique", () => {
    expect(formatNombre(-3_200_000)).toBe(`−3${ESPACE}200${ESPACE}000`);
  });

  it("marque explicitement les valeurs positives pour les marges", () => {
    expect(formatSigne(6_900_000)).toBe(`+6${ESPACE}900${ESPACE}000`);
    expect(formatSigne(0)).toBe("0");
  });

  it("affiche le CFA sous son nom d'usage", () => {
    expect(formatDevise(15_000, "XOF")).toBe(`15${ESPACE}000${ESPACE}CFA`);
    expect(formatDevise(15_000, "GNF")).toBe(`15${ESPACE}000${ESPACE}GNF`);
  });

  it("abrège en millions avec la virgule décimale française", () => {
    expect(formatMillions(14_200_000)).toBe("14,2");
    expect(formatMillions(-3_500_000)).toBe("−3,5");
  });

  it("écrit les décimaux à la française", () => {
    expect(formatDecimal(34.9)).toBe("34,9");
  });
});

describe("dates", () => {
  it("écrit la date en toutes lettres françaises", () => {
    expect(formatDate(new Date(2026, 7, 14))).toBe("14 août 2026");
  });

  it("ramène au minuit du jour", () => {
    // Les durées métier se comptent en jours pleins : sans cette
    // normalisation, « immobilisé depuis le 14 » affiché le 17 à 19 h
    // donnerait 4 jours au lieu de 3.
    const d = debutDeJour(new Date(2026, 7, 17, 19, 42));
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(17);
  });
});

describe("initiales", () => {
  it("prend les deux premiers mots", () => {
    expect(initiales("Mamadou Diallo")).toBe("MD");
    expect(initiales("Mamadou Saïdou Bah")).toBe("MS");
  });

  it("supporte un nom d'un seul mot", () => {
    expect(initiales("Ibrahima")).toBe("I");
  });
});

describe("carrosseries", () => {
  it("ne propose pas le transport de personnes tant que le module est fermé", () => {
    // Bus et taxi sont prévus mais pas acquis : les proposer laisserait croire
    // que l'application sait les suivre, alors que tout le modèle repose sur
    // une marchandise et un client.
    expect(carrosseriesDisponibles(false)).not.toContain("BUS");
    expect(carrosseriesDisponibles(false)).not.toContain("TAXI");
  });

  it("propose bien les carrosseries de marchandises", () => {
    expect(carrosseriesDisponibles(false)).toEqual(
      expect.arrayContaining(["FRIGO", "BENNE", "PLATEAU", "BACHE", "CITERNE"]),
    );
  });

  it("les ouvre une fois le module activé dans les Paramètres", () => {
    expect(carrosseriesDisponibles(true)).toEqual(
      expect.arrayContaining(["BUS", "TAXI", "FRIGO"]),
    );
  });

  it("reconnaît un véhicule de transport de personnes", () => {
    expect(estTransportPersonnes("BUS")).toBe(true);
    expect(estTransportPersonnes("TAXI")).toBe(true);
    expect(estTransportPersonnes("FRIGO")).toBe(false);
  });
});
