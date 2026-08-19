/**
 * Limitation des tentatives de connexion.
 *
 * Compteur en mémoire, par identifiant : suffisant pour une instance unique,
 * ce qui est le cas ici. Deux limites connues, à lever le jour où l'application
 * tournera sur plusieurs instances ou derrière un redémarrage fréquent :
 * le compteur repart à zéro au redémarrage, et n'est pas partagé entre process.
 */

const FENETRE_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ECHECS = 5;

interface Compteur {
  echecs: number;
  /** Fin de la fenêtre courante. */
  expire: number;
}

const compteurs = new Map<string, Compteur>();

/** Purge les fenêtres expirées — évite que la table grossisse indéfiniment. */
function nettoyer(maintenant: number) {
  for (const [cle, c] of compteurs) {
    if (c.expire <= maintenant) compteurs.delete(cle);
  }
}

export interface EtatLimitation {
  bloque: boolean;
  /** Minutes restantes avant déblocage. */
  minutesRestantes: number;
  essaisRestants: number;
}

/** Consulte l'état sans rien incrémenter. */
export function verifierLimitation(cle: string): EtatLimitation {
  const maintenant = Date.now();
  nettoyer(maintenant);

  const c = compteurs.get(cle);
  if (!c || c.expire <= maintenant) {
    return { bloque: false, minutesRestantes: 0, essaisRestants: MAX_ECHECS };
  }

  return {
    bloque: c.echecs >= MAX_ECHECS,
    minutesRestantes: Math.max(1, Math.ceil((c.expire - maintenant) / 60_000)),
    essaisRestants: Math.max(0, MAX_ECHECS - c.echecs),
  };
}

/** Enregistre un échec et renvoie l'état qui en résulte. */
export function enregistrerEchec(cle: string): EtatLimitation {
  const maintenant = Date.now();
  nettoyer(maintenant);

  const c = compteurs.get(cle);
  // Chaque échec repousse la fenêtre : un attaquant qui insiste reste bloqué.
  const suivant: Compteur =
    c && c.expire > maintenant
      ? { echecs: c.echecs + 1, expire: maintenant + FENETRE_MS }
      : { echecs: 1, expire: maintenant + FENETRE_MS };

  compteurs.set(cle, suivant);
  return verifierLimitation(cle);
}

/** Remet le compteur à zéro après une connexion réussie. */
export function reinitialiserLimitation(cle: string) {
  compteurs.delete(cle);
}
