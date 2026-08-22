"use client";

import { useEffect, useState } from "react";

import { useFile } from "@/components/chauffeur/file-attente";

/**
 * Bandeau d'état réseau et file des saisies en attente.
 *
 * Hors réseau, la saisie continue : elle est gardée sur le téléphone et
 * repartira seule. Le chauffeur doit voir ce qui attend, sinon il ressaisit
 * une dépense déjà prise — ou pire, il croit qu'elle est perdue et n'en
 * parle jamais.
 */
export function EtatReseau() {
  const { enAttente, refusees, enCours, synchroniser, oublierRefus } = useFile();
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

  const n = enAttente.length;

  return (
    <>
      {!enLigne ? (
        <div className="ph-offline">
          <span className="point" />
          Hors ligne — tu peux continuer à saisir, tout part au retour du réseau.
        </div>
      ) : null}

      {n > 0 ? (
        <div className="ph-file">
          <div className="ph-file-tete">
            <b>
              {n} saisie{n > 1 ? "s" : ""} en attente
            </b>
            {enLigne ? (
              <button type="button" className="ph-file-btn" onClick={() => void synchroniser()} disabled={enCours}>
                {enCours ? "Envoi…" : "Envoyer"}
              </button>
            ) : null}
          </div>

          <ul className="ph-file-liste">
            {enAttente.map((operation) => (
              <li key={operation.id}>
                <span>{operation.libelle}</span>
                <span className="ph-file-heure">
                  {new Date(operation.saisieLe).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>

          <p className="ph-aide">
            Gardées sur le téléphone. Ne ferme pas l&apos;application tant qu&apos;elles n&apos;ont
            pas été envoyées.
          </p>
        </div>
      ) : null}

      {/* Une saisie refusée par le serveur ne peut pas disparaître en silence :
          elle n'a jamais été enregistrée et devra être refaite. */}
      {refusees.map((refus, i) => (
        <div className="ph-refus" key={`${refus.libelle}-${i}`}>
          <b>{refus.libelle} — non enregistrée</b>
          <p>{refus.erreur}</p>
          <button type="button" className="ph-file-btn" onClick={() => oublierRefus(i)}>
            J&apos;ai compris
          </button>
        </div>
      ))}
    </>
  );
}
