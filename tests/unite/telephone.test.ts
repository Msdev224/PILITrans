import { describe, expect, it } from "vitest";

import { normaliserNumero } from "@/lib/sms/nimba";
import {
  decomposerTelephone,
  formatTelephone,
  INDICATIF_DEFAUT,
  normaliserTelephone,
  telephoneValide,
} from "@/lib/telephone";

/**
 * Numéros de téléphone.
 *
 * L'enjeu n'est pas cosmétique : le numéro sert d'identifiant de connexion et
 * de destinataire des SMS. Deux écritures du même numéro, et le compte ne se
 * retrouve plus ou le client n'est jamais prévenu.
 */

describe("normaliserTelephone", () => {
  it("accepte les formes rencontrées sur le terrain", () => {
    for (const saisie of [
      "+224 620 22 33 44",
      "00224620223344",
      "(224) 620-22-33-44",
      "224620223344",
      "  +224620223344  ",
    ]) {
      expect(normaliserTelephone(saisie), saisie).toBe("+224620223344");
    }
  });

  it("applique l'indicatif guinéen à un numéro local", () => {
    expect(normaliserTelephone("620223344")).toBe("+224620223344");
    expect(INDICATIF_DEFAUT).toBe("+224");
  });

  it("respecte l'indicatif demandé pour un numéro local étranger", () => {
    expect(normaliserTelephone("775554433", "+221")).toBe("+221775554433");
  });

  it("ne confond pas un numéro sénégalais avec un guinéen", () => {
    // Le corridor est transfrontalier : sans indicatif explicite, un SMS
    // partirait vers un abonné guinéen portant le même numéro national.
    expect(normaliserTelephone("+221 77 555 44 33")).toBe("+221775554433");
    expect(decomposerTelephone("+221775554433").indicatif).toBe("+221");
  });

  it("rend null sur une saisie vide", () => {
    expect(normaliserTelephone("")).toBeNull();
    expect(normaliserTelephone(null)).toBeNull();
    expect(normaliserTelephone(undefined)).toBeNull();
    expect(normaliserTelephone("   ")).toBeNull();
  });

  it("est idempotente", () => {
    const une = normaliserTelephone("620 22 33 44");
    expect(normaliserTelephone(une)).toBe(une);
  });
});

describe("decomposerTelephone", () => {
  it("sépare indicatif et partie nationale", () => {
    expect(decomposerTelephone("+224620223344")).toEqual({
      indicatif: "+224",
      national: "620223344",
    });
  });

  it("retombe sur l'indicatif par défaut si le numéro est absent", () => {
    expect(decomposerTelephone(null)).toEqual({ indicatif: "+224", national: "" });
  });

  it("distingue +225 de +22 sur un préfixe ambigu", () => {
    expect(decomposerTelephone("+2250701020304").indicatif).toBe("+225");
  });
});

describe("formatTelephone", () => {
  it("regroupe pour la lecture", () => {
    expect(formatTelephone("+224620223344")).toBe("+224 620 22 33 44");
    expect(formatTelephone("+221775554433")).toBe("+221 775 55 44 33");
  });

  it("affiche un tiret quand il n'y a pas de numéro", () => {
    expect(formatTelephone(null)).toBe("—");
  });
});

describe("telephoneValide", () => {
  it("accepte un numéro international plausible", () => {
    expect(telephoneValide("+224620223344")).toBe(true);
  });

  it("refuse un numéro trop court ou sans indicatif", () => {
    expect(telephoneValide("+2246")).toBe(false);
    expect(telephoneValide("620223344")).toBe(false);
    expect(telephoneValide(null)).toBe(false);
  });
});

describe("normaliserNumero — format attendu par Nimba", () => {
  it("rend les chiffres sans le +", () => {
    expect(normaliserNumero("+224 620 22 33 44")).toBe("224620223344");
  });

  it("préserve l'indicatif d'un numéro étranger déjà complet", () => {
    // Le point de régression : une seconde implémentation de normalisation
    // préfixait « 224 » à tout numéro de neuf chiffres, expédiant les SMS
    // sénégalais au mauvais pays.
    expect(normaliserNumero("+221775554433")).toBe("221775554433");
  });

  it("refuse un numéro inexploitable plutôt que d'en inventer un", () => {
    expect(normaliserNumero("")).toBeNull();
    expect(normaliserNumero("abc")).toBeNull();
    expect(normaliserNumero("12")).toBeNull();
  });
});
