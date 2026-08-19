"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerReclamation, modifierReclamation, type EtatReclamation } from "@/actions/reclamations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDecimal } from "@/lib/utils";

const LIBELLE_TYPE: Record<string, string> = {
  QUANTITE: "Quantité contestée",
  QUALITE: "Qualité de la marchandise",
  RETARD: "Retard de livraison",
  RUPTURE_FROID: "Rupture de la chaîne du froid",
  AUTRE: "Autre",
};

const LIBELLE_STATUT: Record<string, string> = {
  OUVERTE: "Ouverte",
  EN_COURS: "En cours de traitement",
  RESOLUE: "Résolue",
  REJETEE: "Rejetée",
};

export interface OptionVoyageReclamation {
  /** Identifiant de la ligne de marchandise : c'est elle qui porte les quantités. */
  id: string;
  voyageId: string;
  libelle: string;
  symbole: string;
  /** Quantité livrée déclarée par le chauffeur, pour le recoupement. */
  livree: number | null;
}

export interface ReclamationEditable {
  id: string;
  clientId: string;
  voyageId: string | null;
  factureId: string | null;
  type: string;
  description: string;
  quantiteContestee: number | null;
  ligneId: string | null;
  statut: string;
  resolution: string | null;
  montantAvoirGnf: number | null;
}

interface Props {
  clients: { id: string; nom: string }[];
  voyages: OptionVoyageReclamation[];
  factures: { id: string; libelle: string }[];
  reclamation?: ReclamationEditable | null;
  declencheur: React.ReactNode;
}

export function DialogueReclamation({
  clients,
  voyages,
  factures,
  reclamation,
  declencheur,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!reclamation;

  const action = edition
    ? modifierReclamation.bind(null, reclamation.id)
    : (creerReclamation as (e: EtatReclamation, d: FormData) => Promise<EtatReclamation>);
  const [etat, envoyer] = useActionState<EtatReclamation, FormData>(action, {});

  const [type, setType] = useState(reclamation?.type ?? "QUANTITE");
  const [statut, setStatut] = useState(reclamation?.statut ?? "OUVERTE");
  // L'état porte la LIGNE de marchandise choisie ; le voyage s'en déduit.
  const [voyageId, setVoyageId] = useState(reclamation?.ligneId ?? "");
  const [contestee, setContestee] = useState(
    reclamation?.quantiteContestee != null ? String(reclamation.quantiteContestee) : "",
  );

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  useEffect(() => {
    const v = etat.valeurs;
    if (!v) return;
    setType(v.type ?? "QUANTITE");
    setStatut(v.statut ?? "OUVERTE");
    setVoyageId(v.ligneId ?? "");
    setContestee(v.quantiteContestee ?? "");
  }, [etat.valeurs]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;

  const voyage = voyages.find((v) => v.id === voyageId);
  const contesteeNum = Number(contestee.replace(",", "."));
  // Recoupement immédiat : ce que le client conteste vs ce qui a été livré.
  const ecart =
    voyage?.livree != null && Number.isFinite(contesteeNum) && contestee !== ""
      ? Math.round((voyage.livree - contesteeNum) * 1000) / 1000
      : null;

  const close = statut === "RESOLUE" || statut === "REJETEE";

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[560px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? "Modifier la réclamation" : "Nouvelle réclamation"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <Champ label="Client" erreur={err("clientId")}>
                <select name="clientId" required key={val("clientId", reclamation?.clientId ?? "")} defaultValue={val("clientId", reclamation?.clientId ?? "")}>
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Nature de la réclamation">
                <select name="type" key={type} defaultValue={type} onChange={(e) => setType(e.target.value)}>
                  {Object.keys(LIBELLE_TYPE).map((t) => (
                    <option key={t} value={t}>
                      {LIBELLE_TYPE[t]}
                    </option>
                  ))}
                </select>
              </Champ>

              {/* La réclamation vise une marchandise précise : sur un
                  chargement mixte, contester « le voyage » ne dirait pas
                  quelle marchandise pose problème. */}
              <Champ label="Marchandise concernée">
                <select name="ligneId" key={voyageId} defaultValue={voyageId} onChange={(e) => setVoyageId(e.target.value)}>
                  <option value="">— aucune —</option>
                  {voyages.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.libelle}
                    </option>
                  ))}
                </select>
              </Champ>
              {/* Le voyage se déduit de la marchandise choisie. */}
              <input type="hidden" name="voyageId" value={voyage?.voyageId ?? ""} />

              <Champ label="Facture concernée">
                <select name="factureId" key={val("factureId", reclamation?.factureId ?? "")} defaultValue={val("factureId", reclamation?.factureId ?? "")}>
                  <option value="">— aucune —</option>
                  {factures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.libelle}
                    </option>
                  ))}
                </select>
              </Champ>

              {/* Le recoupement n'a de sens que sur une contestation de quantité. */}
              {type === "QUANTITE" ? (
                <div className="full">
                  <Champ
                    label="Quantité déclarée reçue par le client (t)"
                    erreur={err("quantiteContestee")}
                    aide={
                      voyage?.livree != null
                        ? `Le chauffeur a déclaré avoir livré ${formatDecimal(voyage.livree)} ${voyage.symbole}.`
                        : "Sélectionne un voyage pour recouper avec la quantité livrée."
                    }
                  >
                    <input
                      name="quantiteContestee"
                      inputMode="decimal"
                      value={contestee}
                      onChange={(e) => setContestee(e.target.value)}
                    />
                  </Champ>

                  {ecart !== null ? (
                    <div className={`note mt-1 ${ecart > 0 ? "" : "opacity-80"}`}>
                      <span>
                        {ecart > 0 ? (
                          <>
                            Écart de <b>{formatDecimal(ecart)} t</b> entre la quantité livrée déclarée et
                            celle reconnue par le client.
                          </>
                        ) : ecart < 0 ? (
                          <>
                            Le client déclare avoir reçu <b>{formatDecimal(-ecart)} t de plus</b> que ce
                            qui a été saisi à la livraison — vérifier la saisie.
                          </>
                        ) : (
                          <>Aucun écart : les deux quantités concordent.</>
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="full">
                <Champ label="Description" erreur={err("description")}>
                  <input name="description" required key={val("description", reclamation?.description ?? "")} defaultValue={val("description", reclamation?.description ?? "")} />
                </Champ>
              </div>

              <Champ label="Statut">
                <select name="statut" key={statut} defaultValue={statut} onChange={(e) => setStatut(e.target.value)}>
                  {Object.keys(LIBELLE_STATUT).map((s) => (
                    <option key={s} value={s}>
                      {LIBELLE_STATUT[s]}
                    </option>
                  ))}
                </select>
              </Champ>

              {/* L'avoir ne se saisit que sur une réclamation acceptée. */}
              {statut === "RESOLUE" ? (
                <Champ label="Avoir / remise accordé (GNF)">
                  <input name="montantAvoirGnf" inputMode="numeric" key={val("montantAvoirGnf", reclamation?.montantAvoirGnf != null ? String(reclamation.montantAvoirGnf) : "")} defaultValue={val("montantAvoirGnf", reclamation?.montantAvoirGnf != null ? String(reclamation.montantAvoirGnf) : "")} />
                </Champ>
              ) : null}

              {close ? (
                <div className="full">
                  <Champ
                    label={statut === "REJETEE" ? "Motif du rejet" : "Résolution"}
                    erreur={err("resolution")}
                  >
                    <input name="resolution" key={val("resolution", reclamation?.resolution ?? "")} defaultValue={val("resolution", reclamation?.resolution ?? "")} />
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ouvrir la réclamation"}
    </button>
  );
}
