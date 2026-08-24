"use client";

import { useEffect } from "react";

import { nettoyerPorteeRacine } from "@/components/chauffeur/enregistrement-sw";

/**
 * Répare les navigateurs qui portent encore un service worker à la racine.
 *
 * Une version antérieure enregistrait le worker de l'espace chauffeur sans
 * préciser sa portée : il prenait donc tout le site et servait, après chaque
 * déploiement, des pages du cockpit référençant des fichiers JavaScript
 * disparus — écran blanc, « client-side exception ».
 *
 * Corriger la portée ne suffit pas : l'ancien enregistrement survit dans les
 * navigateurs qui l'ont reçu. Ce composant va le retirer, vide les caches, et
 * recharge une fois pour repartir sur des fichiers valides.
 *
 * Il s'efface de lui-même : une fois le nettoyage fait, il ne fait plus rien.
 */
export function NettoyageServiceWorker() {
  useEffect(() => {
    void (async () => {
      try {
        const nettoye = await nettoyerPorteeRacine();
        // Le rechargement est indispensable : la page courante tourne encore
        // sur les fichiers servis par le worker qu'on vient de retirer.
        if (nettoye) window.location.reload();
      } catch {
        // Sans service worker, ou navigation privée : rien à nettoyer.
      }
    })();
  }, []);

  return null;
}
