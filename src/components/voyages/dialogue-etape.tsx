"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerEtape, modifierEtape, type EtatEtape } from "@/actions/etapes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatNombre, LIBELLE_TYPE_ETAPE } from "@/lib/utils";

export interface RavitaillementOption {
  id: string;
  libelle: string;
  litres: number;
  /** `true` si le plein est déjà rattaché à un autre tronçon. */
  prisAilleurs: boolean;
}

export interface EtapeEditable {
  id: string;
  type: string;
  villeDepart: string;
  villeArrivee: string;
  paysDepartId: string | null;
  paysArriveeId: string | null;
  kmDepart: number | null;
  kmArrivee: number | null;
  carburantRestantDepart: number | null;
  carburantRestantArrivee: number | null;
  motif: string | null;
  departLe: string | null;
  arriveeLe: string | null;
  ravitaillements: string[];
}

interface Props {
  voyageId: string;
  /** Pays proposés, tenus par l'exploitation. */
  pays: { id: string; nom: string }[];
  etape?: EtapeEditable | null;
  ravitaillements: RavitaillementOption[];
  declencheur: React.ReactNode;
}

const TYPES = Object.keys(LIBELLE_TYPE_ETAPE);

export function DialogueEtape({ voyageId, pays, etape, ravitaillements, declencheur }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!etape;

  const action = edition
    ? modifierEtape.bind(null, etape.id)
    : (creerEtape as (e: EtatEtape, d: FormData) => Promise<EtatEtape>);
  const [etat, envoyer] = useActionState<EtatEtape, FormData>(action, {});

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;
  const num = (v: number | null | undefined) => (v != null ? String(v) : "");

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[600px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? "Modifier l'étape" : "Ajouter une étape"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <input type="hidden" name="voyageId" value={voyageId} />

          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--muted)]">
              Le carburant se saisit en <b>litres restants dans le réservoir</b>, au départ et à
              l&apos;arrivée. La consommation en découle : restant départ + pleins − restant arrivée.
            </p>

            <div className="form-grid">
              <Champ label="Type d'étape">
                <select name="type" key={val("type", etape?.type ?? "ETAPE")} defaultValue={val("type", etape?.type ?? "ETAPE")}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {LIBELLE_TYPE_ETAPE[t]}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Motif (arrêt, détour…)">
                <input name="motif" key={val("motif", etape?.motif ?? "")} defaultValue={val("motif", etape?.motif ?? "")} />
              </Champ>

              <Champ label="Ville de départ" erreur={err("villeDepart")}>
                <input name="villeDepart" required key={val("villeDepart", etape?.villeDepart ?? "")} defaultValue={val("villeDepart", etape?.villeDepart ?? "")} />
              </Champ>

              <Champ label="Ville d'arrivée" erreur={err("villeArrivee")}>
                <input name="villeArrivee" required key={val("villeArrivee", etape?.villeArrivee ?? "")} defaultValue={val("villeArrivee", etape?.villeArrivee ?? "")} />
              </Champ>

              <Champ label="Pays de départ">
                <select name="paysDepartId" key={val("paysDepartId", etape?.paysDepartId ?? "")} defaultValue={val("paysDepartId", etape?.paysDepartId ?? "")}>
                  <option value="">—</option>
                  {pays.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Pays d'arrivée">
                <select name="paysArriveeId" key={val("paysArriveeId", etape?.paysArriveeId ?? "")} defaultValue={val("paysArriveeId", etape?.paysArriveeId ?? "")}>
                  <option value="">—</option>
                  {pays.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Compteur au départ (km)">
                <input name="kmDepart" inputMode="numeric" key={val("kmDepart", num(etape?.kmDepart))} defaultValue={val("kmDepart", num(etape?.kmDepart))} />
              </Champ>

              <Champ label="Compteur à l'arrivée (km)" erreur={err("kmArrivee")}>
                <input name="kmArrivee" inputMode="numeric" key={val("kmArrivee", num(etape?.kmArrivee))} defaultValue={val("kmArrivee", num(etape?.kmArrivee))} />
              </Champ>

              <Champ label="Réservoir au départ (L)">
                <input name="carburantRestantDepart" inputMode="decimal" key={val("carburantRestantDepart", num(etape?.carburantRestantDepart))} defaultValue={val("carburantRestantDepart", num(etape?.carburantRestantDepart))} />
              </Champ>

              <Champ label="Réservoir à l'arrivée (L)">
                <input name="carburantRestantArrivee" inputMode="decimal" key={val("carburantRestantArrivee", num(etape?.carburantRestantArrivee))} defaultValue={val("carburantRestantArrivee", num(etape?.carburantRestantArrivee))} />
              </Champ>

              <Champ label="Départ le">
                <input type="date" name="departLe" key={val("departLe", etape?.departLe ?? "")} defaultValue={val("departLe", etape?.departLe ?? "")} />
              </Champ>

              <Champ label="Arrivée le" erreur={err("arriveeLe")}>
                <input type="date" name="arriveeLe" key={val("arriveeLe", etape?.arriveeLe ?? "")} defaultValue={val("arriveeLe", etape?.arriveeLe ?? "")} />
              </Champ>

              <div className="full">
                <label className="mb-1.5 block text-[11.5px] font-medium text-[var(--muted)]">
                  Pleins faits pendant ce tronçon
                </label>
                {ravitaillements.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {ravitaillements.map((r) => (
                      <label
                        key={r.id}
                        className={`flex items-center gap-2 text-[12.5px] ${r.prisAilleurs ? "text-[var(--muted-2)]" : ""}`}
                      >
                        <input
                          type="checkbox"
                          name="ravitaillements"
                          value={r.id}
                          defaultChecked={etape?.ravitaillements.includes(r.id) ?? false}
                          disabled={r.prisAilleurs}
                        />
                        {r.libelle} — <b className="mono">{formatNombre(r.litres)} L</b>
                        {r.prisAilleurs ? " (déjà rattaché à un autre tronçon)" : ""}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-[var(--muted-2)]">
                    Aucun ravitaillement saisi en litres sur ce voyage. Ajoute une dépense de gasoil
                    avec ses litres pour pouvoir la rattacher ici.
                  </p>
                )}
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
  children,
}: {
  label: string;
  erreur?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {erreur ? <span className="text-[11.5px] text-[var(--neg)]">{erreur}</span> : null}
    </div>
  );
}

function BoutonEnvoyer({ edition }: { edition: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter l'étape"}
    </button>
  );
}
