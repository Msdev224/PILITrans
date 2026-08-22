import { describe, expect, it } from "vitest";

import { lignesRemise } from "@/lib/remise";

describe("lignesRemise — ce qui est remis au chauffeur au départ", () => {
  it("ventile chaque somme par objet", () => {
    const lignes = lignesRemise({
      objets: ["PER_DIEM", "GASOIL_TRACTEUR", "PIECES_RECHANGE"],
      montants: ["900000", "1500000", "500000"],
      devises: ["GNF", "GNF", "GNF"],
      equivalents: ["", "", ""],
    });

    expect(lignes).toHaveLength(3);
    expect(lignes.map((l) => l.objet)).toEqual(["PER_DIEM", "GASOIL_TRACTEUR", "PIECES_RECHANGE"]);
    expect(lignes.reduce((t, l) => t + l.montantGnf, 0)).toBe(2900000);
  });

  it("garde l'équivalent en face de la bonne ligne", () => {
    /*
     * Le cœur du problème : une ligne en GNF n'affiche pas de champ
     * d'équivalent. Un champ caché occupe sa place, sinon les 4 200 000 GNF
     * de la ligne en CFA glisseraient sur la ligne suivante — la caisse du
     * chauffeur serait fausse sans que rien ne le signale.
     */
    const lignes = lignesRemise({
      objets: ["PER_DIEM", "GASOIL_TRACTEUR", "PIECES_RECHANGE"],
      montants: ["900000", "300000", "500000"],
      devises: ["GNF", "XOF", "GNF"],
      equivalents: ["", "4200000", ""],
    });

    expect(lignes[0]).toMatchObject({ devise: "GNF", montant: 900000, montantGnf: 900000 });
    expect(lignes[1]).toMatchObject({ devise: "XOF", montant: 300000, montantGnf: 4200000 });
    expect(lignes[2]).toMatchObject({ devise: "GNF", montant: 500000, montantGnf: 500000 });
  });

  it("ignore une ligne laissée vide", () => {
    const lignes = lignesRemise({
      objets: ["PER_DIEM", "DIVERS"],
      montants: ["900000", ""],
      devises: ["GNF", "GNF"],
      equivalents: ["", ""],
    });

    expect(lignes).toHaveLength(1);
    expect(lignes[0].objet).toBe("PER_DIEM");
  });

  it("accepte la virgule décimale et les espaces de frappe", () => {
    const lignes = lignesRemise({
      objets: ["PER_DIEM"],
      montants: ["1 200,50"],
      devises: ["GNF"],
      equivalents: [""],
    });

    expect(lignes[0].montant).toBe(1200.5);
  });

  it("ne retient jamais un montant illisible", () => {
    // Une saisie au clavier peut produire n'importe quoi ; un NaN glissé dans
    // un Decimal ferait sauter l'écriture entière de la mission.
    const lignes = lignesRemise({
      objets: ["PER_DIEM", "DIVERS"],
      montants: ["beaucoup", "500000"],
      devises: ["GNF", "GNF"],
      equivalents: ["", ""],
    });

    expect(lignes).toHaveLength(1);
    expect(lignes[0].objet).toBe("DIVERS");
  });

  it("laisse l'équivalent à zéro quand il manque sur une ligne en CFA", () => {
    // Le refus est prononcé plus haut, par la validation : ici on constate
    // seulement que rien n'est inventé — convertir au « taux du jour » ferait
    // entrer un montant faux dans la caisse.
    const lignes = lignesRemise({
      objets: ["GASOIL_TRACTEUR"],
      montants: ["300000"],
      devises: ["XOF"],
      equivalents: [""],
    });

    expect(lignes[0].montantGnf).toBe(0);
  });
});
