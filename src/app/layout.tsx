import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";

import "./globals.css";

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
};

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PILITrans", statusBarStyle: "black-translucent" },
  title: "PILITrans — Cockpit flotte frigo",
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
