"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { annulerVoyage } from "@/actions/voyages";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Annulation d'une mission, avec son motif.
 *
 * Rien n'est effacé : le gasoil déjà mis et l'avance déjà remise restent des
 * sorties d'argent réelles, qui doivent continuer de peser sur le camion. Ce
 * qui disparaît, c'est la recette attendue — la mission sort des analyses.
 *
 * Le motif est facultatif mais fortement encouragé : trois semaines plus tard,
 * personne ne se souvient si c'est le client qui a renoncé ou le camion qui
 * est tombé en panne, et la différence change ce qu'on facture.
 */
export function DialogueAnnulation({
  voyageId,
  reference,
  trajet,
  aDesEcritures,
  declencheur,
}: {
  voyageId: string;
  reference: string;
  trajet: string;
  /** La mission porte des frais, une facture ou des étapes déjà saisies. */
  aDesEcritures: boolean;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-w-[460px] gap-0 p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>Annuler la mission {reference} ?</DialogTitle>
        </DialogHeader>

        <form
          action={async (donnees: FormData) => {
            await annulerVoyage(voyageId, donnees);
            setOuvert(false);
          }}
        >
          <div className="modal-corps">
            <p className="text-[12.5px] text-[var(--muted)]">
              {trajet} sort des recettes, des classements et des analyses.
            </p>

            {aDesEcritures ? (
              <p className="mt-2 text-[12px] text-[var(--muted)]">
                Les frais déjà engagés et l&apos;argent remis au chauffeur sont conservés : ils ont
                réellement été dépensés et restent au compte du camion.
              </p>
            ) : null}

            <div className="field mt-3">
              <label>Motif de l&apos;annulation</label>
              <input
                name="motifAnnulation"
                placeholder="Client désisté, panne, marchandise non livrée…"
                autoFocus
              />
              <span className="text-[11px] text-[var(--muted-2)]">
                Facultatif, mais c&apos;est la seule chose qui expliquera cette mission plus tard.
              </span>
            </div>
          </div>

          <footer className="modal-pied">
            <button type="button" className="btn ghost" onClick={() => setOuvert(false)}>
              Revenir
            </button>
            <BoutonAnnuler />
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BoutonAnnuler() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn danger" disabled={pending}>
      {pending ? "Annulation…" : "Oui, annuler la mission"}
    </button>
  );
}
