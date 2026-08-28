import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Une mission réglée ne s'annule pas — sur le VRAI code.
 *
 * L'annulation efface la recette de la mission. Si le client a versé quelque
 * chose, l'argent reste en trésorerie : on obtiendrait un encaissement
 * rattaché à une course réputée n'avoir jamais eu lieu.
 */

/*
 * Annuler libère le camion : `synchroniserCamion` s'exécute derrière et relit
 * réparations, missions et compteurs. On le laisse tourner plutôt que de le
 * neutraliser — c'est ainsi qu'on vérifie que l'annulation va bien au bout.
 */
const aggregat = { _max: { kmArrivee: 0 } };
const prisma = {
  voyage: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    aggregate: vi.fn(),
  },
  camion: { findUnique: vi.fn(), update: vi.fn() },
  reparation: { findFirst: vi.fn() },
  etapeVoyage: { aggregate: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/autorisation", () => ({ exigerPermission: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/journal", () => ({ journaliser: vi.fn(), difference: vi.fn() }));
vi.mock("@/lib/donnees/taux", () => ({ observerTaux: vi.fn() }));
vi.mock("@/lib/sms/declencheurs", () => ({
  notifierAffectation: vi.fn(), notifierDepart: vi.fn(),
  notifierArrivee: vi.fn(), notifierLivraison: vi.fn(),
}));

const { annulerVoyage } = await import("@/actions/voyages");

const base = { camionId: "cam1", statut: "TERMINE", reference: "KD-2026-041" };

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * Les implémentations se posent ici, pas au niveau du module.
   * `tests/setup.ts` appelle `vi.restoreAllMocks()` après chaque test : une
   * valeur définie une seule fois à l'import disparaît dès le second cas, et
   * les échecs qui suivent n'ont plus rien à voir avec le code testé.
   */
  prisma.voyage.update.mockResolvedValue({});
  prisma.voyage.findFirst.mockResolvedValue(null);
  prisma.voyage.aggregate.mockResolvedValue(aggregat);
  prisma.reparation.findFirst.mockResolvedValue(null);
  prisma.etapeVoyage.aggregate.mockResolvedValue(aggregat);
  prisma.$transaction.mockResolvedValue([aggregat, aggregat]);
  prisma.camion.findUnique.mockResolvedValue({
    id: "cam1", actif: true, statut: "DISPONIBLE", kilometrage: 128400,
  });
  prisma.camion.update.mockResolvedValue({});
});

describe("annulation d'une mission", () => {
  it("refuse une mission dont le client a tout payé", async () => {
    prisma.voyage.findUnique.mockResolvedValue({
      ...base,
      factures: [{ numero: "FAC-2026-041", montantPayeGnf: 14_200_000, statut: "PAYEE" }],
    });

    await expect(annulerVoyage("v1")).rejects.toThrow(/le client a réglé FAC-2026-041/);
    // Rien n'a été écrit : le refus précède la mutation.
    expect(prisma.voyage.update).not.toHaveBeenCalled();
  });

  it("refuse aussi sur un simple acompte", async () => {
    // Un versement partiel pose le même problème, en plus petit.
    prisma.voyage.findUnique.mockResolvedValue({
      ...base,
      factures: [{ numero: "FAC-2026-041", montantPayeGnf: 3_000_000, statut: "PARTIELLE" }],
    });

    await expect(annulerVoyage("v1")).rejects.toThrow(/acompte a été encaissé/);
    expect(prisma.voyage.update).not.toHaveBeenCalled();
  });

  it("accepte une mission facturée mais jamais réglée", async () => {
    // Une facture émise sans encaissement ne bloque rien : aucun argent n'est
    // entré, l'annulation n'orpheline aucun règlement.
    prisma.voyage.findUnique.mockResolvedValue({
      ...base,
      factures: [{ numero: "FAC-2026-041", montantPayeGnf: 0, statut: "EMISE" }],
    });

    await annulerVoyage("v1");
    expect(prisma.voyage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statut: "ANNULE" }) }),
    );
  });

  it("accepte une mission sans facture", async () => {
    prisma.voyage.findUnique.mockResolvedValue({ ...base, factures: [] });
    await annulerVoyage("v1");
    expect(prisma.voyage.update).toHaveBeenCalled();
  });

  it("refuse une mission déjà annulée", async () => {
    prisma.voyage.findUnique.mockResolvedValue({ ...base, statut: "ANNULE", factures: [] });
    await expect(annulerVoyage("v1")).rejects.toThrow(/déjà annulée/);
  });
});
