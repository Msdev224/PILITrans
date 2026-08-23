"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { renouvelerEcheance, supprimerEcheance } from "@/actions/echeances";
import {
  DialogueEcheance,
  type EcheanceEditable,
} from "@/components/flotte/dialogue-echeance";
import { BoutonConfirme } from "@/components/bouton-confirme";
import { IconeCorbeille, IconeCrayon, IconeValider } from "@/components/icones";

export function ActionsEcheance({
  echeance,
  camions,
  rappelDefaut,
}: {
  echeance: EcheanceEditable;
  camions: { id: string; nom: string }[];
  rappelDefaut: number;
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      {/* Renouveler décale d'un an, à partir d'aujourd'hui si le document est expiré. */}
      <BoutonConfirme
        action={renouvelerEcheance.bind(null, echeance.id)}
        titre="Renouveler ce document pour un an ?"
        detail="La date d'expiration est repoussée d'un an — à partir d'aujourd'hui si le document est déjà expiré. À ne faire qu'une fois le renouvellement réellement obtenu."
        confirmer="Oui, renouveler"
        declencheur={
          <button type="button" title="Renouveler pour un an">
            <IconeValider />
          </button>
        }
      />

      <DialogueEcheance
        camions={camions}
        echeance={echeance}
        rappelDefaut={rappelDefaut}
        declencheur={
          <button type="button" title="Modifier l'échéance">
            <IconeCrayon />
          </button>
        }
      />

      <form action={supprimerEcheance.bind(null, echeance.id)}>
        <Bouton
          titre="Supprimer l'échéance"
          classe="del"
          type={confirmation ? "submit" : "button"}
          onClick={
            confirmation
              ? undefined
              : () => {
                  setConfirmation(true);
                  setTimeout(() => setConfirmation(false), 4000);
                }
          }
        >
          {confirmation ? <span className="text-[10px] font-bold">OK ?</span> : <IconeCorbeille />}
        </Bouton>
      </form>
    </div>
  );
}

function Bouton({
  titre,
  classe,
  type = "submit",
  onClick,
  children,
}: {
  titre: string;
  classe?: string;
  type?: "submit" | "button";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type={type} className={classe} title={titre} disabled={pending} onClick={onClick}>
      {children}
    </button>
  );
}
