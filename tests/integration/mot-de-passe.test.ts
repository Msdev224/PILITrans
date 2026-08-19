import { describe, expect, it } from "vitest";

import { hacherMotDePasse, verifierMotDePasse } from "@/lib/mots-de-passe";

/**
 * Mots de passe.
 *
 * Le gérant est seul à les changer, depuis l'écran Comptes. Ces tests
 * verrouillent les fonctions sur lesquelles ce remplacement s'appuie : une
 * régression y ouvrirait tous les comptes à la fois.
 */

describe("empreinte", () => {
  it("accepte le bon mot de passe", async () => {
    const e = await hacherMotDePasse("Route2026!");
    expect(await verifierMotDePasse("Route2026!", e)).toBe(true);
  });

  it("refuse un mot de passe faux", async () => {
    const e = await hacherMotDePasse("Route2026!");
    expect(await verifierMotDePasse("route2026!", e)).toBe(false);
    expect(await verifierMotDePasse("", e)).toBe(false);
  });

  it("produit une empreinte différente à chaque fois", async () => {
    // Le sel empêche de reconnaître deux comptes partageant le même mot de
    // passe en comparant simplement les empreintes.
    const a = await hacherMotDePasse("MemeMotDePasse");
    const b = await hacherMotDePasse("MemeMotDePasse");
    expect(a).not.toBe(b);
    expect(await verifierMotDePasse("MemeMotDePasse", a)).toBe(true);
    expect(await verifierMotDePasse("MemeMotDePasse", b)).toBe(true);
  });

  it("ne laisse jamais passer un compte sans empreinte", async () => {
    // Un compte créé sans mot de passe ne doit pas devenir une porte ouverte.
    expect(await verifierMotDePasse("n'importe quoi", null)).toBe(false);
  });

  it("remplacer l'empreinte invalide l'ancien mot de passe", async () => {
    const ancienne = await hacherMotDePasse("Ancien2026");
    const nouvelle = await hacherMotDePasse("Nouveau2026");
    expect(await verifierMotDePasse("Ancien2026", nouvelle)).toBe(false);
    expect(await verifierMotDePasse("Nouveau2026", nouvelle)).toBe(true);
    expect(ancienne).not.toBe(nouvelle);
  });
});
