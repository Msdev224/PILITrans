import { sessionRequise } from "@/auth";
import { peut, type Permission } from "@/lib/permissions";

/**
 * N'affiche ses enfants que si le compte détient le droit demandé.
 *
 * Les Server Actions refusent déjà l'écriture aux rôles qui n'y ont pas droit,
 * mais laisser le bouton visible revient à promettre une action qu'on refusera
 * ensuite : un profil en lecture seule doit voir une interface cohérente avec
 * ce qu'il peut faire, pas un message d'erreur après coup.
 */
export async function SiPeut({
  droit,
  children,
  sinon,
}: {
  droit: Permission;
  children: React.ReactNode;
  sinon?: React.ReactNode;
}) {
  const session = await sessionRequise();
  return peut(session.user.role, droit) ? <>{children}</> : <>{sinon ?? null}</>;
}
