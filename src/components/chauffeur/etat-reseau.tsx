"use client";

import { useEffect, useState } from "react";

/**
 * Bandeau d'état réseau. Hors ligne, les formulaires de saisie sont désactivés :
 * une dépense qui semble enregistrée alors qu'elle n'est jamais partie ferait
 * un trou dans la caisse.
 */
export function EtatReseau() {
  const [enLigne, setEnLigne] = useState(true);

  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);

  if (enLigne) return null;

  return (
    <div className="ph-offline">
      <span className="point" />
      Hors ligne — les écrans restent consultables, la saisie reprendra au réseau.
    </div>
  );
}
