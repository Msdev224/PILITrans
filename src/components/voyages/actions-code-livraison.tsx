"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  envoyerCodeLivraison,
  reinitialiserCode,
  type EtatLivraison,
} from "@/actions/livraison";

/**
 * Envoi du code de retrait au client, depuis la fiche voyage.
 *
 * Le gérant ne voit pas le code lui-même : il ne circule qu'entre le client et
 * le chauffeur. Ce que le gérant pilote, c'est l'envoi — et le renvoi quand le
 * client dit ne rien avoir reçu.
 */
export function ActionsCodeLivraison({
  ligneId,
  designation,
  codeEnvoye,
  codeConfirme,
  codeEnvois,
  bloque,
}: {
  ligneId: string;
  designation: string;
  codeEnvoye: boolean;
  codeConfirme: boolean;
  codeEnvois: number;
  /** Trop de tentatives ratées : il faut repartir d'un code neuf. */
  bloque: boolean;
}) {
  const [etat, envoyer] = useActionState<EtatLivraison, FormData>(
    envoyerCodeLivraison.bind(null, ligneId),
    {},
  );

  if (codeConfirme) {
    return <span className="badge b-go">Confirmée par le client</span>;
  }

  return (
    <div className="code-actions">
      <form action={envoyer}>
        <Bouton libelle={codeEnvoye ? "Renvoyer le code" : "Envoyer le code"} />
      </form>

      {codeEnvoye ? (
        <span className="t-sub">
          {codeEnvois} envoi{codeEnvois > 1 ? "s" : ""}
        </span>
      ) : null}

      {/* Après trop d'essais ratés, seul un code neuf débloque la situation. */}
      {bloque ? (
        <form action={reinitialiserCode.bind(null, ligneId)}>
          <button type="submit" className="btn ghost sm" title={`Nouveau code pour ${designation}`}>
            Nouveau code
          </button>
        </form>
      ) : null}

      {etat.erreur ? <p className="text-[11.5px] text-[var(--neg)]">{etat.erreur}</p> : null}
      {etat.ok && etat.message ? (
        <p className="text-[11.5px] text-[var(--pos)]">{etat.message}</p>
      ) : null}
    </div>
  );
}

function Bouton({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn ghost sm" disabled={pending}>
      {pending ? "Envoi…" : libelle}
    </button>
  );
}
