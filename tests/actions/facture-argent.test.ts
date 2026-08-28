import { beforeEach, describe, expect, it, vi } from "vitest";

import { creances } from "@/lib/calculs";

/**
 * Le chemin de l'argent sur une facture — sur le VRAI code.
 *
 * Trois règles qui n'étaient couvertes par aucun test, et dont deux étaient
 * fausses : la TVA figée sur le document, l'identité de l'émetteur recopiée à
 * l'émission, et le versement enregistré tel quel plutôt que rogné.
 */

const prisma = {
  parametres: { findFirst: vi.fn() },
  facture: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  paiement: { create: vi.fn() },
};

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/autorisation", () => ({ exigerPermission: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/journal", () => ({ journaliser: vi.fn(), difference: vi.fn() }));
vi.mock("@/lib/mission-active", () => ({ refusMissionAnnulee: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/donnees/taux", () => ({ observerTaux: vi.fn() }));
vi.mock("@/lib/donnees/facturation-auto", () => ({ numeroLibre: vi.fn().mockResolvedValue("FAC-2026-001") }));
vi.mock("@/lib/sms/declencheurs", () => ({ notifierFacture: vi.fn(), notifierRelance: vi.fn() }));

const { creerFacture } = await import("@/actions/factures");

const PARAMETRES = {
  prefixeFacture: "FAC",
  delaiPaiementJours: 14,
  tvaTaux: 18,
  raisonSociale: "MS Trans",
  adresse: "Conakry, Guinée",
  telephone: "+224620000000",
  email: "contact@mstrans.gn",
  rccm: "RCCM-123",
  nif: "NIF-456",
  orangeMoney: "620 00 00 00",
  banque: "Ecobank",
  compteBancaire: "GN123",
  conditionsPaiement: "Paiement à 14 jours",
};

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  for (const [c, v] of Object.entries(champs)) f.append(c, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.parametres.findFirst.mockResolvedValue(PARAMETRES);
  prisma.facture.create.mockImplementation(({ data }) => ({ id: "f1", ...data }));
  prisma.facture.findUnique.mockResolvedValue({
    id: "f1", numero: "FAC-2026-001", echeance: new Date("2026-09-10"),
    montantGnf: 10_000_000, totalTtcGnf: 11_800_000, paiements: [],
  });
  prisma.facture.update.mockResolvedValue({});
});

describe("TVA figée sur le document", () => {
  it("écrit taux, montant et TTC à l'émission", async () => {
    await creerFacture({}, formulaire({
      clientId: "c1", montant: "10000000", devise: "GNF", dateEmission: "2026-08-27",
    }));

    const { data } = prisma.facture.create.mock.calls[0][0];
    expect(data.tauxTva).toBe(18);
    expect(data.montantTvaGnf).toBe(1_800_000);
    // Le client doit 11 800 000, pas 10 000 000 : le document le réclame.
    expect(data.totalTtcGnf).toBe(11_800_000);
  });

  it("recopie l'identité de l'émetteur", async () => {
    await creerFacture({}, formulaire({
      clientId: "c1", montant: "10000000", devise: "GNF", dateEmission: "2026-08-27",
    }));

    const { data } = prisma.facture.create.mock.calls[0][0];
    // Changer d'adresse ou de compte ne doit pas réécrire une facture partie.
    expect(data.emetteurRaisonSociale).toBe("MS Trans");
    expect(data.emetteurRccm).toBe("RCCM-123");
    expect(data.emetteurCompte).toBe("GN123");
    expect(data.emetteurConditions).toBe("Paiement à 14 jours");
  });

  it("ne solde pas une facture réglée du seul hors-taxe", async () => {
    await creerFacture({}, formulaire({
      clientId: "c1", montant: "10000000", devise: "GNF",
      dateEmission: "2026-08-27", montantRecu: "10000000",
    }));

    const { data } = prisma.facture.create.mock.calls[0][0];
    // 10 000 000 reçus sur 11 800 000 dus : la TVA reste à encaisser.
    expect(data.statut).not.toBe("PAYEE");
  });
});

describe("trop-perçu", () => {
  it("enregistre le versement réel, sans le rogner", async () => {
    await creerFacture({}, formulaire({
      clientId: "c1", montant: "10000000", devise: "GNF",
      dateEmission: "2026-08-27", montantRecu: "12000000",
    }));

    const versement = prisma.paiement.create.mock.calls[0][0].data;
    // 200 000 au-dessus du dû : ils sont dans la caisse, ils doivent être
    // dans les comptes. Les absorber en silence créait un écart introuvable.
    expect(versement.montantGnf).toBe(12_000_000);
  });
});

describe("créances", () => {
  it("comptent le TTC restant dû, pas le hors-taxe", () => {
    const situation = creances([
      { montantGnf: 10_000_000, totalTtcGnf: 11_800_000, montantPayeGnf: 10_000_000, statut: "PARTIELLE" },
    ]);
    expect(situation.encours).toBe(1_800_000);
  });

  it("retombent sur le hors-taxe pour les factures d'avant la reprise", () => {
    const situation = creances([
      { montantGnf: 10_000_000, montantPayeGnf: 4_000_000, statut: "PARTIELLE" },
    ]);
    expect(situation.encours).toBe(6_000_000);
  });
});
