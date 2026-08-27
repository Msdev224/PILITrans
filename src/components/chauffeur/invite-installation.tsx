"use client";

import { useEffect, useState } from "react";

/**
 * Invite à installer l'application sur l'écran d'accueil.
 *
 * Sans elle, personne n'installe : la fonction existe dans tous les
 * navigateurs mobiles, mais elle est cachée dans un menu que les chauffeurs
 * n'ouvrent jamais. Or installée, l'application démarre sur son écran, garde
 * sa session plus longtemps, et fonctionne hors ligne sans dépendre d'un
 * onglet resté ouvert.
 *
 * Deux chemins, parce que les deux mondes ne se comportent pas pareil :
 * Android propose une vraie invite système, iOS n'en a aucune et exige un
 * geste manuel qu'il faut donc décrire.
 */

interface EvenementInstallation extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Identifiant technique, conservé : le renommer réafficherait l'invite à
// tous ceux qui l'ont déjà écartée.
const CLE_REFUS = "pilitrans-installation-refusee";

export function InviteInstallation({ nom }: { nom: string }) {
  const [invite, setInvite] = useState<EvenementInstallation | null>(null);
  const [surIos, setSurIos] = useState(false);
  const [masquee, setMasquee] = useState(true);

  useEffect(() => {
    // Déjà installée : l'application tourne dans sa propre fenêtre.
    const installee =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

    // Un refus se respecte : le redemander à chaque ouverture est du harcèlement.
    const refusee = localStorage.getItem(CLE_REFUS) === "1";
    if (installee || refusee) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setSurIos(ios);
    // Sur iOS il n'y a pas d'événement : on affiche la marche à suivre.
    if (ios) setMasquee(false);

    const capter = (e: Event) => {
      // Empêcher l'invite native pour la présenter au bon moment, en français.
      e.preventDefault();
      setInvite(e as EvenementInstallation);

      /*
       * Le refus se revérifie ici, pas seulement au montage.
       *
       * Le navigateur peut redéclencher l'événement plusieurs fois dans la
       * même session : sans ce contrôle, l'invite réapparaissait juste après
       * un « Plus tard ».
       */
      if (localStorage.getItem(CLE_REFUS) !== "1") setMasquee(false);
    };

    window.addEventListener("beforeinstallprompt", capter);
    return () => window.removeEventListener("beforeinstallprompt", capter);
  }, []);

  if (masquee) return null;

  const refuser = () => {
    localStorage.setItem(CLE_REFUS, "1");
    setMasquee(true);
  };

  const installer = async () => {
    if (!invite) return;
    await invite.prompt();
    const { outcome } = await invite.userChoice;
    if (outcome === "dismissed") localStorage.setItem(CLE_REFUS, "1");
    setMasquee(true);
  };

  return (
    <div className="ph-install">
      <div className="ph-install-texte">
        <b>Installer {nom}</b>
        <p>
          {surIos
            ? "Appuie sur Partager, puis « Sur l'écran d'accueil ». L'application s'ouvrira seule, même sans réseau."
            : "Elle s'ouvrira depuis ton écran d'accueil, et continuera de fonctionner sans réseau."}
        </p>
      </div>
      <div className="ph-install-btns">
        <button type="button" className="ph-btn ghost" onClick={refuser}>
          Plus tard
        </button>
        {!surIos ? (
          <button type="button" className="ph-btn" onClick={installer}>
            Installer
          </button>
        ) : null}
      </div>
    </div>
  );
}
