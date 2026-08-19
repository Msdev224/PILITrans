"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerUnite, modifierUnite, type EtatUnite } from "@/actions/unites";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface UniteEditable {
  id: string;
  nom: string;
  symbole: string;
  facteurTonne: number | null;
  ordre: number;
}

export function DialogueUnite({
  unite,
  declencheur,
}: {
  unite?: UniteEditable | null;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!unite;

  const action = edition
    ? modifierUnite.bind(null, unite.id)
    : (creerUnite as (e: EtatUnite, d: FormData) => Promise<EtatUnite>);
  const [etat, envoyer] = useActionState<EtatUnite, FormData>(action, {});

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[480px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? `Modifier ${unite.nom}` : "Ajouter une unité"}</DialogTitle>
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
                    placeholder="Sac de 25 kg, Fût, Botte…"
                    key={val("nom", unite?.nom ?? "")}
                    defaultValue={val("nom", unite?.nom ?? "")}
                  />
                </Champ>
              </div>

              <Champ label="Symbole" erreur={err("symbole")} aide="Affiché à côté des quantités.">
                <input
                  name="symbole"
                  required
                  placeholder="sac"
                  key={val("symbole", unite?.symbole ?? "")}
                  defaultValue={val("symbole", unite?.symbole ?? "")}
                />
              </Champ>

              <Champ label="Ordre d'affichage" erreur={err("ordre")}>
                <input
                  name="ordre"
                  inputMode="numeric"
                  key={val("ordre", String(unite?.ordre ?? 100))}
                  defaultValue={val("ordre", String(unite?.ordre ?? 100))}
                />
              </Champ>

              <div className="full">
                <Champ
                  label="Équivalent en tonnes"
                  erreur={err("facteurTonne")}
                  aide="Facultatif. Ce que pèse UNE unité : 0,05 pour un sac de 50 kg. À laisser vide pour ce qui ne se pèse pas (palette, tête de bétail) — l'unité reste utilisable, seul le cumul en tonnage devient impossible."
                >
                  <input
                    name="facteurTonne"
                    inputMode="decimal"
                    placeholder="0,05"
                    key={val("facteurTonne", unite?.facteurTonne != null ? String(unite.facteurTonne) : "")}
                    defaultValue={val("facteurTonne", unite?.facteurTonne != null ? String(unite.facteurTonne) : "")}
                  />
                </Champ>
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
