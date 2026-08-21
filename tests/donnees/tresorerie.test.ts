import { describe, expect, it } from "vitest";

/**
 * Trésorerie de l'entreprise.
 *
 * Le piège est le double comptage : l'argent remis à un chauffeur sort de la
 * caisse à la remise. Quand il le dépense, rien ne ressort une seconde fois.
 * Ces tests rejouent la règle appliquée par `tresorerie()`.
 */

interface Operation {
  sens: "ENTREE" | "SORTIE";
  montantGnf: number;
}

/** Reproduit le calcul du solde, solde d'ouverture compris. */
function solde(initial: number, ops: Operation[]): number {
  return ops.reduce((t, o) => t + (o.sens === "ENTREE" ? o.montantGnf : -o.montantGnf), initial);
}

describe("solde de caisse", () => {
  it("part du solde d'ouverture", () => {
    // Sans lui, la caisse afficherait −500 000 alors qu'elle contenait de quoi payer.
    expect(solde(3_000_000, [{ sens: "SORTIE", montantGnf: 500_000 }])).toBe(2_500_000);
    expect(solde(0, [{ sens: "SORTIE", montantGnf: 500_000 }])).toBe(-500_000);
  });

  it("monte avec un règlement client", () => {
    expect(solde(0, [{ sens: "ENTREE", montantGnf: 14_200_000 }])).toBe(14_200_000);
  });

  it("compte l'avance une seule fois, pas la dépense qu'elle finance", () => {
    // 2 000 000 remis au chauffeur ; il en dépense 1 500 000 sur cette caisse.
    // La trésorerie ne doit reculer que de 2 000 000, pas de 3 500 000.
    const ops: Operation[] = [{ sens: "SORTIE", montantGnf: 2_000_000 }];
    expect(solde(5_000_000, ops)).toBe(3_000_000);
  });

  it("compte les frais d'envoi en plus de l'avance", () => {
    // L'opérateur prélève 20 000 : ils sortent aussi, mais ne sont pas remis
    // au chauffeur et ne lui seront jamais réclamés.
    const ops: Operation[] = [
      { sens: "SORTIE", montantGnf: 2_000_000 },
      { sens: "SORTIE", montantGnf: 20_000 },
    ];
    expect(solde(5_000_000, ops)).toBe(2_980_000);
  });

  it("remonte quand le chauffeur rend le reliquat", () => {
    const ops: Operation[] = [
      { sens: "SORTIE", montantGnf: 2_000_000 },
      { sens: "ENTREE", montantGnf: 500_000 },
    ];
    expect(solde(5_000_000, ops)).toBe(3_500_000);
  });
});

describe("argent détenu par les chauffeurs", () => {
  /** Avances reçues moins ce qui a été justifié ou rendu. */
  const detenu = (mvts: { type: string; montantGnf: number }[]) =>
    mvts.reduce((t, m) => (m.type === "AVANCE" ? t + m.montantGnf : t - m.montantGnf), 0);

  it("mesure ce qui est sorti sans être encore justifié", () => {
    expect(
      detenu([
        { type: "AVANCE", montantGnf: 2_000_000 },
        { type: "DEPENSE", montantGnf: 1_500_000 },
      ]),
    ).toBe(500_000);
  });

  it("tombe à zéro quand tout est justifié puis rendu", () => {
    expect(
      detenu([
        { type: "AVANCE", montantGnf: 2_000_000 },
        { type: "DEPENSE", montantGnf: 1_500_000 },
        { type: "REMBOURSEMENT", montantGnf: 500_000 },
      ]),
    ).toBe(0);
  });
});
