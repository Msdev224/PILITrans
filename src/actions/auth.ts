"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normaliserTelephone } from "@/auth";
import { pageAccueil } from "@/lib/permissions";

const schema = z.object({
  telephone: z.string().trim().min(6, "Numéro de téléphone requis"),
  motDePasse: z.string().min(1, "Mot de passe requis"),
});

export interface EtatConnexion {
  erreur?: string;
}

export async function seConnecter(_etat: EtatConnexion, donnees: FormData): Promise<EtatConnexion> {
  const saisie = schema.safeParse({
    telephone: donnees.get("telephone"),
    motDePasse: donnees.get("motDePasse"),
  });
  if (!saisie.success) {
    return { erreur: saisie.error.issues[0]?.message ?? "Saisie invalide" };
  }

  // Le rôle détermine la page d'accueil : chaque profil atterrit sur le
  // premier écran qu'il a le droit de voir (voir `pageAccueil`).
  const utilisateurs = await prisma.utilisateur.findMany({
    where: { actif: true, telephone: { not: null } },
    select: { telephone: true, role: true },
  });
  const cible = normaliserTelephone(saisie.data.telephone);
  const role = utilisateurs.find((u) => normaliserTelephone(u.telephone ?? "") === cible)?.role;

  try {
    await signIn("credentials", {
      telephone: saisie.data.telephone,
      motDePasse: saisie.data.motDePasse,
      redirectTo: role ? pageAccueil(role) : "/",
    });
  } catch (erreur) {
    // `signIn` lève une redirection en cas de succès : il faut la laisser remonter.
    if (erreur instanceof AuthError) {
      // `code` distingue un mot de passe faux d'un compte temporairement verrouillé.
      const bloque = (erreur as { code?: string }).code === "trop_de_tentatives";
      return {
        erreur: bloque
          ? "Trop de tentatives. Réessaie dans une quinzaine de minutes."
          : "Numéro de téléphone ou mot de passe incorrect.",
      };
    }
    throw erreur;
  }

  return {};
}

export async function seDeconnecter() {
  await signOut({ redirect: false });
  redirect("/connexion");
}
