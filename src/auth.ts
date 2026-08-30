import { redirect } from "next/navigation";
import { cache } from "react";

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
import { espaceChauffeurActif } from "@/lib/donnees/espace-chauffeur";
import { verifierMotDePasse } from "@/lib/mots-de-passe";

class IdentifiantsInvalides extends CredentialsSignin {
  code = "identifiants_invalides";
}

class TropDeTentatives extends CredentialsSignin {
  code = "trop_de_tentatives";
}

class EspaceChauffeurFerme extends CredentialsSignin {
  code = "espace_chauffeur_ferme";
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

/**
 * Empreinte scrypt valide mais qui ne correspond à aucun mot de passe.
 *
 * Sert à égaliser la durée de réponse quand le numéro est inconnu : sans elle,
 * un compte absent répond instantanément là où un compte existant fait tourner
 * scrypt, et cet écart indique à l'attaquant quels numéros sont enregistrés.
 * Le sel et l'empreinte sont constants — leur contenu n'a aucune importance,
 * seul compte le fait que le calcul soit réellement exécuté.
 */
const EMPREINTE_FACTICE =
  "00000000000000000000000000000000:" + "0".repeat(128);

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
        if (!cible) throw new IdentifiantsInvalides();

        /*
         * Recherche indexée sur le numéro normalisé.
         *
         * Le code chargeait auparavant TOUS les utilisateurs actifs, empreinte
         * comprise, pour les comparer un à un : une requête anonyme et gratuite
         * déclenchait un balayage complet de la table, et l'ensemble des
         * empreintes transitait en mémoire à chaque essai, même raté.
         */
        const utilisateur = await prisma.utilisateur.findUnique({
          where: { telephoneNormalise: cible },
          select: {
            id: true, nom: true, email: true, motDePasse: true,
            role: true, chauffeurId: true, actif: true,
          },
        });

        /*
         * Compte inconnu ou désactivé : on vérifie quand même une empreinte
         * factice. Sans cela, la réponse revient immédiatement alors qu'un
         * compte existant fait tourner scrypt, et l'écart de durée dit à
         * l'attaquant quels numéros sont enregistrés.
         */
        if (!utilisateur || !utilisateur.actif) {
          await verifierMotDePasse(saisie.data.motDePasse, EMPREINTE_FACTICE);
          throw new IdentifiantsInvalides();
        }

        // Verrou partagé entre instances, posé avant de tester le mot de passe.
        const limite = await verifierLimitation(utilisateur.id);
        if (limite.bloque) throw new TropDeTentatives();

        const valide = await verifierMotDePasse(saisie.data.motDePasse, utilisateur.motDePasse);
        if (!valide) {
          await enregistrerEchec(utilisateur.id);
          throw new IdentifiantsInvalides();
        }

        /*
         * Un chauffeur n'entre pas tant que son espace est fermé.
         *
         * Le contrôle vient après le mot de passe, volontairement : le placer
         * avant dirait à qui essaie un numéro au hasard qu'il correspond à un
         * compte chauffeur. Ici, seul quelqu'un qui connaît déjà le mot de
         * passe apprend quelque chose — et ce quelqu'un, c'est le chauffeur.
         *
         * Le message est distinct d'un refus d'identifiants : le chauffeur ne
         * doit pas passer sa soirée à croire qu'il a mal tapé.
         */
        if (utilisateur.role === "CHAUFFEUR" && !(await espaceChauffeurActif())) {
          await reinitialiserLimitation(utilisateur.id);
          throw new EspaceChauffeurFerme();
        }

        await reinitialiserLimitation(utilisateur.id);
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

/**
 * Session garantie non nulle, **et toujours valide en base**.
 *
 * Le jeton vaut sept jours et ne portait aucun contrôle : désactiver un compte
 * ne coupait rien, et un téléphone de bord perdu restait une session ouverte
 * sur les missions, les clients et la caisse — sans moyen de la fermer. Le
 * drapeau `actif` n'était vérifié qu'à la connexion.
 *
 * `cache()` déduplique la lecture sur un même rendu : le coût réel est d'une
 * requête indexée par page, là où le cockpit en émettait déjà plusieurs.
 */
const compteValide = cache(async (utilisateurId: string) => {
  const [utilisateur, parametres] = await Promise.all([
    prisma.utilisateur.findUnique({
      where: { id: utilisateurId },
      select: { actif: true, role: true, chauffeurId: true, derniereConnexion: true },
    }),
    prisma.parametres.findFirst({ select: { dureeSessionJours: true } }),
  ]);
  return { utilisateur, dureeJours: parametres?.dureeSessionJours ?? 7 };
});

export async function sessionRequise() {
  const session = await auth();
  if (!session?.user) throw new Error("Session absente : la route doit être protégée par le middleware.");

  const { utilisateur: compte, dureeJours } = await compteValide(session.user.id);

  /*
   * Durée de session réglée dans les Paramètres.
   *
   * Le middleware, qui tourne en edge, ne peut pas la lire : le plafond du
   * jeton est donc large, et c'est ici — avec la base sous la main — que la
   * durée voulue s'applique. On la compte depuis la dernière connexion
   * réussie, pas depuis le dernier clic : un téléphone volé ne doit pas
   * prolonger son propre accès en étant utilisé.
   */
  const expiree =
    !!compte?.derniereConnexion &&
    Date.now() - compte.derniereConnexion.getTime() > dureeJours * 86_400_000;

  if (!compte || !compte.actif || expiree) {
    /*
     * Écran dédié, et non `/connexion`.
     *
     * Le jeton reste cryptographiquement valide : le middleware, qui tourne
     * en edge et ne peut pas interroger la base, verrait un visiteur connecté
     * sur `/connexion` et le renverrait vers son accueil — lequel repasse ici.
     * La boucle serait infinie. `/acces-retire` rompt le cycle et propose la
     * seule action utile : effacer la session.
     */
    redirect(expiree ? "/acces-retire?motif=expiree" : "/acces-retire");
  }

  /*
   * Le rôle vient de la base, pas du jeton.
   *
   * Retirer un droit à quelqu'un n'avait aucun effet tant que son jeton
   * vivait : il gardait l'ancien rôle jusqu'à sept jours. La source de vérité
   * est la fiche, le jeton n'est qu'un porteur d'identité.
   */
  return {
    ...session,
    user: { ...session.user, role: compte.role, chauffeurId: compte.chauffeurId },
  };
}
