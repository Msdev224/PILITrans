"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { retirerChauffeur } from "@/actions/chauffeurs";
import { DialogueChauffeur, type ChauffeurEditable } from "@/components/equipe/dialogue-chauffeur";
import { IconeCorbeille, IconeCrayon } from "@/components/icones";

export function ActionsChauffeur({
  chauffeur,
  aRoule,
}: {
  chauffeur: ChauffeurEditable;
  aRoule: boolean;
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      <DialogueChauffeur
        chauffeur={chauffeur}
        declencheur={
          <button type="button" title="Modifier le chauffeur">
            <IconeCrayon />
          </button>
        }
      />

      {/* Mutation via <form> : voir actions-voyage.tsx. */}
      <form action={retirerChauffeur.bind(null, chauffeur.id)}>
        <BoutonRetrait
          titre={aRoule ? "Désactiver (historique conservé)" : "Supprimer le chauffeur"}
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
