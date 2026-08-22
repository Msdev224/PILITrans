import { describe, expect, it } from "vitest";

/**
 * Normalisation de la recherche.
 *
 * Reproduit `sansAccents` de `ChampRecherche`. Personne ne tape « Baldé » avec
 * son accent ni « +224 622 40 50 60 » avec ses espaces : sans cette
 * normalisation, la recherche ne trouve rien et laisse croire que le client
 * n'existe pas.
 */
function sansAccents(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s.\-()]/g, "")
    .trim();
}

const trouve = (contenu: string, saisie: string) =>
  sansAccents(contenu).includes(sansAccents(saisie));

describe("recherche d'un client", () => {
  it("trouve malgré les accents manquants", () => {
    expect(trouve("Établissements Baldé", "balde")).toBe(true);
    expect(trouve("Établissements Baldé", "etablissements")).toBe(true);
  });

  it("trouve malgré les accents en trop", () => {
    expect(trouve("Etablissements Balde", "Baldé")).toBe(true);
  });

  it("ignore la casse", () => {
    expect(trouve("Marché Madina", "MADINA")).toBe(true);
  });

  it("trouve un numéro quelle que soit sa mise en forme", () => {
    const fiche = "+224 622 40 50 60";
    expect(trouve(fiche, "622405060")).toBe(true);
    expect(trouve(fiche, "622 40")).toBe(true);
    expect(trouve(fiche, "+224622405060")).toBe(true);
  });

  it("ne trouve pas ce qui n'est pas là", () => {
    expect(trouve("Marché Madina", "pharmacie")).toBe(false);
  });

  it("trouve sur une partie du nom", () => {
    expect(trouve("Pharmacie Centrale", "centrale")).toBe(true);
  });
});
