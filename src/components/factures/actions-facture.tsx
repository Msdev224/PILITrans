"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { relancerParSms, supprimerFacture } from "@/actions/factures";
import { BoutonConfirme } from "@/components/bouton-confirme";
import {
  DialogueFacture,
  type FactureEditable,
  type OptionClient,
  type OptionVoyageFacturable,
} from "@/components/factures/dialogue-facture";
import { DialoguePaiement, type VersementVue } from "@/components/factures/dialogue-paiement";
import {
  IconeCloche,
  IconeCorbeille,
  IconeCrayon,
  IconeFacture,
  IconeValider,
} from "@/components/icones";
import Link from "next/link";

interface Props {
  facture: FactureEditable;
  /** Échéance dépassée : conditionne la relance. */
  echue: boolean;
  numero: string;
  client: string;
  montantGnf: number;
  payeGnf: number;
  resteGnf: number;
  versements: VersementVue[];
  moyens: { id: string; nom: string }[];
  clients: OptionClient[];
  voyages: OptionVoyageFacturable[];
  delaiPaiementJours: number;
  tauxReferenceXof: number | null;
}

export function ActionsFacture({
  facture,
  echue,
  numero,
  client,
  montantGnf,
  payeGnf,
  resteGnf,
  versements,
  moyens,
  clients,
  voyages,
  delaiPaiementJours,
  tauxReferenceXof,
}: Props) {
  const [confirmation, setConfirmation] = useState(false);
  const soldee = resteGnf <= 0;
  const enRetard = !soldee && echue;

  return (
    <div className="acts">
      <DialoguePaiement
          factureId={facture.id}
          numero={numero}
          client={client}
          montantGnf={montantGnf}
          payeGnf={payeGnf}
          resteGnf={resteGnf}
          versements={versements}
          moyens={moyens}
          tauxReferenceXof={tauxReferenceXof}
          declencheur={
            <button
              type="button"
              title={soldee ? "Voir les règlements" : "Enregistrer un règlement"}
            >
              <IconeValider />
            </button>
          }
        />

      {/* Il n'y a plus de raccourci « marquer payée ».
          Il soldait la facture en un clic, sans moyen de paiement ni date, et
          sans rien montrer avant : un encaissement inexistant se glissait dans
          les comptes sur une erreur de bouton. Tout règlement passe désormais
          par le dialogue ci-dessus, qui demande le montant, le moyen, et fait
          confirmer — en annonçant si la facture sera soldée ou partiellement
          réglée. */}

      {/* Relance manuelle : elle s'envoie au bon moment, choisi par le gérant,
          et seulement sur une facture réellement en retard. */}
      {enRetard ? (
        <BoutonConfirme
          action={relancerParSms.bind(null, facture.id)}
          titre={`Relancer ${client} par SMS ?`}
          detail={`Un message part maintenant sur le numéro du client pour la facture ${numero}. Un SMS envoyé ne se rappelle pas.`}
          confirmer="Oui, envoyer"
          declencheur={
            <button type="button" title={`Relancer ${client} par SMS`}>
              <IconeCloche width={14} height={14} />
            </button>
          }
        />
      ) : null}

      <Link
        href={`/factures/${facture.id}/impression`}
        title="Imprimer la facture"
        className="grid h-[29px] w-[29px] place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--muted-2)] hover:text-[var(--ink)]"
      >
        <IconeFacture width={14} height={14} />
      </Link>

      <DialogueFacture
        clients={clients}
        voyages={voyages}
        delaiPaiementJours={delaiPaiementJours}
        tauxReferenceXof={tauxReferenceXof}
        facture={facture}
        declencheur={
          <button type="button" title="Modifier la facture">
            <IconeCrayon />
          </button>
        }
      />

      {/* Mutation via <form> : voir actions-voyage.tsx. */}
      <form action={supprimerFacture.bind(null, facture.id)}>
        <BoutonSuppression
          // Une facture encaissée est refusée côté serveur : on le dit ici.
          titre={payeGnf > 0 ? "Facture réglée — suppression impossible" : "Supprimer la facture"}
          desactive={payeGnf > 0}
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
