import { NettoyageServiceWorker } from "@/components/nettoyage-sw";
import { Rail } from "@/components/rail";
import { sessionRequise } from "@/auth";
import { alertes, compterParSeverite } from "@/lib/donnees/alertes";
import { marqueEntreprise } from "@/lib/donnees/accueil";
import { resumeRail } from "@/lib/donnees/tableau-de-bord";

/**
 * Coquille du cockpit : rail latéral + zone principale.
 * Le contrôle d'accès par route est fait par le middleware ; la session est
 * relue ici pour n'afficher dans le menu que les écrans autorisés au rôle.
 */
export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const session = await sessionRequise();
  const [resume, fil, marque] = await Promise.all([resumeRail(), alertes(), marqueEntreprise()]);
  const compteur = compterParSeverite(fil);

  return (
    <div className="app">
      {/* Retire un service worker hérité d'une version qui prenait tout le
          site : sans cela, le cockpit continue de servir des fichiers
          disparus après chaque déploiement. */}
      <NettoyageServiceWorker />
      <Rail nbAlertes={compteur.urgent} resume={resume} role={session.user.role} marque={marque} />
      <div className="zone">{children}</div>
    </div>
  );
}
