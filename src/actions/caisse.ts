"use server";

import { Devise, TypeMouvement } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import {
  dateOptionnelle,
  erreursFormulaire,
  nombreOptionnel,
  nombrePositif,
  texteOptionnel,
} from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("depenses.ecrire");
}

/**
 * Mouvement de caisse chauffeur.
 *
 * Seules les DÉPENSES étaient créées jusqu'ici, par l'espace chauffeur : la
 * caisse ne pouvait que descendre. Il manquait l'AVANCE (le gérant remet de
 * l'argent) et le REMBOURSEMENT (le chauffeur rend le reliquat), sans quoi le
 * solde n'a aucun sens.
 */
const schemaMouvement = z
  .object({
    chauffeurId: z.string().min(1, "Chauffeur requis"),
    // La DÉPENSE est volontairement exclue ici. Un mouvement de caisse de ce
    // type sans dépense sous-jacente sort l'argent de la caisse sans l'imputer
    // à un camion : la marge du véhicule reste inchangée alors que l'argent a
    // bien été dépensé pour lui. Une dépense se saisit donc comme dépense
    // (avec son type et son rattachement), en cochant « payée sur la caisse ».
    type: z.nativeEnum(TypeMouvement).refine((t) => t !== "DEPENSE", {
      message:
        "Une dépense se saisit depuis l'écran Dépenses, en cochant « payée sur la caisse du chauffeur » : sans cela, elle n'entrerait dans la marge d'aucun camion.",
    }),
    montant: nombrePositif("Montant requis"),
    devise: z.nativeEnum(Devise),
    montantGnf: nombreOptionnel,
    motif: texteOptionnel,
    /**
     * Mission financée par cette avance.
     *
     * Sans elle, l'argent remis pour un Conakry–Dakar se confond avec celui
     * d'une autre course : impossible de dire ce qu'un voyage a coûté en
     * trésorerie, ni ce qu'il reste à justifier dessus.
     */
    voyageId: texteOptionnel,
    date: dateOptionnelle,
  })
  .refine((m) => m.devise === "GNF" || (m.montantGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF du montant en CFA",
    path: ["montantGnf"],
  });

export interface EtatCaisse {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

export async function enregistrerMouvementCaisse(
  _etat: EtatCaisse,
  donnees: FormData,
): Promise<EtatCaisse> {
  await droitEcriture();

  const saisie = schemaMouvement.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatCaisse>(saisie.error, donnees);

  const montantGnf =
    saisie.data.devise === "GNF" ? saisie.data.montant : (saisie.data.montantGnf ?? 0);

  await prisma.mouvementCaisse.create({
    data: {
      chauffeurId: saisie.data.chauffeurId,
      type: saisie.data.type,
      montant: saisie.data.montant,
      devise: saisie.data.devise,
      montantGnf,
      motif: saisie.data.motif ?? null,
      voyageId: saisie.data.voyageId || null,
      date: saisie.data.date ?? new Date(),
    },
  });

  revalidatePath("/chauffeurs");
  revalidatePath("/voyages");
  revalidatePath("/chauffeur");
  revalidatePath("/alertes");
  revalidatePath("/");
  return { ok: true };
}

export async function supprimerMouvementCaisse(id: string) {
  await droitEcriture();

  const mouvement = await prisma.mouvementCaisse.findUnique({
    where: { id },
    select: { depenseId: true },
  });
  if (!mouvement) throw new Error("Mouvement introuvable.");

  // Un mouvement adossé à une dépense ne se supprime pas seul : la dépense
  // resterait sans contrepartie de caisse.
  if (mouvement.depenseId) {
    throw new Error(
      "Ce mouvement correspond à une dépense saisie sur le terrain : supprimer la dépense à la place.",
    );
  }

  await prisma.mouvementCaisse.delete({ where: { id } });
  revalidatePath("/chauffeurs");
  revalidatePath("/voyages");
  revalidatePath("/chauffeur");
  revalidatePath("/");
}
