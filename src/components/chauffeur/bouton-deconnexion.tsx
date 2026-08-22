"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

import { seDeconnecter } from "@/actions/auth";
import { useFile } from "@/components/chauffeur/file-attente";
import { lister as listerEnAttente } from "@/lib/chauffeur/file-attente";
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
  const { enAttente, synchroniser } = useFile();
  // Marque le second passage : sans lui, le renvoi du formulaire repasserait
  // par la garde et tournerait en boucle.
  const forcer = useRef(false);

  async function viderPuisPartir(evenement: React.FormEvent<HTMLFormElement>) {
    /*
     * Partir avec des saisies non envoyées les perdrait.
     *
     * Elles resteraient sur l'appareil, mais seraient rejouées sous la
     * session du chauffeur suivant, qui n'a pas ces missions : le serveur les
     * refuserait toutes. Une dépense de route disparaîtrait sans que
     * personne ne le sache.
     */
    if (forcer.current || enAttente.length === 0) {
      await viderCache();
      return;
    }

    // Le formulaire se capture tout de suite : après un `await`, l'événement
    // est recyclé par React et `currentTarget` ne vaut plus rien.
    const formulaire = evenement.currentTarget;
    evenement.preventDefault();

    await synchroniser();
    const reste = (await listerEnAttente()).length;

    if (reste > 0) {
      const pluriel = reste > 1;
      const partir = window.confirm(
        `${reste} saisie${pluriel ? "s" : ""} n'${pluriel ? "ont" : "a"} pas encore été envoyée${pluriel ? "s" : ""}.\n\n` +
          "En te déconnectant maintenant, elles seront perdues. Attends le réseau si tu peux.\n\n" +
          "Se déconnecter quand même ?",
      );
      if (!partir) return;
    }

    await viderCache();
    forcer.current = true;
    formulaire.requestSubmit();
  }

  return (
    <form action={seDeconnecter} onSubmit={viderPuisPartir} className="mt-4">
      <Bouton />
    </form>
  );
}

async function viderCache() {
  if (!("serviceWorker" in navigator)) return;
  const enregistrement = await navigator.serviceWorker.getRegistration();
  enregistrement?.active?.postMessage("vider-cache");
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
