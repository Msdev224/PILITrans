import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Marque MS Trans (docs/maquette.html) ---
        ink: "#0F1F28", "muted-2": "#8A99A0",
        line: "#E3E9EB", "line-soft": "#EEF2F3",
        marque: "#0FA3B1", "accent-2": "#67C4CD", "accent-ink": "#097782", "accent-bg": "#E6F5F6",
        pos: "#177544", neg: "#B23A34", warn: "#D99A00",
        rail: "#0C242D", "rail-2": "#0A1E26", fond: "#EEF2F3", surface: "#FFFFFF",
        intl: "#3B6EA5", vide: "#5E4B7A", gold: "#B8863B",
        "pos-bg": "#E6F5EC", "neg-bg": "#FBE9E8", "warn-bg": "#FCF2DD",
        "intl-bg": "#E9F0F8", "vide-bg": "#EEEAF3",

        // --- Jetons sémantiques attendus par shadcn/ui ---
        // Câblés sur les variables de la maquette : les composants shadcn
        // héritent donc du design MS Trans sans thème parallèle à maintenir.
        background: "var(--surface)",
        foreground: "var(--ink)",
        border: "var(--line)",
        input: "var(--line)",
        ring: "var(--accent)",
        primary: { DEFAULT: "var(--accent)", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "var(--line-soft)", foreground: "var(--ink)" },
        // « muted » et « accent » ont chez shadcn un sens de fond discret,
        // pas de couleur de texte : d'où le gris clair et le turquoise pâle.
        muted: { DEFAULT: "var(--line-soft)", foreground: "var(--muted)" },
        accent: { DEFAULT: "var(--accent-bg)", foreground: "var(--accent-ink)" },
        destructive: { DEFAULT: "var(--neg)", foreground: "#FFFFFF" },
        popover: { DEFAULT: "var(--surface)", foreground: "var(--ink)" },
        card: { DEFAULT: "var(--surface)", foreground: "var(--ink)" }
      },
      fontFamily: {
        head: ["var(--police-titre)", "'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["var(--police-corps)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--police-mono)", "'IBM Plex Mono'", "monospace"]
      },
      borderRadius: { card: "16px", ctl: "10px" },
      boxShadow: {
        card: "0 1px 2px rgba(15,31,40,.05), 0 10px 30px -18px rgba(15,31,40,.22)",
        modal: "0 24px 60px -24px rgba(15,31,40,.45)"
      }
    }
  },
  plugins: [animate]
};
export default config;
