"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { changerStatutVoyage, supprimerVoyage } from "@/actions/voyages";
import { IconeCorbeille, IconeCrayon, IconeValider } from "@/components/icones";
import {
  DialogueVoyage,
  type OptionCamion,
  type OptionChauffeur,
  type OptionClientVoyage,
  type OptionUnite,
  type VoyageEditable,
} from "@/components/voyages/dialogue-voyage";

/** Progression normale d'une mission ; `null` = plus rien à avancer. */
const SUIVANT: Record<string, { statut: string; libelle: string } | null> = {
  PLANIFIE: { statut: "EN_ATTENTE_CHARGEMENT", libelle: "Marquer arrivé au chargement" },
  EN_ATTENTE_CHARGEMENT: { statut: "EN_COURS", libelle: "Marquer chargé et en route" },
  EN_COURS: { statut: "ARRIVE_DESTINATION", libelle: "Marquer arrivé à destination" },
  ARRIVE_DESTINATION: { statut: "EN_DECHARGEMENT", libelle: "Marquer en déchargement" },
  EN_DECHARGEMENT: { statut: "TERMINE", libelle: "Clôturer la mission" },
  TERMINE: null,
  ANNULE: null,
};

interface Props {
  voyage: VoyageEditable;
  camions: OptionCamion[];
  chauffeurs: OptionChauffeur[];
  unites: OptionUnite[];
  pays: { id: string; nom: string }[];
  clients: OptionClientVoyage[];
  tauxReferenceXof: number | null;
  /** `true` si le voyage porte déjà des frais, étapes ou factures. */
  aDesEcritures: boolean;
}

export function ActionsVoyage({
  voyage,
  camions,
  chauffeurs,
  unites,
  pays,
  clients,
  tauxReferenceXof,
  aDesEcritures,
}: Props) {
  const [confirmation, setConfirmation] = useState(false);
  const suivant = SUIVANT[voyage.statut];

  return (
    <div className="acts">
      {/* Les mutations passent par un <form> : une soumission = une exécution.
          Avec startTransition, le rafraîchissement déclenché par revalidatePath
          rejouait l'action et la mission sautait plusieurs états d'un coup. */}
      {suivant ? (
        <form action={changerStatutVoyage.bind(null, voyage.id, suivant.statut as never)}>
          <BoutonAction titre={suivant.libelle}>
            <IconeValider />
          </BoutonAction>
        </form>
      ) : null}

      <DialogueVoyage
        camions={camions}
        chauffeurs={chauffeurs}
        unites={unites}
        pays={pays}
        clients={clients}
        tauxReferenceXof={tauxReferenceXof}
        voyage={voyage}
        declencheur={
          <button type="button" title="Modifier le voyage">
            <IconeCrayon />
          </button>
        }
      />

      <form action={supprimerVoyage.bind(null, voyage.id)}>
        <BoutonAction
          // Un voyage déjà chiffré est annulé plutôt qu'effacé : le libellé le dit.
          titre={aDesEcritures ? "Annuler le voyage (frais déjà saisis)" : "Supprimer le voyage"}
          classe="del"
          // Premier clic : demande de confirmation, sans soumettre.
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
        </BoutonAction>
      </form>
    </div>
  );
}

function BoutonAction({
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
