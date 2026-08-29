"use client";

import { useEffect } from "react";

/**
 * Page affichée quand une erreur serveur remonte jusqu'à l'écran.
 *
 * Sans elle, Next sert la sienne : « Application error: a server-side exception
 * has occurred », suivie d'un identifiant technique. En anglais, sans marque, et
 * sans rien indiquer à faire — c'est exactement ce qu'a montré la production le
 * 28 août, quand le code déployé cherchait des colonnes que la base n'avait pas
 * encore.
 *
 * Le `digest` est conservé et affiché : c'est la seule clé qui relie ce que voit
 * le gérant aux journaux du serveur. Le message d'erreur lui-même n'est pas
 * montré — il peut contenir un fragment de requête ou un nom de colonne, qui
 * n'apprend rien à qui n'écrit pas le code.
 */
export default function Erreur({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // La trace complète part dans la console du navigateur, où un développeur
    // la retrouvera ; l'écran, lui, reste lisible.
    console.error(error);
  }, [error]);

  return (
    <main className="err-page">
      <div className="err-carte">
        <div className="err-code">Erreur</div>
        <h1>Quelque chose s&apos;est mal passé</h1>
        <p>
          L&apos;écran n&apos;a pas pu être affiché. Réessayez : si le problème vient de passer,
          il ne se reproduira pas. S&apos;il persiste, notez la référence ci-dessous et
          transmettez-la — elle permet de retrouver la cause exacte dans les journaux.
        </p>
        {error.digest ? <div className="err-digest">Référence : {error.digest}</div> : null}
        <div className="err-actions">
          <button type="button" className="err-btn" onClick={reset}>
            Réessayer
          </button>
          {/*
            `<a>` et non `<Link>`, volontairement.

            On se trouve dans une frontière d'erreur : l'arbre React est dans un
            état dont on ne sait rien. Une navigation client repartirait de cet
            état et pourrait y retomber ; un chargement complet le remet à zéro.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="err-lien">
            Retour au tableau de bord
          </a>
        </div>
      </div>
    </main>
  );
}
