"use client";

import { useEffect } from "react";

/** Enregistre le service worker qui rend l'espace chauffeur utilisable hors ligne. */
export function EnregistrementServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Un échec d'enregistrement ne doit pas casser la saisie : on continue en ligne.
    });
  }, []);

  return null;
}
