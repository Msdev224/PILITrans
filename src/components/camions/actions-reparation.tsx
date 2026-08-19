"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { cloreReparation, supprimerReparation } from "@/actions/reparations";
import {
  DialogueReparation,
  type OptionCamionReparation,
  type ReparationEditable,
} from "@/components/camions/dialogue-reparation";
import { IconeCorbeille, IconeCrayon, IconeValider } from "@/components/icones";

export function ActionsReparation({
  camionId,
  refrigere,
  camions,
  tauxReferenceXof,
  reparation,
}: {
  /** Camion imposé sur une fiche camion ; liste sur l'écran transversal. */
  camionId?: string;
  refrigere?: boolean;
  camions?: OptionCamionReparation[];
  tauxReferenceXof: number | null;
  reparation: ReparationEditable;
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      {reparation.statut !== "TERMINEE" ? (
        <form action={cloreReparation.bind(null, reparation.id)}>
          <Bouton titre="Marquer terminée">
            <IconeValider />
          </Bouton>
        </form>
      ) : null}

      <DialogueReparation
        camionId={camionId}
        refrigere={refrigere}
        camions={camions}
        tauxReferenceXof={tauxReferenceXof}
        reparation={reparation}
        declencheur={
          <button type="button" title="Modifier la réparation">
            <IconeCrayon />
          </button>
        }
      />

      <form action={supprimerReparation.bind(null, reparation.id)}>
        <Bouton
          titre="Supprimer la réparation"
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
