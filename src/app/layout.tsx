import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";

import "./globals.css";
import { ACCROCHE_APPLICATION, NOM_APPLICATION } from "@/lib/marque";
import { marqueEntreprise } from "@/lib/donnees/accueil";

const titre = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--police-titre",
  display: "swap",
});

const corps = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--police-corps",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--police-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0C242D",
  width: "device-width",
  initialScale: 1,
  // La saisie en cabine se fait au pouce : on laisse le zoom accessible.
  maximumScale: 5,
  /*
   * Le contenu occupe l'écran entier, encoche comprise.
   *
   * Sans cela, `env(safe-area-inset-*)` vaut zéro et l'application installée
   * affiche deux bandes noires en haut et en bas — le signe le plus visible
   * qu'on regarde une page web déguisée plutôt qu'une application.
   */
  viewportFit: "cover",
};

/**
 * Le nom de l'exploitation vient des Paramètres, pas du code.
 *
 * `template` évite de le répéter sur chaque écran : une page ne déclare que
 * son propre titre (« Voyages »), le nom est ajouté ici. Si la base est
 * injoignable — build, première installation — on retombe sur la constante
 * plutôt que de faire échouer le rendu pour un libellé.
 */
export async function generateMetadata(): Promise<Metadata> {
  let nom = NOM_APPLICATION;
  let accroche = ACCROCHE_APPLICATION;
  try {
    const marque = await marqueEntreprise();
    nom = marque.raisonSociale;
    accroche = marque.accroche;
  } catch {
    // Repli silencieux : un titre par défaut vaut mieux qu'une page en erreur.
  }

  return {
    ...metadataBase,
    title: { default: `${nom} — ${accroche}`, template: `%s — ${nom}` },
    appleWebApp: { capable: true, title: nom, statusBarStyle: "black-translucent" },
  };
}

const metadataBase: Metadata = {
  manifest: "/manifest.webmanifest",
  /*
   * Les icônes ne sont plus déclarées ici.
   *
   * `src/app/icon.tsx` et `src/app/apple-icon.tsx` les produisent à partir du
   * logo de l'entreprise, et Next les câble tout seul. Les déclarer aussi ici
   * ferait gagner celles-ci et le logo ne s'afficherait jamais.
   */
  description:
    "Gestion de flotte pour le transport frigorifique transfrontalier Guinée ⇄ Sénégal : voyages, carburant, chaîne du froid, rentabilité par camion.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${titre.variable} ${corps.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
