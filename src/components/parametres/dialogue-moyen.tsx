"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerMoyen, modifierMoyen, type EtatMoyen } from "@/actions/moyens-paiement";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface MoyenEditable {
  id: string;
  nom: string;
  ordre: number;
}

export function DialogueMoyen({
  moyen,
  declencheur,
}: {
  moyen?: MoyenEditable | null;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!moyen;

  const action = edition
    ? modifierMoyen.bind(null, moyen.id)
    : (creerMoyen as (e: EtatMoyen, d: FormData) => Promise<EtatMoyen>);
  const [etat, envoyer] = useActionState<EtatMoyen, FormData>(action, {});

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-w-[440px] gap-0 p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>
            {edition ? `Modifier ${moyen.nom}` : "Ajouter un moyen de paiement"}
          </DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <div className="full">
                <div className="field">
                  <label>Nom</label>
                  <input
                    name="nom"
                    required
                    autoFocus
                    maxLength={40}
                    placeholder="Wave, MTN Money, Ecobank…"
                    key={val("nom", moyen?.nom ?? "")}
                    defaultValue={val("nom", moyen?.nom ?? "")}
                  />
                  <span className="text-[11px] text-[var(--muted-2)]">
                    Tel qu&apos;il apparaîtra dans les listes de saisie.
                  </span>
                  {err("nom") ? (
                    <span className="text-[11.5px] text-[var(--neg)]">{err("nom")}</span>
                  ) : null}
                </div>
              </div>

              <div className="field">
                <label>Ordre d&apos;affichage</label>
                <input
                  name="ordre"
                  inputMode="numeric"
                  placeholder="100"
                  key={val("ordre", String(moyen?.ordre ?? ""))}
                  defaultValue={val("ordre", String(moyen?.ordre ?? ""))}
                />
                <span className="text-[11px] text-[var(--muted-2)]">
                  Le plus petit passe en premier. Mettez les moyens les plus courants devant.
                </span>
              </div>
            </div>
          </div>

          <footer className="modal-pied">
            <button type="button" className="btn ghost" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <BoutonEnvoyer edition={edition} />
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BoutonEnvoyer({ edition }: { edition: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter"}
    </button>
  );
}
