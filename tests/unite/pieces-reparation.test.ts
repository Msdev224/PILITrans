import { describe, expect, it } from "vitest";

import { lirePieces, totalPieces } from "@/lib/pieces-reparation";

/** Construit le FormData tel que le dialogue de réparation l'envoie. */
function formulaire(
  lignes: { designation: string; achat?: string; reparation?: string; auForfait?: boolean }[],
): FormData {
  const d = new FormData();
  for (const l of lignes) {
    d.append("pieceDesignation", l.designation);
    d.append("pieceAchat", l.achat ?? "");
    d.append("pieceReparation", l.reparation ?? "");
    d.append("pieceAuForfait", l.auForfait ? "1" : "0");
  }
  return d;
}

describe("lirePieces — le détail d'une réparation", () => {
  it("relit chaque pièce avec son achat et sa remise en état", () => {
    const lignes = lirePieces(
      formulaire([
        { designation: "Alternateur", achat: "2500000", reparation: "400000" },
        { designation: "Filtre à huile", achat: "120000" },
      ]),
    );

    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toEqual({
      designation: "Alternateur",
      coutAchat: 2500000,
      coutReparation: 400000,
      auForfait: false,
    });
    expect(lignes[1].coutReparation).toBe(0);
  });

  it("garde le forfait en face de la bonne pièce", () => {
    /*
     * Le vrai risque de ce formulaire. Une case à cocher décochée n'est pas
     * envoyée : si `auForfait` voyageait dans une case plutôt que dans un
     * champ caché, la colonne se décalerait d'un cran et le forfait
     * tomberait sur la pièce suivante — celle qu'on avait justement chiffrée
     * à part.
     */
    const lignes = lirePieces(
      formulaire([
        { designation: "Alternateur", achat: "2500000", reparation: "400000" },
        { designation: "Plaquettes", achat: "800000", auForfait: true },
        { designation: "Durite", achat: "150000", auForfait: true },
      ]),
    );

    expect(lignes.map((l) => l.auForfait)).toEqual([false, true, true]);
    expect(lignes[0].coutReparation).toBe(400000);
  });

  it("ignore le coût de réparation d'une pièce au forfait", () => {
    // Le champ est neutralisé à l'écran, mais un montant peut y rester d'avant
    // que la case ne soit cochée. Le retenir le compterait deux fois : une
    // fois sur la ligne, une fois dans le forfait.
    const lignes = lirePieces(
      formulaire([{ designation: "Plaquettes", achat: "800000", reparation: "300000", auForfait: true }]),
    );

    expect(lignes[0].coutReparation).toBe(0);
  });

  it("laisse de côté une ligne ajoutée puis abandonnée", () => {
    const lignes = lirePieces(
      formulaire([{ designation: "Alternateur", achat: "2500000" }, { designation: "   " }]),
    );

    expect(lignes).toHaveLength(1);
  });

  it("accepte la virgule et les espaces des montants saisis à la main", () => {
    const lignes = lirePieces(formulaire([{ designation: "Durite", achat: "150 000", reparation: "12,5" }]));

    expect(lignes[0].coutAchat).toBe(150000);
    expect(lignes[0].coutReparation).toBe(12.5);
  });
});

describe("totalPieces — ce que coûtent les pièces", () => {
  it("additionne achats, remises en état chiffrées et forfait", () => {
    const lignes = lirePieces(
      formulaire([
        { designation: "Alternateur", achat: "2500000", reparation: "400000" },
        { designation: "Plaquettes", achat: "800000", auForfait: true },
        { designation: "Durite", achat: "150000", auForfait: true },
      ]),
    );

    expect(totalPieces(lignes, 600000)).toBe(4450000);
  });

  it("ne compte le forfait qu'une fois, quel que soit le nombre de pièces qu'il couvre", () => {
    // Le forfait est un montant global : il ne se répartit pas entre les
    // pièces, et il ne se multiplie pas par elles non plus.
    const une = lirePieces(formulaire([{ designation: "Plaquettes", auForfait: true }]));
    const trois = lirePieces(
      formulaire([
        { designation: "Plaquettes", auForfait: true },
        { designation: "Durite", auForfait: true },
        { designation: "Courroie", auForfait: true },
      ]),
    );

    expect(totalPieces(une, 600000)).toBe(600000);
    expect(totalPieces(trois, 600000)).toBe(600000);
  });

  it("vaut zéro sans pièce ni forfait", () => {
    expect(totalPieces([], 0)).toBe(0);
  });

  it("ignore un forfait négatif plutôt que de le retrancher du total", () => {
    const lignes = lirePieces(formulaire([{ designation: "Durite", achat: "150000" }]));
    expect(totalPieces(lignes, -50000)).toBe(150000);
  });
});
