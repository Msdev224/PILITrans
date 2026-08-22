"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { supprimerEtape } from "@/actions/etapes";
import { IconeCorbeille, IconeCrayon } from "@/components/icones";
import {
  DialogueEtape,
  type EtapeEditable,
  type RavitaillementOption,
} from "@/components/voyages/dialogue-etape";

export function ActionsEtape({
  voyageId,
  pays,
  etape,
  ravitaillements,
}: {
  voyageId: string;
  /** Pays proposés, tenus par l'exploitation. */
  pays: { id: string; nom: string }[];
  etape: EtapeEditable;
  ravitaillements: RavitaillementOption[];
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      <DialogueEtape
        voyageId={voyageId}
        pays={pays}
        etape={etape}
        ravitaillements={ravitaillements}
        declencheur={
          <button type="button" title="Modifier l'étape">
            <IconeCrayon />
          </button>
        }
      />

      {/* Voir actions-voyage.tsx : mutation via <form>, jamais startTransition. */}
      <form action={supprimerEtape.bind(null, etape.id)}>
        <BoutonSuppression
          confirmation={confirmation}
          demanderConfirmation={() => {
            setConfirmation(true);
            setTimeout(() => setConfirmation(false), 4000);
          }}
        />
      </form>
    </div>
  );
}

function BoutonSuppression({
  confirmation,
  demanderConfirmation,
}: {
  confirmation: boolean;
  demanderConfirmation: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type={confirmation ? "submit" : "button"}
      className="del"
      title="Supprimer l'étape"
      disabled={pending}
      onClick={confirmation ? undefined : demanderConfirmation}
    >
      {confirmation ? <span className="text-[10px] font-bold">OK ?</span> : <IconeCorbeille />}
    </button>
  );
}
