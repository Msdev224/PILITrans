import type { NextAuthConfig } from "next-auth";

import { pageAccueil, permissionDeRoute, peut } from "@/lib/permissions";

/**
 * Partie « edge-safe » de la configuration Auth.js : aucun accès à Prisma ni
 * à node:crypto, pour pouvoir être importée par le middleware.
 * Les providers (qui, eux, lisent la base) sont ajoutés dans `src/auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/connexion",
    error: "/connexion",
  },
  /**
   * Sept jours, prolongés à chaque journée d'activité.
   * Le défaut de trente jours était trop long pour un téléphone de bord qui
   * circule et peut se perdre ; une durée plus courte, elle, déconnecterait le
   * chauffeur en pleine mission alors qu'il n'a pas toujours de réseau pour se
   * reconnecter.
   */
  session: {
    strategy: "jwt",
    /*
     * Plafond absolu, pas la règle.
     *
     * Le middleware tourne en edge et ne peut pas lire la base : la durée
     * réglée dans les Paramètres est appliquée par `sessionRequise()`, qui a
     * accès à la base. Ce plafond de trente jours n'est qu'un garde-fou pour
     * le cas où le jeton circulerait sans jamais passer par une page.
     */
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  trustHost: true,
  callbacks: {
    // Recopie rôle et identifiants métier dans le jeton, puis dans la session,
    // pour que les Server Components y accèdent sans requête supplémentaire.
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.chauffeurId = user.chauffeurId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role;
        session.user.chauffeurId = token.chauffeurId ?? null;
      }
      return session;
    },
    /**
     * Contrôle d'accès par route, adossé à la même matrice de permissions que
     * les Server Actions. Masquer une entrée du menu ne suffit pas : une URL
     * tapée à la main doit être refusée ici, avant que la page ne s'exécute.
     */
    authorized({ auth, request }) {
      const chemin = request.nextUrl.pathname;
      const role = auth?.user?.role;
      const connecte = !!role;

      if (chemin.startsWith("/connexion")) {
        return connecte
          ? Response.redirect(new URL(pageAccueil(role), request.nextUrl))
          : true;
      }
      if (!connecte) return false;

      /*
       * Sortie de secours d'une session révoquée.
       *
       * Le middleware ne peut pas savoir qu'un compte a été désactivé — il
       * tourne en edge, sans accès à la base. Il doit donc laisser passer cet
       * écran pour tout visiteur porteur d'un jeton, sinon la redirection
       * qu'émet `sessionRequise()` reboucle indéfiniment.
       */
      if (chemin.startsWith("/acces-retire")) return true;

      // L'espace mobile appartient au chauffeur ; le gérant y accède pour
      // dépanner depuis le bureau.
      if (chemin.startsWith("/chauffeur")) {
        return role === "CHAUFFEUR" || role === "GERANT";
      }
      if (role === "CHAUFFEUR") {
        return Response.redirect(new URL("/chauffeur", request.nextUrl));
      }

      const requis = permissionDeRoute(chemin);
      if (requis && !peut(role, requis)) {
        return Response.redirect(new URL(pageAccueil(role), request.nextUrl));
      }
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
