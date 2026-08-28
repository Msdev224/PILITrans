import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cloisonnement des missions du chauffeur — sur le VRAI code.
 *
 * La suite existante réimplémentait la règle dans le fichier de test : elle
 * restait verte quelle que soit l'évolution de l'action. Ici on importe
 * `src/actions/chauffeur.ts` et on lui soumet des formulaires forgés, comme le
 * ferait quelqu'un qui modifie l'identifiant caché avant d'envoyer.
 */

const prisma = {
  voyage: { findUnique: vi.fn() },
  ligneMarchandise: { findUnique: vi.fn(), update: vi.fn() },
};
const sessionRequise = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/auth", () => ({ sessionRequise }));
vi.mock("@/lib/journal", () => ({ journaliser: vi.fn(), difference: vi.fn() }));

const { confirmerChargement } = await import("@/actions/chauffeur");

const CHAUFFEUR = "chf_mamadou";
const AUTRE = "chf_ibrahima";

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  for (const [c, v] of Object.entries(champs)) f.append(c, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionRequise.mockResolvedValue({
    user: { id: "u1", role: "CHAUFFEUR", chauffeurId: CHAUFFEUR },
  });
});

describe("un chauffeur n'agit que sur ses missions", () => {
  it("refuse un voyage attribué à quelqu'un d'autre", async () => {
    prisma.voyage.findUnique.mockResolvedValue({
      id: "v_autre", chauffeurId: AUTRE, statut: "EN_COURS", reference: "CB-2026-045",
    });

    await expect(
      confirmerChargement({}, formulaire({ voyageId: "v_autre", ligneId: "l1", quantite: "12" })),
    ).rejects.toThrow(/pas attribuée/i);

    // Rien n'a été écrit : le refus doit précéder toute mutation.
    expect(prisma.ligneMarchandise.update).not.toHaveBeenCalled();
  });

  it("refuse une mission annulée, même si elle lui appartient", async () => {
    prisma.voyage.findUnique.mockResolvedValue({
      id: "v1", chauffeurId: CHAUFFEUR, statut: "ANNULE", reference: "CB-2026-050",
    });

    await expect(
      confirmerChargement({}, formulaire({ voyageId: "v1", ligneId: "l1", quantite: "12" })),
    ).rejects.toThrow(/annulée/i);
    expect(prisma.ligneMarchandise.update).not.toHaveBeenCalled();
  });

  it("refuse un compte qui n'est pas un chauffeur", async () => {
    // Un gérant peut ouvrir l'écran pour dépanner ; il ne saisit pas à la place.
    sessionRequise.mockResolvedValue({ user: { id: "u9", role: "GERANT", chauffeurId: null } });

    await expect(
      confirmerChargement({}, formulaire({ voyageId: "v1", ligneId: "l1", quantite: "12" })),
    ).rejects.toThrow(/réservée au chauffeur/i);
  });

  it("refuse une marchandise qui appartient à un autre voyage", async () => {
    prisma.voyage.findUnique.mockResolvedValue({
      id: "v1", chauffeurId: CHAUFFEUR, statut: "EN_ATTENTE_CHARGEMENT", reference: "CB-1",
    });
    // La ligne existe, mais elle est rattachée ailleurs.
    prisma.ligneMarchandise.findUnique.mockResolvedValue({
      id: "l_ailleurs", voyageId: "v_autre", unite: { symbole: "t" },
    });

    await expect(
      confirmerChargement({}, formulaire({ voyageId: "v1", ligneId: "l_ailleurs", quantite: "12" })),
    ).rejects.toThrow(/introuvable sur cette mission/i);
    expect(prisma.ligneMarchandise.update).not.toHaveBeenCalled();
  });

  it("accepte une marchandise de sa propre mission", async () => {
    prisma.voyage.findUnique.mockResolvedValue({
      id: "v1", chauffeurId: CHAUFFEUR, statut: "EN_ATTENTE_CHARGEMENT", reference: "CB-1",
    });
    prisma.ligneMarchandise.findUnique.mockResolvedValue({
      id: "l1", voyageId: "v1", unite: { symbole: "t" },
    });
    prisma.ligneMarchandise.update.mockResolvedValue({});

    const etat = await confirmerChargement(
      {},
      formulaire({ voyageId: "v1", ligneId: "l1", quantite: "12" }),
    );

    expect(etat.ok).toBe(true);
    expect(prisma.ligneMarchandise.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { quantiteRecue: 12 },
    });
  });
});
