"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { caseACocher, erreursFormulaire, telephoneOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("clients.ecrire");
}

const schemaClient = z.object({
  nom: z.string().trim().min(1, "Nom requis"),
  telephone: telephoneOptionnel,
  ville: texteOptionnel,
  adresse: texteOptionnel,
  email: texteOptionnel.pipe(z.string().email("Adresse e-mail invalide").optional()),
  contact: texteOptionnel,
  nif: texteOptionnel,
  whatsapp: caseACocher,
  whatsappNumero: telephoneOptionnel,
});

export interface EtatClient {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function donneesClient(saisie: z.infer<typeof schemaClient>) {
  return {
    nom: saisie.nom,
    telephone: saisie.telephone ?? null,
    ville: saisie.ville ?? null,
    adresse: saisie.adresse ?? null,
    email: saisie.email ?? null,
    contact: saisie.contact ?? null,
    nif: saisie.nif ?? null,
    whatsapp: saisie.whatsapp,
    whatsappNumero: saisie.whatsappNumero ?? null,
  };
}

function rafraichir() {
  revalidatePath("/clients");
  revalidatePath("/factures");
  revalidatePath("/");
}

export async function creerClient(_etat: EtatClient, donnees: FormData): Promise<EtatClient> {
  await droitEcriture();

  const saisie = schemaClient.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatClient>(saisie.error, donnees);

  await prisma.client.create({ data: donneesClient(saisie.data) });
  rafraichir();
  return { ok: true };
}

export async function modifierClient(
  id: string,
  _etat: EtatClient,
  donnees: FormData,
): Promise<EtatClient> {
  await droitEcriture();

  const saisie = schemaClient.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatClient>(saisie.error, donnees);

  await prisma.client.update({ where: { id }, data: donneesClient(saisie.data) });
  rafraichir();
  return { ok: true };
}

export async function supprimerClient(id: string) {
  await droitEcriture();

  try {
    await prisma.client.delete({ where: { id } });
  } catch (e) {
    // Un client facturé est référencé : la base refuse la suppression, et
    // c'est bien ainsi — l'historique de facturation doit rester intact.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      throw new Error(
        "Ce client a des factures ou des réclamations : il ne peut pas être supprimé.",
      );
    }
    throw e;
  }

  rafraichir();
}
