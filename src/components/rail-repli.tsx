"use client";

import { useState } from "react";

/**
 * Replie ou déploie le rail, à la demande.
 *
 * Le choix est écrit dans un cookie et non dans `localStorage` : le serveur le
 * lit au rendu, si bien que le rail arrive déjà dans le bon état. Avec
 * `localStorage`, il s'afficherait large puis sauterait en icônes à chaque
 * chargement de page — le clignotement classique.
 *
 * La classe est posée tout de suite sur le DOM : la bascule est instantanée,
 * sans aller-retour serveur. Le cookie ne sert qu'aux chargements suivants.
 */
export function RailRepli({ replieInitial }: { replieInitial: boolean }) {
  const [replie, setReplie] = useState(replieInitial);

  const basculer = () => {
    const suivant = !replie;
    setReplie(suivant);
    document.querySelector(".app")?.classList.toggle("replie", suivant);
    // Un an : c'est une préférence d'affichage, elle n'a pas à être redemandée.
    document.cookie = `rail=${suivant ? "replie" : "deploye"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <button
      type="button"
      className="rail-repli"
      onClick={basculer}
      aria-pressed={replie}
      title={replie ? "Déployer le menu" : "Replier le menu"}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          d={replie ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="nav-libelle">Replier le menu</span>
    </button>
  );
}
