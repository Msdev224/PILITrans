"use server";

import { ModeRemuneration, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { caseACocher, dateExpirationOptionnelle, erreursFormulaire, nombreOptionnel, telephoneOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("equipe.ecrire");
}

const schemaChauffeur = z
  .object({
    nom: z.string().trim().min(1, "Nom requis"),
    telephone: telephoneOptionnel,
    /**
     * Photo d'identité en data URI, déjà réduite par le navigateur.
     * Bornée ici aussi : le client peut être contourné, et une image de
     * plusieurs mégaoctets n'a rien à faire dans une colonne texte.
     */
    photo: texteOptionnel.pipe(
      z.string().max(600_000, "Photo trop lourde").optional(),
    ),
    numeroPermis: texteOptionnel,
    categoriePermis: texteOptionnel,
    permisExpire: dateExpirationOptionnelle,
    modeRemuneration: z.nativeEnum(ModeRemuneration),
    tauxRemuneration: nombreOptionnel,
    actif: caseACocher,
    whatsapp: caseACocher,
    whatsappNumero: telephoneOptionnel,
  })
  // Sans taux, la paie du voyage ne peut pas être calculée.
  .refine((c) => c.modeRemuneration === "FIXE_MENSUEL" || (c.tauxRemuneration ?? 0) > 0, {
    message: "Renseigner le taux correspondant au mode de rémunération",
    path: ["tauxRemuneration"],
  })
  // Une commission au-delà de 100 % de la recette est une erreur de saisie.
  .refine(
    (c) =>
      !["COMMISSION", "MIXTE"].includes(c.modeRemuneration) || (c.tauxRemuneration ?? 0) <= 100,
    { message: "Une commission se saisit en pourcentage (0 à 100)", path: ["tauxRemuneration"] },
  );

export interface EtatChauffeurFiche {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function donnees(saisie: z.infer<typeof schemaChauffeur>) {
  return {
    nom: saisie.nom,
    telephone: saisie.telephone ?? null,
    photo: saisie.photo ?? null,
    numeroPermis: saisie.numeroPermis ?? null,
    categoriePermis: saisie.categoriePermis ?? null,
    permisExpire: saisie.permisExpire ?? null,
    modeRemuneration: saisie.modeRemuneration,
    tauxRemuneration: saisie.tauxRemuneration ?? null,
    actif: saisie.actif,
    whatsapp: saisie.whatsapp,
    whatsappNumero: saisie.whatsappNumero ?? null,
  };
}

function rafraichir() {
  revalidatePath("/chauffeurs");
  revalidatePath("/voyages");
  revalidatePath("/alertes");
  revalidatePath("/");
}

export async function creerChauffeur(
  _etat: EtatChauffeurFiche,
  donneesForm: FormData,
): Promise<EtatChauffeurFiche> {
  await droitEcriture();

  const saisie = schemaChauffeur.safeParse(Object.fromEntries(donneesForm));
  if (!saisie.success) return erreursFormulaire<EtatChauffeurFiche>(saisie.error, donneesForm);

  await prisma.chauffeur.create({ data: donnees(saisie.data) });
  rafraichir();
  return { ok: true };
}

export async function modifierChauffeur(
  id: string,
  _etat: EtatChauffeurFiche,
  donneesForm: FormData,
): Promise<EtatChauffeurFiche> {
  await droitEcriture();

  const saisie = schemaChauffeur.safeParse(Object.fromEntries(donneesForm));
  if (!saisie.success) return erreursFormulaire<EtatChauffeurFiche>(saisie.error, donneesForm);

  await prisma.chauffeur.update({ where: { id }, data: donnees(saisie.data) });
  rafraichir();
  return { ok: true };
}

/** Un chauffeur ayant roulé est désactivé, jamais effacé : ses voyages restent. */
export async function retirerChauffeur(id: string) {
  await droitEcriture();

  try {
    await prisma.chauffeur.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      await prisma.chauffeur.update({ where: { id }, data: { actif: false } });
    } else {
      throw e;
    }
  }

  rafraichir();
}
