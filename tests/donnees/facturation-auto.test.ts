import { describe, expect, it } from "vitest";

/**
 * Facturation déclenchée par la livraison.
 *
 * La règle vérifiée ici est celle qui décide QUAND la facture part. Elle est
 * rejouée à l'identique de `facturerSiLivre` : facturer trop tôt produit des
 * documents à corriger, facturer trop tard fait perdre de la trésorerie.
 */

interface Ligne {
  designation: string;
  codeConfirmeLe: Date | null;
}

/** Reproduit les conditions d'émission de `facturerSiLivre`. */
function peutFacturer(v: {
  dejaFacturee: boolean;
  clientId: string | null;
  recetteGnf: number;
  lignes: Ligne[];
}): { fait: boolean; motif?: string } {
  if (v.dejaFacturee) return { fait: false, motif: "déjà facturé" };
  if (!v.clientId) return { fait: false, motif: "pas de client" };
  if (v.recetteGnf <= 0) return { fait: false, motif: "recette nulle" };
  if (v.lignes.length === 0) return { fait: false, motif: "aucune marchandise" };
  if (v.lignes.some((l) => !l.codeConfirmeLe)) return { fait: false, motif: "livraison incomplète" };
  return { fait: true };
}

const confirme = new Date("2026-08-20");
const base = { dejaFacturee: false, clientId: "c1", recetteGnf: 14_200_000 };

describe("émission à la livraison", () => {
  it("facture quand toutes les marchandises sont confirmées", () => {
    expect(
      peutFacturer({
        ...base,
        lignes: [
          { designation: "Produits frais", codeConfirmeLe: confirme },
          { designation: "Riz", codeConfirmeLe: confirme },
        ],
      }).fait,
    ).toBe(true);
  });

  it("attend tant qu'une seule marchandise n'est pas confirmée", () => {
    // Facturer ici reviendrait à réclamer ce qui n'a pas été remis.
    const r = peutFacturer({
      ...base,
      lignes: [
        { designation: "Produits frais", codeConfirmeLe: confirme },
        { designation: "Riz", codeConfirmeLe: null },
      ],
    });
    expect(r.fait).toBe(false);
    expect(r.motif).toBe("livraison incomplète");
  });

  it("ne facture jamais deux fois le même voyage", () => {
    expect(
      peutFacturer({
        ...base,
        dejaFacturee: true,
        lignes: [{ designation: "Riz", codeConfirmeLe: confirme }],
      }).fait,
    ).toBe(false);
  });

  it("ne facture pas une mission sans client", () => {
    // Un repositionnement n'a personne à qui adresser la facture.
    expect(
      peutFacturer({
        ...base,
        clientId: null,
        lignes: [{ designation: "Riz", codeConfirmeLe: confirme }],
      }).fait,
    ).toBe(false);
  });

  it("ne produit pas de facture à zéro", () => {
    expect(
      peutFacturer({
        ...base,
        recetteGnf: 0,
        lignes: [{ designation: "Riz", codeConfirmeLe: confirme }],
      }).motif,
    ).toBe("recette nulle");
  });

  it("n'émet rien sans marchandise déclarée", () => {
    expect(peutFacturer({ ...base, lignes: [] }).motif).toBe("aucune marchandise");
  });
});
