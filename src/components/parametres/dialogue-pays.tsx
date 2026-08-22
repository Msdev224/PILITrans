"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerPays, modifierPays, type EtatPays } from "@/actions/pays";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface PaysEditable {
  id: string;
  nom: string;
  code: string;
  indicatif: string;
  longueurTelephone: number | null;
  ordre: number;
}

export function DialoguePays({
  pays,
  declencheur,
}: {
  pays?: PaysEditable | null;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!pays;

  const action = edition
    ? modifierPays.bind(null, pays.id)
    : (creerPays as (e: EtatPays, d: FormData) => Promise<EtatPays>);
  const [etat, envoyer] = useActionState<EtatPays, FormData>(action, {});

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  const err = (c: string) => etat.champs?.[c];
  const val = (c: string, origine: string) => etat.valeurs?.[c] ?? origine;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-w-[480px] gap-0 p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? `Modifier ${pays.nom}` : "Ajouter un pays"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <div className="full">
                <Champ label="Nom" erreur={err("nom")}>
                  <input
                    name="nom"
                    required
                    placeholder="Ghana"
                    key={val("nom", pays?.nom ?? "")}
                    defaultValue={val("nom", pays?.nom ?? "")}
                  />
                </Champ>
              </div>

              <Champ label="Code ISO" erreur={err("code")} aide="Deux lettres, reprises sur les factures.">
                <input
                  name="code"
                  required
                  maxLength={2}
                  placeholder="GH"
                  key={val("code", pays?.code ?? "")}
                  defaultValue={val("code", pays?.code ?? "")}
                />
              </Champ>

              {/* Ajouter un pays rend du même coup ses numéros saisissables. */}
              <Champ label="Indicatif" erreur={err("indicatif")} aide="Avec le +, ex. +233.">
                <input
                  name="indicatif"
                  required
                  placeholder="+233"
                  key={val("indicatif", pays?.indicatif ?? "")}
                  defaultValue={val("indicatif", pays?.indicatif ?? "")}
                />
              </Champ>

              <Champ
                label="Longueur du numéro"
                erreur={err("longueurTelephone")}
                aide="Facultatif. Signale une saisie douteuse."
              >
                <input
                  name="longueurTelephone"
                  inputMode="numeric"
                  key={val("longueurTelephone", pays?.longueurTelephone != null ? String(pays.longueurTelephone) : "")}
                  defaultValue={val("longueurTelephone", pays?.longueurTelephone != null ? String(pays.longueurTelephone) : "")}
                />
              </Champ>

              <Champ label="Ordre d'affichage" erreur={err("ordre")}>
                <input
                  name="ordre"
                  inputMode="numeric"
                  key={val("ordre", String(pays?.ordre ?? 100))}
                  defaultValue={val("ordre", String(pays?.ordre ?? 100))}
                />
              </Champ>
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

function Champ({
  label,
  erreur,
  aide,
  children,
}: {
  label: string;
  erreur?: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {aide ? <span className="text-[11px] text-[var(--muted-2)]">{aide}</span> : null}
      {erreur ? <span className="text-[11.5px] text-[var(--neg)]">{erreur}</span> : null}
    </div>
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
