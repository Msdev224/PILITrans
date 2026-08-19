import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Le middleware tourne sur le runtime edge : il n'utilise que la config
// « edge-safe » (sans Prisma), et donc uniquement le jeton de session.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  /**
   * Tout est protégé sauf :
   *  - `/api` (les routes d'authentification doivent rester joignables) ;
   *  - les internes de Next et les ressources statiques ;
   *  - `manifest.webmanifest` et `sw.js`, indispensables à la PWA.
   *
   * Ces deux derniers étaient absents de la liste : le navigateur les recevait
   * en redirection 307 vers /connexion, ce qui empêchait l'installation de
   * l'application et tout fonctionnement hors ligne.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|webp|ico|webmanifest)$).*)",
  ],
};
