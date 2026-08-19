"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { supprimerReclamation } from "@/actions/reclamations";
import { IconeCorbeille, IconeCrayon } from "@/components/icones";
import {
  DialogueReclamation,
  type OptionVoyageReclamation,
  type ReclamationEditable,
} from "@/components/reclamations/dialogue-reclamation";

export function ActionsReclamation({
  reclamation,
  clients,
  voyages,
  factures,
}: {
  reclamation: ReclamationEditable;
  clients: { id: string; nom: string }[];
  voyages: OptionVoyageReclamation[];
  factures: { id: string; libelle: string }[];
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      <DialogueReclamation
        clients={clients}
        voyages={voyages}
        factures={factures}
        reclamation={reclamation}
        declencheur={
          <button type="button" title="Traiter la réclamation">
            <IconeCrayon />
          </button>
        }
      />

      {/* Mutation via <form> : voir actions-voyage.tsx. */}
      <form action={supprimerReclamation.bind(null, reclamation.id)}>
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
      title="Supprimer la réclamation"
      disabled={pending}
      onClick={confirmation ? undefined : demanderConfirmation}
    >
      {confirmation ? <span className="text-[10px] font-bold">OK ?</span> : <IconeCorbeille />}
    </button>
  );
}
