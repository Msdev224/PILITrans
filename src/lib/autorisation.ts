import "server-only";

import { sessionRequise } from "@/auth";
import { peut, type Permission } from "@/lib/permissions";

/**
 * Garde des Server Actions.
 *
 * Toute mutation passe par ici. Le contrôle porte sur la permission et non sur
 * le rôle : c'est ce qui permet d'ouvrir un accès à un nouveau profil sans
 * repasser sur chaque action, et surtout d'éviter qu'un rôle ajouté hérite par
 * inadvertance de droits qu'on ne lui a jamais accordés.
 */
export async function exigerPermission(permission: Permission) {
  const session = await sessionRequise();
  if (!peut(session.user.role, permission)) {
    throw new Error("Vous n'avez pas les droits pour cette action.");
  }
  return session;
}

// Pour masquer un élément d'interface plutôt que refuser après coup, utiliser
// le composant `<SiPeut droit="…">` : une seule façon de faire, côté serveur.
