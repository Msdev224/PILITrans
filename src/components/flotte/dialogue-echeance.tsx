"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerEcheance, modifierEcheance, type EtatEcheance } from "@/actions/echeances";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LIBELLE_TYPE_ECHEANCE } from "@/lib/utils";

export interface EcheanceEditable {
  id: string;
  camionId: string;
  type: string;
  dateExpiration: string;
  rappelJours: number;
}

export function DialogueEcheance({
  camions,
  echeance,
  rappelDefaut,
  declencheur,
}: {
  camions: { id: string; nom: string }[];
  echeance?: EcheanceEditable | null;
  rappelDefaut: number;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!echeance;

  const action = edition
    ? modifierEcheance.bind(null, echeance.id)
    : (creerEcheance as (e: EtatEcheance, d: FormData) => Promise<EtatEcheance>);
  const [etat, envoyer] = useActionState<EtatEcheance, FormData>(action, {});

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  const err = (c: string) => etat.champs?.[c];
  const val = (c: string, origine: string | number | null) =>
    etat.valeurs?.[c] ?? (origine != null ? String(origine) : "");

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-w-[480px] gap-0 p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? "Modifier l'échéance" : "Nouvelle échéance"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <div className="full">
                <div className="field">
                  <label>Camion</label>
                  <select name="camionId" required key={val("camionId", echeance?.camionId ?? "")} defaultValue={val("camionId", echeance?.camionId ?? "")}>
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {camions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                  {err("camionId") ? (
                    <span className="text-[11.5px] text-[var(--neg)]">{err("camionId")}</span>
                  ) : null}
                </div>
              </div>

              <div className="field">
                <label>Type de document</label>
                <select name="type" key={val("type", echeance?.type ?? "ASSURANCE")} defaultValue={val("type", echeance?.type ?? "ASSURANCE")}>
                  {Object.keys(LIBELLE_TYPE_ECHEANCE).map((t) => (
                    <option key={t} value={t}>
                      {LIBELLE_TYPE_ECHEANCE[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Date d&apos;expiration</label>
                <input type="date" name="dateExpiration" required key={val("dateExpiration", echeance?.dateExpiration ?? "")} defaultValue={val("dateExpiration", echeance?.dateExpiration ?? "")} />
                {err("dateExpiration") ? (
                  <span className="text-[11.5px] text-[var(--neg)]">{err("dateExpiration")}</span>
                ) : null}
              </div>

              <div className="full">
                <div className="field">
                  <label>Rappel (jours avant expiration)</label>
                  <input name="rappelJours" inputMode="numeric" key={val("rappelJours", echeance?.rappelJours ?? rappelDefaut)} defaultValue={val("rappelJours", echeance?.rappelJours ?? rappelDefaut)} />
                  <span className="text-[11px] text-[var(--muted-2)]">
                    Par défaut : {rappelDefaut} jours (Paramètres). L&apos;alerte devient urgente à 7 jours.
                  </span>
                  {err("rappelJours") ? (
                    <span className="text-[11.5px] text-[var(--neg)]">{err("rappelJours")}</span>
                  ) : null}
                </div>
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter l'échéance"}
    </button>
  );
}
