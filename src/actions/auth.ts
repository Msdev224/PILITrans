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
      // `code` distingue un mot de passe faux d'un compte verrouillé, et le
      // chauffeur dont l'espace n'est pas encore ouvert des deux autres : lui
      // n'a rien à corriger, et le renvoyer sur « identifiants incorrects » le
      // ferait recommencer indéfiniment.
      const code = (erreur as { code?: string }).code;
      const messages: Record<string, string> = {
        trop_de_tentatives: "Trop de tentatives. Réessaie dans une quinzaine de minutes.",
        espace_chauffeur_ferme:
          "L'espace chauffeur n'est pas encore ouvert. Ton compte fonctionne, il n'y a rien à saisir pour l'instant.",
      };
      return {
        erreur: (code && messages[code]) || "Numéro de téléphone ou mot de passe incorrect.",
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
