"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { changerStatutVoyage, supprimerVoyage } from "@/actions/voyages";
import { BoutonConfirme } from "@/components/bouton-confirme";
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
  // Le chauffeur déclare normalement lui-même son départ depuis son
  // téléphone ; le gérant garde la main quand le réseau manque de son côté.
  PLANIFIE: { statut: "EN_ROUTE_CHARGEMENT", libelle: "Marquer parti" },
  EN_ROUTE_CHARGEMENT: { statut: "EN_ATTENTE_CHARGEMENT", libelle: "Marquer arrivé au chargement" },
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
      {/* Faire avancer une mission se confirme : l'état change pour tout le
          monde et peut déclencher un SMS au client. La confirmation ferme
          aussi la porte au double envoi — avec startTransition, le
          rafraîchissement de revalidatePath rejouait l'action et la mission
          sautait plusieurs états d'un coup. */}
      {suivant ? (
        <BoutonConfirme
          action={changerStatutVoyage.bind(null, voyage.id, suivant.statut as never)}
          titre={`${suivant.libelle} ?`}
          detail="L'état de la mission change pour tout le monde, le chauffeur compris, et le client peut en être averti par SMS. Il n'y a pas de retour en arrière."
          confirmer="Oui, faire avancer"
          declencheur={
            <button type="button" title={suivant.libelle}>
              <IconeValider />
            </button>
          }
        />
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
