"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { seConnecter, type EtatConnexion } from "@/actions/auth";
import { ChampTelephone } from "@/components/champ-telephone";

function BoutonValider() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary full" disabled={pending}>
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

export function FormulaireConnexion() {
  const [etat, action] = useActionState<EtatConnexion, FormData>(seConnecter, {});

  return (
    <form action={action}>
      {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

      {/* Le numéro est l'identifiant de connexion : il doit être saisi sous
          la même forme qu'il a été enregistré. Laisser l'indicatif à la frappe
          libre produit des « 620… » qui ne correspondent à aucun compte. */}
      <div className="field">
        <label htmlFor="telephone">Numéro de téléphone</label>
        <ChampTelephone id="telephone" nom="telephone" requis autoComplete="username" />
      </div>

      <div className="field">
        <label htmlFor="motDePasse">Mot de passe</label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <BoutonValider />
    </form>
  );
}
