"use client";

import { useFormStatus } from "react-dom";

import { seDeconnecter } from "@/actions/auth";
import { IconeDeconnexion } from "@/components/icones";

/**
 * Déconnexion de l'espace chauffeur.
 *
 * Le cache du service worker est vidé avant de partir : il contient les pages
 * du chauffeur qui se déconnecte — ses missions, ses dépenses. Sans ce
 * nettoyage, le chauffeur suivant les retrouverait hors ligne sur le même
 * téléphone de bord.
 */
export function BoutonDeconnexion() {
  async function viderPuisPartir() {
    if ("serviceWorker" in navigator) {
      const enregistrement = await navigator.serviceWorker.getRegistration();
      enregistrement?.active?.postMessage("vider-cache");
    }
  }

  return (
    <form action={seDeconnecter} onSubmit={viderPuisPartir} className="mt-4">
      <Bouton />
    </form>
  );
}

function Bouton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ph-deconnexion" disabled={pending}>
      <IconeDeconnexion width={15} height={15} />
      {pending ? "Déconnexion…" : "Déconnexion"}
    </button>
  );
}
