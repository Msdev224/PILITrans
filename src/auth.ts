import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { normaliserTelephone as normaliserE164 } from "@/lib/telephone";
import {
  enregistrerEchec,
  reinitialiserLimitation,
  verifierLimitation,
} from "@/lib/limitation";
import { verifierMotDePasse } from "@/lib/mots-de-passe";

class IdentifiantsInvalides extends CredentialsSignin {
  code = "identifiants_invalides";
}

class TropDeTentatives extends CredentialsSignin {
  code = "trop_de_tentatives";
}

/**
 * Comparaison des numéros à la connexion.
 *
 * Le numéro sert d'identifiant : il doit se reconnaître qu'il ait été saisi
 * `620 22 22 22`, `+224620222222` ou `00224 620-22-22-22`. La normalisation
 * E.164 partagée avec le reste de l'application garantit que ces trois formes
 * désignent bien le même compte.
 */
export function normaliserTelephone(telephone: string): string {
  return normaliserE164(telephone) ?? "";
}

const schemaConnexion = z.object({
  telephone: z.string().min(6, "Numéro de téléphone requis"),
  motDePasse: z.string().min(1, "Mot de passe requis"),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Identifiants",
      credentials: {
        telephone: { label: "Numéro de téléphone", type: "tel" },
        motDePasse: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const saisie = schemaConnexion.safeParse(credentials);
        if (!saisie.success) throw new IdentifiantsInvalides();

        const cible = normaliserTelephone(saisie.data.telephone);

        // Verrou anti-force brute, posé AVANT toute lecture en base : cinq
        // échecs sur un même numéro suffisent à bloquer quinze minutes.
        const limite = verifierLimitation(cible);
        if (limite.bloque) throw new TropDeTentatives();

        // Le téléphone est stocké formaté (« +224 620 00 00 00 ») : on compare
        // sur la version normalisée, donc côté application.
        const utilisateurs = await prisma.utilisateur.findMany({
          where: { actif: true, telephone: { not: null } },
          select: { id: true, nom: true, email: true, telephone: true, motDePasse: true, role: true, chauffeurId: true },
        });
        const utilisateur = utilisateurs.find((u) => normaliserTelephone(u.telephone ?? "") === cible);
        if (!utilisateur) {
          enregistrerEchec(cible);
          throw new IdentifiantsInvalides();
        }

        const valide = await verifierMotDePasse(saisie.data.motDePasse, utilisateur.motDePasse);
        if (!valide) {
          enregistrerEchec(cible);
          throw new IdentifiantsInvalides();
        }

        reinitialiserLimitation(cible);
        return {
          id: utilisateur.id,
          name: utilisateur.nom,
          email: utilisateur.email,
          role: utilisateur.role,
          chauffeurId: utilisateur.chauffeurId,
        };
      },
    }),
  ],
});

/** Session garantie non nulle — à utiliser dans les pages déjà protégées par le middleware. */
export async function sessionRequise() {
  const session = await auth();
  if (!session?.user) throw new Error("Session absente : la route doit être protégée par le middleware.");
  return session;
}
