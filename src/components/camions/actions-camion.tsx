"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { retirerCamion } from "@/actions/camions";
import { IconeCorbeille, IconeCrayon } from "@/components/icones";
import { DialogueCamion, type CamionEditable } from "@/components/camions/dialogue-camion";

export function ActionsCamion({
  camion,
  aRoule,
}: {
  camion: CamionEditable;
  /** `true` si le camion porte des voyages, dépenses ou réparations. */
  aRoule: boolean;
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      <DialogueCamion
        camion={camion}
        declencheur={
          <button type="button" title="Modifier le camion">
            <IconeCrayon />
          </button>
        }
      />

      {/* Mutation via <form> : voir actions-voyage.tsx. */}
      <form action={retirerCamion.bind(null, camion.id)}>
        <BoutonRetrait
          titre={aRoule ? "Sortir du parc (historique conservé)" : "Supprimer le camion"}
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

function BoutonRetrait({
  titre,
  confirmation,
  demanderConfirmation,
}: {
  titre: string;
  confirmation: boolean;
  demanderConfirmation: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type={confirmation ? "submit" : "button"}
      className="del"
      title={titre}
      disabled={pending}
      onClick={confirmation ? undefined : demanderConfirmation}
    >
      {confirmation ? <span className="text-[10px] font-bold">OK ?</span> : <IconeCorbeille />}
    </button>
  );
}
