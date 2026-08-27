import type { MetadataRoute } from "next";

import { marqueEntreprise } from "@/lib/donnees/accueil";
import { NOM_APPLICATION } from "@/lib/marque";

/**
 * Manifeste de l'espace chauffeur, servi sur `/manifest.webmanifest`.
 *
 * Il était statique dans `public/`, donc figé au nom écrit dans le dépôt. Or
 * c'est ce nom qui s'inscrit sous l'icône, sur l'écran d'accueil du téléphone
 * de bord : il doit suivre les Paramètres comme le reste.
 *
 * Le repli couvre le build et la première installation, où la base peut ne
 * rien renvoyer — un manifeste absent empêcherait purement l'installation.
 */
/*
 * Rafraîchi toutes les heures, comme `icon.tsx`.
 *
 * Sans cela Next fige le manifeste au build : renommer l'exploitation dans les
 * Paramètres n'aurait plus aucun effet jusqu'au prochain déploiement. Une
 * heure suffit — c'est un libellé, pas une donnée d'exploitation — et cela
 * évite une requête par chargement.
 */
export const revalidate = 3600;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let nom = NOM_APPLICATION;
  try {
    nom = (await marqueEntreprise()).raisonSociale;
  } catch {
    // Repli silencieux : mieux vaut un nom générique qu'aucun manifeste.
  }

  return {
    name: `${nom} — Espace chauffeur`,
    short_name: nom,
    description:
      "Saisie de mission depuis le téléphone de bord : départ, arrêts, carburant, chargement et livraison.",
    start_url: "/chauffeur",
    id: "/chauffeur",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0C242D",
    theme_color: "#0C242D",
    lang: "fr",
    dir: "ltr",
    categories: ["business", "productivity"],
    /*
     * Les icônes sont produites à la demande depuis le logo des Paramètres
     * (`src/app/icone-192.png/route.ts`). `icone.svg` a été retiré de la
     * liste : c'est la marque d'origine, figée, et un SVG « any » l'emporte
     * sur un PNG dimensionné chez certains systèmes — le camion générique
     * s'afficherait à la place du logo.
     */
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Ma mission",
        short_name: "Mission",
        description: "Ouvrir directement la mission en cours",
        url: "/chauffeur",
        icons: [{ src: "/icone-192.png", sizes: "192x192" }],
      },
    ],
  };
}
