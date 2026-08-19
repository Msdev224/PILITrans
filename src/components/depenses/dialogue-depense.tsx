"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerDepense, modifierDepense, type EtatDepense } from "@/actions/depenses";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDecimal, LIBELLE_TYPE_DEPENSE } from "@/lib/utils";

const TYPES_GASOIL = ["GASOIL_TRACTEUR", "GASOIL_GROUPE_FROID"];

export interface OptionVoyage {
  id: string;
  libelle: string;
}

export interface OptionCamionSimple {
  id: string;
  nom: string;
}

export interface DepenseEditable {
  id: string;
  type: string;
  montant: number;
  devise: "GNF" | "XOF";
  montantGnf: number;
  litres: number | null;
  releveCompteur: number | null;
  description: string | null;
  date: string;
  voyageId: string | null;
  camionId: string | null;
}

export interface OptionChauffeurCaisse {
  id: string;
  nom: string;
}

interface Props {
  voyages: OptionVoyage[];
  camions: OptionCamionSimple[];
  chauffeurs: OptionChauffeurCaisse[];
  tauxReferenceXof: number | null;
  depense?: DepenseEditable | null;
  declencheur: React.ReactNode;
}

export function DialogueDepense({
  voyages,
  camions,
  chauffeurs,
  tauxReferenceXof,
  depense,
  declencheur,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!depense;

  const action = edition
    ? modifierDepense.bind(null, depense.id)
    : (creerDepense as (e: EtatDepense, d: FormData) => Promise<EtatDepense>);
  const [etat, envoyer] = useActionState<EtatDepense, FormData>(action, {});

  const [type, setType] = useState(depense?.type ?? "GASOIL_TRACTEUR");
  const [devise, setDevise] = useState<"GNF" | "XOF">(depense?.devise ?? "GNF");
  const [montant, setMontant] = useState(depense ? String(depense.montant) : "");
  const [montantGnf, setMontantGnf] = useState(depense ? String(depense.montantGnf) : "");

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  useEffect(() => {
    const v = etat.valeurs;
    if (!v) return;
    setType(v.type ?? "GASOIL_TRACTEUR");
    setDevise(v.devise === "XOF" ? "XOF" : "GNF");
    setMontant(v.montant ?? "");
    setMontantGnf(v.montantGnf ?? "");
  }, [etat.valeurs]);

  // Pré-remplissage au dernier taux connu ; l'utilisateur corrige ensuite.
  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const valeur = Number(montant.replace(",", "."));
    if (Number.isFinite(valeur) && valeur > 0) {
      setMontantGnf(String(Math.round(valeur * tauxReferenceXof)));
    }
  }, [devise, montant, tauxReferenceXof]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;
  const num = (v: number | null | undefined) => (v != null ? String(v) : "");
  const estGasoil = TYPES_GASOIL.includes(type);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[560px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? "Modifier la dépense" : "Nouvelle dépense"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <Champ label="Type de dépense">
                <select name="type" key={type} defaultValue={type} onChange={(e) => setType(e.target.value)}>
                  {Object.keys(LIBELLE_TYPE_DEPENSE).map((t) => (
                    <option key={t} value={t}>
                      {LIBELLE_TYPE_DEPENSE[t]}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Date" erreur={err("date")}>
                <input type="date" name="date" required key={val("date", depense?.date ?? new Date().toISOString().slice(0, 10))} defaultValue={val("date", depense?.date ?? new Date().toISOString().slice(0, 10))} />
              </Champ>

              <Champ label="Montant" erreur={err("montant")}>
                <input name="montant" inputMode="decimal" required value={montant} onChange={(e) => setMontant(e.target.value)} />
              </Champ>

              <Champ label="Devise">
                {/* `key` : voir dialogue-voyage.tsx — un select contrôlé se
                    désynchronise après restauration de la saisie. */}
                <select name="devise" key={devise} defaultValue={devise} onChange={(e) => setDevise(e.target.value as "GNF" | "XOF")}>
                  <option value="GNF">GNF — franc guinéen</option>
                  <option value="XOF">CFA — franc XOF</option>
                </select>
              </Champ>

              {devise === "XOF" ? (
                <div className="full">
                  <Champ
                    label="Équivalent réel en GNF"
                    erreur={err("montantGnf")}
                    aide={
                      tauxReferenceXof
                        ? `Pré-rempli au dernier taux connu (1 CFA ≈ ${formatDecimal(tauxReferenceXof, 2)} GNF). Corrige avec le taux réellement pratiqué.`
                        : "Saisir le montant réellement déboursé en GNF."
                    }
                  >
                    <input name="montantGnf" inputMode="numeric" value={montantGnf} onChange={(e) => setMontantGnf(e.target.value)} />
                  </Champ>
                </div>
              ) : (
                <input type="hidden" name="montantGnf" value={montant} />
              )}

              {/* Le gasoil se saisit en litres : c'est ce qui rend la conso calculable. */}
              {estGasoil ? (
                <>
                  <Champ label="Litres" erreur={err("litres")}>
                    <input name="litres" inputMode="decimal" key={val("litres", num(depense?.litres))} defaultValue={val("litres", num(depense?.litres))} />
                  </Champ>
                  <Champ
                    label={type === "GASOIL_GROUPE_FROID" ? "Relevé horaire" : "Relevé compteur (km)"}
                  >
                    <input name="releveCompteur" inputMode="numeric" key={val("releveCompteur", num(depense?.releveCompteur))} defaultValue={val("releveCompteur", num(depense?.releveCompteur))} />
                  </Champ>
                </>
              ) : null}

              <Champ label="Voyage rattaché">
                <select name="voyageId" key={val("voyageId", depense?.voyageId ?? "")} defaultValue={val("voyageId", depense?.voyageId ?? "")}>
                  <option value="">— aucun —</option>
                  {voyages.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.libelle}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ
                label="Camion"
                erreur={err("camionId")}
                aide="Déduit du voyage s'il est renseigné."
              >
                <select name="camionId" key={val("camionId", depense?.camionId ?? "")} defaultValue={val("camionId", depense?.camionId ?? "")}>
                  <option value="">— déduire du voyage —</option>
                  {camions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </Champ>

              <div className="full">
                <Champ label="Description">
                  <input name="description" key={val("description", depense?.description ?? "")} defaultValue={val("description", depense?.description ?? "")} placeholder="Plein à Tambacounda, forfait data Sénégal…" />
                </Champ>
              </div>

              {/* Argent remis au chauffeur : la dépense reste imputée au camion,
                  et le solde de sa caisse baisse d'autant. Un seul geste, une
                  seule écriture — pas de sortie de caisse sans coût attribué. */}
              {!edition ? (
                <div className="full">
                  <Champ
                    label="Payée sur la caisse d'un chauffeur"
                    aide="Facultatif. Réduit le solde qu'il détient, sans compter la dépense deux fois."
                  >
                    <select name="surCaisseChauffeurId" defaultValue="">
                      <option value="">Non — payée directement</option>
                      {chauffeurs.map((c) => (
                        <option key={c.id} value={c.id}>
                          Sur la caisse de {c.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>
                </div>
              ) : null}
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter la dépense"}
    </button>
  );
}
