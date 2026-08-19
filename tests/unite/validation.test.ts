import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  caseACocher,
  erreursFormulaire,
  nombreOptionnel,
  telephoneOptionnel,
  telephoneRequis,
  texteOptionnel,
} from "@/lib/validation";

/**
 * Aides de validation.
 *
 * Le point sensible : un champ masqué par l'interface (litres hors gasoil,
 * groupe froid sur un véhicule non frigorifique) n'est pas envoyé du tout.
 * Un schéma qui le rejette bloque le formulaire en signalant une erreur sur
 * un champ que l'utilisateur ne voit pas — c'est le bug qui avait empêché
 * d'enregistrer toute dépense non carburant.
 */

describe("nombreOptionnel", () => {
  const schema = z.object({ litres: nombreOptionnel });

  it("accepte l'absence totale du champ", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("accepte une chaîne vide comme absence", () => {
    const r = schema.safeParse({ litres: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.litres).toBeUndefined();
  });

  it("accepte la virgule décimale et les espaces de saisie", () => {
    expect(schema.safeParse({ litres: "12,5" }).data?.litres).toBe(12.5);
    expect(schema.safeParse({ litres: "1 200" }).data?.litres).toBe(1200);
  });

  it("refuse une valeur négative", () => {
    expect(schema.safeParse({ litres: "-5" }).success).toBe(false);
  });

  it("refuse un texte qui n'est pas un nombre", () => {
    expect(schema.safeParse({ litres: "abc" }).success).toBe(false);
  });
});

describe("texteOptionnel", () => {
  const schema = z.object({ ville: texteOptionnel });

  it("transforme une chaîne vide en absence", () => {
    expect(schema.safeParse({ ville: "   " }).data?.ville).toBeUndefined();
  });

  it("conserve un texte utile en le débarrassant des espaces", () => {
    expect(schema.safeParse({ ville: "  Labé " }).data?.ville).toBe("Labé");
  });
});

describe("caseACocher", () => {
  const schema = z.object({ actif: caseACocher });

  it("lit une case cochée", () => {
    expect(schema.safeParse({ actif: "true" }).data?.actif).toBe(true);
  });

  it("traite une case absente comme décochée", () => {
    // Un navigateur n'envoie rien pour une case non cochée : l'absence doit
    // valoir « faux », pas déclencher une erreur.
    expect(schema.safeParse({}).data?.actif).toBe(false);
  });
});

describe("telephoneOptionnel", () => {
  const schema = z.object({ telephone: telephoneOptionnel });

  it("normalise au format international", () => {
    expect(schema.safeParse({ telephone: "620 22 33 44" }).data?.telephone).toBe("+224620223344");
  });

  it("accepte l'absence de numéro", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("refuse un numéro inexploitable", () => {
    expect(schema.safeParse({ telephone: "12" }).success).toBe(false);
  });
});

describe("telephoneRequis", () => {
  const schema = z.object({ telephone: telephoneRequis });

  it("exige un numéro", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ telephone: "" }).success).toBe(false);
  });

  it("normalise le numéro fourni", () => {
    expect(schema.safeParse({ telephone: "00224620223344" }).data?.telephone).toBe("+224620223344");
  });
});

describe("erreursFormulaire", () => {
  it("renvoie les champs fautifs et réémet les valeurs saisies", () => {
    // Sans les valeurs, un échec de validation viderait les champs déjà
    // remplis : le gérant devait ressaisir camion, chauffeur et date.
    const schema = z.object({ nom: z.string().min(1, "Nom requis"), ville: z.string() });
    const donnees = new FormData();
    donnees.set("nom", "");
    donnees.set("ville", "Conakry");

    const r = schema.safeParse(Object.fromEntries(donnees));
    expect(r.success).toBe(false);
    if (r.success) return;

    const etat = erreursFormulaire(r.error, donnees);
    expect(etat.champs?.nom).toBe("Nom requis");
    expect(etat.valeurs?.ville).toBe("Conakry");
  });
});
