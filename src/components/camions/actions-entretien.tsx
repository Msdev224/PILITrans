"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { supprimerEntretien } from "@/actions/entretiens";
import {
  DialogueEntretien,
  type EntretienEditable,
} from "@/components/camions/dialogue-entretien";
import { IconeCorbeille, IconeCrayon } from "@/components/icones";

export function ActionsEntretien({
  entretien,
  refrigere,
  kilometrage,
  heuresGroupeFroid,
  tauxReferenceXof,
}: {
  entretien: EntretienEditable;
  refrigere: boolean;
  kilometrage: number;
  heuresGroupeFroid: number;
  tauxReferenceXof: number | null;
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      <DialogueEntretien
        camionId={entretien.camionId}
        refrigere={refrigere}
        kilometrage={kilometrage}
        heuresGroupeFroid={heuresGroupeFroid}
        tauxReferenceXof={tauxReferenceXof}
        entretien={entretien}
        declencheur={
          <button type="button" title="Modifier l'entretien">
            <IconeCrayon />
          </button>
        }
      />

      {/* Mutation via <form> : voir actions-voyage.tsx. */}
      <form action={supprimerEntretien.bind(null, entretien.id)}>
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
      title="Supprimer l'entretien"
      disabled={pending}
      onClick={confirmation ? undefined : demanderConfirmation}
    >
      {confirmation ? <span className="text-[10px] font-bold">OK ?</span> : <IconeCorbeille />}
    </button>
  );
}
