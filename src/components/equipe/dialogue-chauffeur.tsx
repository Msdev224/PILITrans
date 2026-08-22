"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerChauffeur, modifierChauffeur, type EtatChauffeurFiche } from "@/actions/chauffeurs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LIBELLE_MODE_REMUNERATION } from "@/lib/utils";
import { ChampTelephone } from "@/components/champ-telephone";
import { ChampPhoto } from "@/components/equipe/champ-photo";

/** Unité du taux, selon le mode — un pourcentage et un forfait ne se saisissent pas pareil. */
const UNITE_TAUX: Record<string, string> = {
  FORFAIT_VOYAGE: "GNF par voyage",
  COMMISSION: "% de la recette",
  PAR_KM: "GNF par km",
  FIXE_MENSUEL: "GNF par mois",
  MIXTE: "% de la recette (part variable)",
};

export interface ChauffeurEditable {
  id: string;
  nom: string;
  telephone: string | null;
  photo: string | null;
  numeroPermis: string | null;
  categoriePermis: string | null;
  permisExpire: string | null;
  modeRemuneration: string;
  tauxRemuneration: number | null;
  actif: boolean;
}

export function DialogueChauffeur({ indicatifs, chauffeur, declencheur }: {
  chauffeur?: ChauffeurEditable | null;
  /** Pays proposés pour les numéros, tenus dans l'écran Pays. */
  indicatifs: { code: string; libelle: string; longueur: number | null }[];
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!chauffeur;

  const action = edition
    ? modifierChauffeur.bind(null, chauffeur.id)
    : (creerChauffeur as (e: EtatChauffeurFiche, d: FormData) => Promise<EtatChauffeurFiche>);
  const [etat, envoyer] = useActionState<EtatChauffeurFiche, FormData>(action, {});

  const [mode, setMode] = useState(chauffeur?.modeRemuneration ?? "FORFAIT_VOYAGE");

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  useEffect(() => {
    if (etat.valeurs?.modeRemuneration) setMode(etat.valeurs.modeRemuneration);
  }, [etat.valeurs]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string | number | null) =>
    etat.valeurs?.[champ] ?? (origine != null ? String(origine) : "");

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[540px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? `Modifier ${chauffeur.nom}` : "Ajouter un chauffeur"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <div className="full">
                <Champ label="Nom complet" erreur={err("nom")}>
                  <input name="nom" required defaultValue={val("nom", chauffeur?.nom ?? "")} />
                </Champ>
              </div>

              <div className="full">
                <Champ
                  label="Photo"
                  aide="Facultative. Réduite automatiquement avant enregistrement."
                >
                  <ChampPhoto nom="photo" valeur={chauffeur?.photo ?? null} />
                </Champ>
              </div>

              <Champ label="Téléphone" erreur={err("telephone")}>
                <ChampTelephone
                  indicatifs={indicatifs}
                  nom="telephone"
                  key={val("telephone", chauffeur?.telephone ?? null) ?? ""}
                  valeur={val("telephone", chauffeur?.telephone ?? null)}
                />
              </Champ>

              <Champ label="Numéro de permis">
                <input name="numeroPermis" defaultValue={val("numeroPermis", chauffeur?.numeroPermis ?? null)} />
              </Champ>

              <Champ label="Catégorie de permis">
                <input name="categoriePermis" defaultValue={val("categoriePermis", chauffeur?.categoriePermis ?? "CE")} />
              </Champ>

              <Champ label="Expiration du permis" aide="Alerte automatique à l'approche.">
                <input type="date" name="permisExpire" defaultValue={val("permisExpire", chauffeur?.permisExpire ?? null)} />
              </Champ>

              <Champ label="Mode de rémunération">
                <select
                  name="modeRemuneration"
                  key={mode}
                  defaultValue={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {Object.keys(LIBELLE_MODE_REMUNERATION).map((m) => (
                    <option key={m} value={m}>
                      {LIBELLE_MODE_REMUNERATION[m]}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ
                label="Taux"
                erreur={err("tauxRemuneration")}
                aide={UNITE_TAUX[mode] ?? "Selon le mode choisi."}
              >
                <input
                  name="tauxRemuneration"
                  inputMode="decimal"
                  defaultValue={val("tauxRemuneration", chauffeur?.tauxRemuneration ?? null)}
                  disabled={mode === "FIXE_MENSUEL"}
                />
              </Champ>

              <div className="full">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    name="actif"
                    value="true"
                    defaultChecked={etat.valeurs ? etat.valeurs.actif === "true" : (chauffeur?.actif ?? true)}
                  />
                  Chauffeur <b>actif</b> (affecté aux missions)
                </label>
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter le chauffeur"}
    </button>
  );
}
