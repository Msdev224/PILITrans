"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { supprimerClient } from "@/actions/clients";
import { DialogueClient, type ClientEditable } from "@/components/clients/dialogue-client";
import { IconeCorbeille, IconeCrayon } from "@/components/icones";

export function ActionsClient({
  client,
  aDesFactures,
}: {
  client: ClientEditable;
  aDesFactures: boolean;
}) {
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="acts">
      <DialogueClient
        client={client}
        declencheur={
          <button type="button" title="Modifier le client">
            <IconeCrayon />
          </button>
        }
      />

      {/* Mutation via <form> : voir actions-voyage.tsx. */}
      <form action={supprimerClient.bind(null, client.id)}>
        <BoutonSuppression
          // La base refuse de toute façon la suppression d'un client facturé.
          titre={
            aDesFactures
              ? "Client facturé — suppression impossible"
              : "Supprimer le client"
          }
          desactive={aDesFactures}
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
  titre,
  desactive,
  confirmation,
  demanderConfirmation,
}: {
  titre: string;
  desactive: boolean;
  confirmation: boolean;
  demanderConfirmation: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type={confirmation ? "submit" : "button"}
      className="del"
      title={titre}
      disabled={pending || desactive}
      onClick={confirmation ? undefined : demanderConfirmation}
    >
      {confirmation ? <span className="text-[10px] font-bold">OK ?</span> : <IconeCorbeille />}
    </button>
  );
}
