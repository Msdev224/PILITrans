"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { enregistrerPaiement, supprimerPaiement, type EtatFacture } from "@/actions/factures";
import { IconeCorbeille } from "@/components/icones";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate, formatDecimal, formatGnf, formatNombre } from "@/lib/utils";

const LIBELLE_MOYEN: Record<string, string> = {
  ESPECES: "Espèces",
  ORANGE_MONEY: "Orange Money",
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  AUTRE: "Autre",
};

export interface VersementVue {
  id: string;
  montant: number;
  devise: "GNF" | "XOF";
  montantGnf: number;
  date: string;
  moyen: string;
  reference: string | null;
}

interface Props {
  factureId: string;
  numero: string;
  client: string;
  montantGnf: number;
  payeGnf: number;
  resteGnf: number;
  versements: VersementVue[];
  tauxReferenceXof: number | null;
  declencheur: React.ReactNode;
}

export function DialoguePaiement({
  factureId,
  numero,
  client,
  montantGnf,
  payeGnf,
  resteGnf,
  versements,
  tauxReferenceXof,
  declencheur,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatFacture, FormData>(
    enregistrerPaiement.bind(null, factureId),
    {},
  );

  const [montant, setMontant] = useState(String(Math.round(resteGnf)));
  const [devise, setDevise] = useState<"GNF" | "XOF">("GNF");
  const [confirme, setConfirme] = useState(false);
  const [montantGnfSaisi, setMontantGnfSaisi] = useState("");

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  /**
   * Montant réellement encaissé, en GNF.
   *
   * C'est lui qui décide « partiel » ou « soldée », jamais le montant en
   * devise : un versement en CFA ne se compare pas au reste dû sans passer
   * par son équivalent réel.
   */
  const nombre = (v: string) => {
    const x = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  const montantVerseGnf = devise === "GNF" ? nombre(montant) : nombre(montantGnfSaisi);

  // Toute retouche du montant annule la confirmation : on ne valide jamais un
  // chiffre différent de celui qu'on a lu.
  useEffect(() => {
    setConfirme(false);
  }, [montant, devise, montantGnfSaisi]);

  // En CFA, l'équivalent GNF se pré-remplit au dernier taux connu.
  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const valeur = Number(montant.replace(",", "."));
    if (Number.isFinite(valeur) && valeur > 0) {
      setMontantGnfSaisi(String(Math.round(valeur * tauxReferenceXof)));
    }
  }, [devise, montant, tauxReferenceXof]);

  const progression = montantGnf > 0 ? Math.min((payeGnf / montantGnf) * 100, 100) : 0;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[520px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>Règlements — {numero}</DialogTitle>
        </DialogHeader>

        <div className="modal-corps">
          {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

          {/* ---------- Situation ---------- */}
          <div className="mb-4 text-[12.5px] text-[var(--muted)]">
            <div className="font-semibold text-[var(--ink)]">{client}</div>
            <div className="mt-2 flex justify-between">
              <span>Montant facturé</span>
              <b className="mono text-[var(--ink)]">{formatGnf(montantGnf)}</b>
            </div>
            <div className="flex justify-between">
              <span>
                Déjà réglé{versements.length > 0 ? ` (${versements.length} versement${versements.length > 1 ? "s" : ""})` : ""}
              </span>
              <b className="mono text-[var(--pos)]">{formatGnf(payeGnf)}</b>
            </div>
            <div className="mt-1 flex justify-between border-t border-[var(--line-soft)] pt-1">
              <span>Reste à régler</span>
              <b className="mono text-[var(--accent-ink)]">{formatGnf(resteGnf)}</b>
            </div>

            <div className="jauge mt-2.5">
              <i className={progression >= 100 ? "full" : undefined} style={{ width: `${progression}%` }} />
            </div>
          </div>

          {/* ---------- Échéancier ---------- */}
          {versements.length > 0 ? (
            <div className="mb-4">
              <div className="eyebrow !mb-2">Versements enregistrés</div>
              {versements.map((v) => (
                <div key={v.id} className="row !py-2">
                  <div className="corps">
                    <div className="t mono">{formatNombre(v.montantGnf)} GNF</div>
                    <div className="s">
                      {formatDate(new Date(v.date))} · {LIBELLE_MOYEN[v.moyen] ?? v.moyen}
                      {v.devise === "XOF" ? ` · ${formatNombre(v.montant)} CFA` : ""}
                      {v.reference ? ` · ${v.reference}` : ""}
                    </div>
                  </div>
                  {/* Annuler un versement recalcule le cumul et le statut. */}
                  <form action={supprimerPaiement.bind(null, v.id)}>
                    <BoutonAnnuler />
                  </form>
                </div>
              ))}
            </div>
          ) : null}

          {/* ---------- Nouveau versement ---------- */}
          {resteGnf > 0 ? (
            <form action={envoyer}>
              <div className="eyebrow !mb-2">Nouveau versement</div>

              <div className="form-grid">
                <div className="field">
                  <label>Montant</label>
                  <input
                    name="montant"
                    inputMode="decimal"
                    required
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                  />
                  {etat.champs?.montant ? (
                    <span className="text-[11.5px] text-[var(--neg)]">{etat.champs.montant}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label>Devise</label>
                  {/* `key` : voir dialogue-voyage.tsx (select contrôlé désynchronisé). */}
                  <select
                    name="devise"
                    key={devise}
                    defaultValue={devise}
                    onChange={(e) => setDevise(e.target.value as "GNF" | "XOF")}
                  >
                    <option value="GNF">GNF</option>
                    <option value="XOF">CFA</option>
                  </select>
                </div>

                {devise === "XOF" ? (
                  <div className="full">
                    <div className="field">
                      <label>Équivalent réel en GNF</label>
                      <input
                        name="montantGnf"
                        inputMode="numeric"
                        value={montantGnfSaisi}
                        onChange={(e) => setMontantGnfSaisi(e.target.value)}
                      />
                      <span className="text-[11px] text-[var(--muted-2)]">
                        {tauxReferenceXof
                          ? `Pré-rempli au taux ${formatDecimal(tauxReferenceXof, 2)}. Corrige au taux du jour du versement.`
                          : "Saisir le montant réellement encaissé en GNF."}
                      </span>
                      {etat.champs?.montantGnf ? (
                        <span className="text-[11.5px] text-[var(--neg)]">{etat.champs.montantGnf}</span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <input type="hidden" name="montantGnf" value={montant} />
                )}

                <div className="field">
                  <label>Moyen de paiement</label>
                  <select name="moyen" defaultValue="ESPECES">
                    {Object.keys(LIBELLE_MOYEN).map((m) => (
                      <option key={m} value={m}>
                        {LIBELLE_MOYEN[m]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Date du versement</label>
                  <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>

                <div className="full">
                  <div className="field">
                    <label>Référence</label>
                    <input name="reference" placeholder="N° de transfert, chèque, Orange Money…" />
                  </div>
                </div>
              </div>

              {/* Ce que le versement fait à la facture, avant de valider.
                  Un encaissement ne se défait pas d'un clic : le gérant doit
                  voir « partiel » ou « soldée » avant, pas après. */}
              <RecapPaiement montantGnf={montantVerseGnf} resteGnf={resteGnf} />

              {etat.erreur ? <p className="lg-error mt-2">{etat.erreur}</p> : null}

              <BoutonEnvoyer
                resteApres={resteGnf - montantVerseGnf}
                montantGnf={montantVerseGnf}
                confirme={confirme}
                demander={() => setConfirme(true)}
                annuler={() => setConfirme(false)}
              />
            </form>
          ) : (
            <p className="vide-msg">Facture soldée — tous les versements ont été encaissés.</p>
          )}
        </div>

        <footer className="modal-pied">
          <button type="button" className="btn ghost" onClick={() => setOuvert(false)}>
            Fermer
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/** Effet du versement en cours de saisie, en clair. */
function RecapPaiement({ montantGnf, resteGnf }: { montantGnf: number; resteGnf: number }) {
  if (montantGnf <= 0) return null;

  const apres = Math.round(resteGnf - montantGnf);
  // Un franc d'écart vient d'un arrondi de conversion, pas d'un impayé.
  const solde = apres <= 1;
  const trop = apres < -1;

  return (
    <div className={`recap-paiement ${trop ? "neg" : solde ? "ok" : ""}`}>
      {trop ? (
        <>
          Le versement dépasse le reste à régler de <b>{formatGnf(Math.abs(apres))}</b>.
        </>
      ) : solde ? (
        <>
          Cette facture sera <b>soldée</b> : {formatGnf(montantGnf)} encaissés, plus rien à régler.
        </>
      ) : (
        <>
          <b>Paiement partiel</b> : {formatGnf(montantGnf)} encaissés, il restera{" "}
          <b>{formatGnf(apres)}</b> à régler.
        </>
      )}
    </div>
  );
}

function BoutonEnvoyer({
  resteApres,
  montantGnf,
  confirme,
  demander,
  annuler,
}: {
  resteApres: number;
  montantGnf: number;
  confirme: boolean;
  demander: () => void;
  annuler: () => void;
}) {
  const { pending } = useFormStatus();

  // Rien de saisi : inutile de proposer une confirmation.
  if (montantGnf <= 0) {
    return (
      <button type="button" className="btn primary mt-3 w-full" disabled>
        Enregistrer le versement
      </button>
    );
  }

  if (!confirme) {
    return (
      <button type="button" className="btn primary mt-3 w-full" onClick={demander}>
        Enregistrer le versement
      </button>
    );
  }

  return (
    <div className="confirme-bloc mt-3">
      <p>
        Confirmer l&apos;encaissement de <b>{formatGnf(montantGnf)}</b> ?{" "}
        {Math.round(resteApres) <= 1 ? "La facture sera soldée." : `Il restera ${formatGnf(Math.round(resteApres))}.`}
      </p>
      <div className="confirme-btns">
        <button type="button" className="btn ghost" onClick={annuler} disabled={pending}>
          Annuler
        </button>
        <BoutonValider />
      </div>
    </div>
  );
}

function BoutonValider() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Enregistrement…" : "Oui, encaisser"}
    </button>
  );
}

function BoutonAnnuler() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="del grid h-[26px] w-[26px] place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--neg)] hover:text-[var(--neg)]"
      title="Annuler ce versement"
      disabled={pending}
    >
      <IconeCorbeille width={13} height={13} />
    </button>
  );
}
