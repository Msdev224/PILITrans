import { Rail } from "@/components/rail";
import { sessionRequise } from "@/auth";
import { alertes, compterParSeverite } from "@/lib/donnees/alertes";
import { resumeRail } from "@/lib/donnees/tableau-de-bord";

/**
 * Coquille du cockpit : rail latéral + zone principale.
 * Le contrôle d'accès par route est fait par le middleware ; la session est
 * relue ici pour n'afficher dans le menu que les écrans autorisés au rôle.
 */
export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const session = await sessionRequise();
  const [resume, fil] = await Promise.all([resumeRail(), alertes()]);
  const compteur = compterParSeverite(fil);

  return (
    <div className="app">
      <Rail nbAlertes={compteur.urgent} resume={resume} role={session.user.role} />
      <div className="zone">{children}</div>
    </div>
  );
}
