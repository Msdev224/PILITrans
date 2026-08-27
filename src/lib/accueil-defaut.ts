/**
 * Libellés d'origine de l'écran de connexion.
 *
 * Constantes pures, sans accès base : le formulaire des Paramètres est un
 * composant client et les affiche en indication de saisie. Les garder dans le
 * module serveur (`src/lib/donnees/accueil.ts`) y ferait entrer `server-only`,
 * ce qui casse la compilation.
 */
import { ACCROCHE_APPLICATION, NOM_APPLICATION } from "@/lib/marque";

export const ACCUEIL_DEFAUT = {
  surtitre: `${NOM_APPLICATION} · ${ACCROCHE_APPLICATION}`,
  titre: "Pilote ta flotte au degré près.",
  texte:
    "Camions, chauffeurs, voyages, carburant réel, chaîne du froid, clients et facturation — de Conakry à Dakar, en un seul poste de commandement.",
  mention: "Guinée ⇄ Sénégal · transport frigorifique",
  sousTitre: "Gérant : accès complet. Chauffeur : depuis le téléphone de bord.",
} as const;
