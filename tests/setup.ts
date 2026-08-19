import { afterEach, vi } from "vitest";

/**
 * Réglages communs à toute la suite.
 *
 * Fuseau et date sont figés : le métier compte des jours pleins (attente de
 * chargement, retard de facture, mois d'amortissement). Laisser l'horloge
 * réelle rendrait des tests verts le matin et rouges le soir, et rouges chez
 * un collègue dans un autre fuseau.
 */
process.env.TZ = "Africa/Conakry";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
