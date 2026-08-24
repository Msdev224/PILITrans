"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker de l'espace chauffeur — et lui seul.
 *
 * La portée est explicitement limitée à `/chauffeur/`. Sans elle, un script
 * servi depuis `/sw.js` prend par défaut la racine du site : il se met alors
 * à mettre en cache TOUTES les pages, y compris le cockpit. Au déploiement
 * suivant, les noms des fichiers JavaScript changent, le worker continue de
 * servir l'ancienne page depuis son cache, et le navigateur réclame des
 * fichiers qui n'existent plus — « Application error: a client-side exception
 * has occurred », écran blanc, sur des écrans qui n'ont rien à faire hors
 * ligne.
 */
export function EnregistrementServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        await nettoyerPorteeRacine();
        await navigator.serviceWorker.register("/sw.js", { scope: "/chauffeur/" });
      } catch {
        // Un échec d'enregistrement ne doit pas casser la saisie : on
        // continue en ligne, sans hors-ligne.
      }
    })();
  }, []);

  return null;
}

/**
 * Retire un worker déjà enregistré à la racine, et son cache.
 *
 * Changer la portée ne désinscrit pas l'ancien enregistrement : un navigateur
 * qui a connu la version précédente resterait cassé indéfiniment. Il faut
 * donc aller le chercher.
 */
export async function nettoyerPorteeRacine(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;

  const enregistrements = await navigator.serviceWorker.getRegistrations();
  let nettoye = false;

  for (const e of enregistrements) {
    // Tout ce qui déborde de l'espace chauffeur est retiré.
    if (!e.scope.endsWith("/chauffeur/")) {
      await e.unregister();
      nettoye = true;
    }
  }

  if (nettoye && window.caches) {
    for (const cle of await caches.keys()) await caches.delete(cle);
  }
  return nettoye;
}
