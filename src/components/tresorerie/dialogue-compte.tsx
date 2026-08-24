"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerCompte, modifierCompte, type EtatTresorerie } from "@/actions/tresorerie";
import { ChampMontant } from "@/components/champ-montant";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LIBELLE_TYPE_COMPTE } from "@/lib/utils";

export interface CompteEditable {
  id: string;
  nom: string;
  type: string;
  reference: string | null;
  devise: string;
  soldeInitialGnf: number;
  ordre: number;
  /** Un compte chauffeur suit sa fiche : son type ne se change pas. */
  estChauffeur: boolean;
}

export function DialogueCompte({
  compte,
  declencheur,
}: {
  compte?: CompteEditable | null;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!compte;

  const action = edition
    ? modifierCompte.bind(null, compte.id)
    : (creerCompte as (e: EtatTresorerie, d: FormData) => Promise<EtatTresorerie>);
  const [etat, envoyer] = useActionState<EtatTresorerie, FormData>(action, {});

  const [solde, setSolde] = useState(compte ? String(compte.soldeInitialGnf) : "");

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[500px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? `Modifier ${compte.nom}` : "Ouvrir un compte"}</DialogTitle>
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
                    maxLength={60}
                    placeholder="Ecobank GNF, Coffre bureau, Orange Money…"
                    key={val("nom", compte?.nom ?? "")}
                    defaultValue={val("nom", compte?.nom ?? "")}
                  />
                  {err("nom") ? (
                    <span className="text-[11.5px] text-[var(--neg)]">{err("nom")}</span>
                  ) : null}
                </div>
              </div>

              <div className="field">
                <label>Type</label>
                {/* Un compte chauffeur suit sa fiche : le champ caché conserve
                    son type plutôt qu'une liste désactivée, qui ne serait pas
                    envoyée. */}
                {compte?.estChauffeur ? (
                  <>
                    <input type="hidden" name="type" value="CHAUFFEUR" />
                    <div className="valeur-figee">Détenu par un chauffeur</div>
                  </>
                ) : (
                  <select name="type" defaultValue={val("type", compte?.type ?? "CAISSE")}>
                    {Object.entries(LIBELLE_TYPE_COMPTE)
                      .filter(([cle]) => cle !== "CHAUFFEUR")
                      .map(([cle, libelle]) => (
                        <option key={cle} value={cle}>
                          {libelle}
                        </option>
                      ))}
                  </select>
                )}
                {err("type") ? (
                  <span className="text-[11.5px] text-[var(--neg)]">{err("type")}</span>
                ) : null}
              </div>

              <div className="field">
                <label>Devise</label>
                <select name="devise" defaultValue={val("devise", compte?.devise ?? "GNF")}>
                  <option value="GNF">GNF</option>
                  <option value="XOF">CFA</option>
                </select>
              </div>

              <div className="full">
                <div className="field">
                  <label>Référence</label>
                  <input
                    name="reference"
                    placeholder="N° de compte, numéro Orange Money, emplacement du coffre…"
                    key={val("reference", compte?.reference ?? "")}
                    defaultValue={val("reference", compte?.reference ?? "")}
                  />
                  <span className="text-[11px] text-[var(--muted-2)]">
                    Ce qui permet de retrouver l&apos;argent dans le monde réel.
                  </span>
                </div>
              </div>

              <div className="field">
                <label>Solde à l&apos;ouverture</label>
                <ChampMontant nom="soldeInitial" valeur={solde} onChange={setSolde} />
                <span className="text-[11px] text-[var(--muted-2)]">
                  Ce que le compte contenait déjà. Sans lui, il partirait de zéro et passerait
                  en négatif dès la première sortie.
                </span>
              </div>

              <div className="field">
                <label>Constaté le</label>
                <input
                  type="date"
                  name="dateSoldeInitial"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>

              <div className="field">
                <label>Ordre d&apos;affichage</label>
                <input
                  name="ordre"
                  inputMode="numeric"
                  placeholder="100"
                  key={val("ordre", String(compte?.ordre ?? ""))}
                  defaultValue={val("ordre", String(compte?.ordre ?? ""))}
                />
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ouvrir le compte"}
    </button>
  );
}
