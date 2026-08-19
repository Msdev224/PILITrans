"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { changerMonMotDePasse, type EtatMotDePasse } from "@/actions/mon-compte";

/**
 * Changement de son propre mot de passe.
 *
 * Les champs sont vidés après un succès : laisser un mot de passe affiché dans
 * un formulaire, sur un téléphone de bord qui passe de main en main, n'a pas
 * de sens.
 */
export function MonMotDePasse({ compact = false }: { compact?: boolean }) {
  const [etat, envoyer] = useActionState<EtatMotDePasse, FormData>(changerMonMotDePasse, {});
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat.ok) formulaire.current?.reset();
  }, [etat.ok]);

  const err = (champ: string) => etat.champs?.[champ];
  const classe = compact ? "ph-champ" : "field";

  return (
    <form ref={formulaire} action={envoyer} className={compact ? undefined : "form-grid"}>
      {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

      <div className={compact ? undefined : "full"}>
        <div className={classe}>
          <label htmlFor="actuel">Mot de passe actuel</label>
          <input id="actuel" name="actuel" type="password" autoComplete="current-password" required />
        </div>
        {err("actuel") ? <p className="ph-erreur">{err("actuel")}</p> : null}
      </div>

      <div className={compact ? undefined : "full"}>
        <div className={classe}>
          <label htmlFor="nouveau">Nouveau mot de passe</label>
          <input
            id="nouveau"
            name="nouveau"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {err("nouveau") ? <p className="ph-erreur">{err("nouveau")}</p> : null}
      </div>

      <div className={compact ? undefined : "full"}>
        <div className={classe}>
          <label htmlFor="confirmation">Confirmer</label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        {err("confirmation") ? <p className="ph-erreur">{err("confirmation")}</p> : null}
      </div>

      {etat.ok ? <p className="ph-ok">Mot de passe modifié.</p> : null}

      <div className={compact ? undefined : "full"}>
        <Bouton compact={compact} />
      </div>
    </form>
  );
}

function Bouton({ compact }: { compact: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={compact ? "ph-bouton" : "btn primary"} disabled={pending}>
      {pending ? "Enregistrement…" : "Changer le mot de passe"}
    </button>
  );
}
