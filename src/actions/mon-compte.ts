"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionRequise } from "@/auth";
import { hacherMotDePasse, verifierMotDePasse } from "@/lib/mots-de-passe";
import { prisma } from "@/lib/prisma";
import { erreursFormulaire } from "@/lib/validation";

export interface EtatMotDePasse {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
}

const schema = z
  .object({
    actuel: z.string().min(1, "Mot de passe actuel requis"),
    nouveau: z.string().min(8, "8 caractères minimum"),
    confirmation: z.string().min(1, "Confirmation requise"),
  })
  .refine((d) => d.nouveau === d.confirmation, {
    message: "Les deux saisies diffèrent",
    path: ["confirmation"],
  })
  .refine((d) => d.nouveau !== d.actuel, {
    message: "Le nouveau mot de passe est identique à l'ancien",
    path: ["nouveau"],
  });

/**
 * Changement de son propre mot de passe.
 *
 * Aucune permission n'est exigée : il s'agit de son compte. En revanche le mot
 * de passe **actuel** est demandé — sans quoi un téléphone de bord laissé
 * déverrouillé quelques minutes suffirait à verrouiller le compte de son
 * titulaire.
 */
export async function changerMonMotDePasse(
  _etat: EtatMotDePasse,
  donnees: FormData,
): Promise<EtatMotDePasse> {
  const session = await sessionRequise();

  const saisie = schema.safeParse(Object.fromEntries(donnees));
  // Les valeurs ne sont jamais réémises : ce sont des mots de passe.
  if (!saisie.success) {
    const { champs } = erreursFormulaire<EtatMotDePasse>(saisie.error, new FormData());
    return { champs };
  }

  const compte = await prisma.utilisateur.findUnique({
    where: { id: session.user.id },
    select: { motDePasse: true },
  });
  if (!compte) return { erreur: "Compte introuvable." };

  if (!(await verifierMotDePasse(saisie.data.actuel, compte.motDePasse))) {
    return { champs: { actuel: "Mot de passe actuel incorrect" } };
  }

  await prisma.utilisateur.update({
    where: { id: session.user.id },
    data: { motDePasse: await hacherMotDePasse(saisie.data.nouveau) },
  });

  revalidatePath("/mon-compte");
  revalidatePath("/chauffeur");
  return { ok: true };
}
