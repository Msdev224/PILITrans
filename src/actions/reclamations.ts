"use server";

import { StatutReclamation, TypeReclamation } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { erreursFormulaire, nombreOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("clients.ecrire");
}

const schemaReclamation = z
  .object({
    clientId: z.string().min(1, "Client requis"),
    voyageId: texteOptionnel,
    /** Marchandise contestée : c'est elle qui porte les quantités. */
    ligneId: texteOptionnel,
    factureId: texteOptionnel,
    type: z.nativeEnum(TypeReclamation),
    description: z.string().trim().min(1, "Description requise"),
    quantiteContestee: nombreOptionnel,
    statut: z.nativeEnum(StatutReclamation),
    resolution: texteOptionnel,
    montantAvoirGnf: nombreOptionnel,
  })
  // Une réclamation sur la quantité sans chiffre contesté n'est pas recoupable.
  .refine((r) => r.type !== "QUANTITE" || r.quantiteContestee != null, {
    message: "Indiquer la quantité que le client déclare avoir reçue",
    path: ["quantiteContestee"],
  })
  // Clore une réclamation sans dire comment ne laisse aucune trace exploitable.
  .refine((r) => !["RESOLUE", "REJETEE"].includes(r.statut) || !!r.resolution, {
    message: "Expliquer la résolution (avoir, remise ou rejet motivé)",
    path: ["resolution"],
  });

export interface EtatReclamation {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function donneesReclamation(saisie: z.infer<typeof schemaReclamation>) {
  const close = saisie.statut === "RESOLUE" || saisie.statut === "REJETEE";

  return {
    clientId: saisie.clientId,
    voyageId: saisie.voyageId ?? null,
    ligneId: saisie.ligneId || null,
    factureId: saisie.factureId ?? null,
    type: saisie.type,
    description: saisie.description,
    quantiteContestee: saisie.quantiteContestee ?? null,
    statut: saisie.statut,
    resolution: saisie.resolution ?? null,
    // L'avoir n'a de sens que sur une réclamation acceptée.
    montantAvoirGnf: saisie.statut === "RESOLUE" ? (saisie.montantAvoirGnf ?? null) : null,
    dateResolution: close ? new Date() : null,
  };
}

function rafraichir() {
  revalidatePath("/reclamations");
  revalidatePath("/alertes");
  revalidatePath("/clients");
  revalidatePath("/");
}

export async function creerReclamation(
  _etat: EtatReclamation,
  donnees: FormData,
): Promise<EtatReclamation> {
  await droitEcriture();

  const saisie = schemaReclamation.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatReclamation>(saisie.error, donnees);

  await prisma.reclamation.create({ data: donneesReclamation(saisie.data) });
  rafraichir();
  return { ok: true };
}

export async function modifierReclamation(
  id: string,
  _etat: EtatReclamation,
  donnees: FormData,
): Promise<EtatReclamation> {
  await droitEcriture();

  const saisie = schemaReclamation.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatReclamation>(saisie.error, donnees);

  const existante = await prisma.reclamation.findUnique({ where: { id } });
  if (!existante) throw new Error("Réclamation introuvable.");

  const data = donneesReclamation(saisie.data);
  await prisma.reclamation.update({
    where: { id },
    // On ne réécrit pas une date de résolution déjà posée.
    data: { ...data, dateResolution: existante.dateResolution ?? data.dateResolution },
  });

  rafraichir();
  return { ok: true };
}

export async function supprimerReclamation(id: string) {
  await droitEcriture();
  await prisma.reclamation.delete({ where: { id } });
  rafraichir();
}
