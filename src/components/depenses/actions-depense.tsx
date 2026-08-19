"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { supprimerDepense } from "@/actions/depenses";
import { IconeCorbeille, IconeCrayon } from "@/components/icones";
import {
  DialogueDepense,
  type DepenseEditable,
  type OptionCamionSimple,
  type OptionVoyage,
} from "@/components/depenses/dialogue-depense";

export function ActionsDepense({
  depense,
  voyages,
  camions,
  tauxReferenceXof,
}: {
  depense: DepenseEditable;
  voyages: OptionVoyage[];
  camions: OptionCamionSimple[];
  tauxReferenceXof: number | null;
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      <DialogueDepense
        chauffeurs={[]}
        voyages={voyages}
        camions={camions}
        tauxReferenceXof={tauxReferenceXof}
        depense={depense}
        declencheur={
          <button type="button" title="Modifier la dépense">
            <IconeCrayon />
          </button>
        }
      />

      {/* Mutation via <form> : voir actions-voyage.tsx. */}
      <form action={supprimerDepense.bind(null, depense.id)}>
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
      title="Supprimer la dépense"
      disabled={pending}
      onClick={confirmation ? undefined : demanderConfirmation}
    >
      {confirmation ? <span className="text-[10px] font-bold">OK ?</span> : <IconeCorbeille />}
    </button>
  );
}
