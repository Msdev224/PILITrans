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
import { LIBELLE_MOYEN_PAIEMENT } from "@/lib/utils";
import {
  CATEGORIE_PAR_TYPE_DEPENSE,
  estChargeDeStructure,
  LIBELLE_CATEGORIE_DEPENSE,
} from "@/lib/utils";
import { ChampMontant } from "@/components/champ-montant";

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
  categorie: string;
  imputerAMission: boolean;
  moyen: string;
  reference: string | null;
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
  // L'étage suit le type choisi, sauf si le gérant l'a fixé lui-même.
  const [categorie, setCategorie] = useState(
    depense?.categorie ?? CATEGORIE_PAR_TYPE_DEPENSE["GASOIL_TRACTEUR"],
  );
  const structure = estChargeDeStructure(categorie);
  const [voyageId, setVoyageId] = useState(depense?.voyageId ?? "");
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
                <select name="type" key={type} defaultValue={type} onChange={(e) => {
                    setType(e.target.value);
                    setCategorie(CATEGORIE_PAR_TYPE_DEPENSE[e.target.value] ?? "DIRECTE");
                  }}>
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
                <ChampMontant nom="montant" valeur={montant} devise={devise} requis onChange={setMontant} />
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
                <select
                  name="voyageId"
                  key={val("voyageId", depense?.voyageId ?? "")}
                  defaultValue={val("voyageId", depense?.voyageId ?? "")}
                  onChange={(e) => setVoyageId(e.target.value)}
                >
                  <option value="">— aucun —</option>
                  {voyages.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.libelle}
                    </option>
                  ))}
                </select>
              </Champ>

              {/* Une charge de véhicule rattachée à une mission sort par
                  défaut de sa marge : la pièce sert au camion pendant des
                  mois, pas à cette course. La case permet de l'y remettre
                  quand la dépense appartient bien au voyage — un pneu crevé
                  sur la route, par exemple. */}
              {categorie === "VEHICULE" && voyageId ? (
                <div className="full">
                  <label className="flex items-start gap-2 text-[12px] text-[var(--muted)]">
                    <input
                      type="checkbox"
                      name="imputerAMission"
                      defaultChecked={depense?.imputerAMission ?? false}
                      className="mt-[2px]"
                    />
                    <span>
                      <b className="text-[var(--ink)]">Imputer cette dépense à la marge de la mission</b>
                      <br />
                      Décochée, elle reste rattachée au voyage et visible dans ses postes, mais ne
                      pèse pas sur sa marge — elle est portée par le camion.
                    </span>
                  </label>
                </div>
              ) : null}

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

              {/* L'étage de la charge se déduit du type, mais reste modifiable :
                  c'est lui qui structure le compte de résultat. */}
              <Champ
                label="Étage de la charge"
                aide={
                  structure
                    ? "Charge de structure : ni camion ni mission à rattacher."
                    : "Rattachez-la à une mission ou à un camion ci-dessous."
                }
              >
                <select
                  name="categorie"
                  key={categorie}
                  defaultValue={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                >
                  {Object.keys(LIBELLE_CATEGORIE_DEPENSE).map((c) => (
                    <option key={c} value={c}>
                      {LIBELLE_CATEGORIE_DEPENSE[c]}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Moyen de paiement">
                <select name="moyen" defaultValue={val("moyen", depense?.moyen ?? "ESPECES")}>
                  {Object.keys(LIBELLE_MOYEN_PAIEMENT).map((m) => (
                    <option key={m} value={m}>
                      {LIBELLE_MOYEN_PAIEMENT[m]}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Référence" aide="N° de transfert, de reçu…">
                <input
                  name="reference"
                  key={val("reference", depense?.reference ?? "")}
                  defaultValue={val("reference", depense?.reference ?? "")}
                />
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
