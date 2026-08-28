import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Deux environnements dans un seul lancement :
 *  - `node` pour le cœur métier et les couches de données, qui n'ont pas de DOM ;
 *  - `jsdom` pour les composants, qui en ont besoin.
 *
 * Les séparer évite de payer le coût d'un DOM sur les tests de calcul, qui
 * sont les plus nombreux et doivent rester instantanés.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  // `tsconfig.json` laisse le JSX à Next (`"jsx": "preserve"`). Vitest doit
  // donc être explicite, sinon les tests de composants échouent sur un
  // « React is not defined » venant de l'ancienne transformation.
  //
  // Cette seule ligne remplace `@vitejs/plugin-react` : le plugin n'apporte
  // que le Fast Refresh, inutile en test, et impose sa propre version de Vite.
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    projects: [
      {
        // Cœur métier, couches de données, Server Actions : pas de DOM,
        // donc pas de coût de jsdom sur les tests les plus nombreux.
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/{unite,donnees,integration,actions}/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "composants",
          environment: "jsdom",
          include: ["tests/composants/**/*.test.{ts,tsx}"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/actions/**/*.ts"],
      exclude: ["src/lib/prisma.ts", "**/*.d.ts"],
    },
  },
});
