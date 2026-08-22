"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerFacture, modifierFacture, type EtatFacture } from "@/actions/factures";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDecimal, formatNombre } from "@/lib/utils";
import { ChampMontant } from "@/components/champ-montant";

/** Voyage facturable : porte de quoi pré-remplir la facture. */
export interface OptionVoyageFacturable {
  id: string;
  libelle: string;
  client: string | null;
  /** Client du voyage : sert à présélectionner celui de la facture. */
  clientId: string | null;
  marchandise: string | null;
  recette: number;
  devise: "GNF" | "XOF";
  recetteGnf: number;
  dejaFacture: boolean;
}

export interface OptionClient {
  id: string;
  nom: string;
}

export interface FactureEditable {
  id: string;
  numero: string;
  clientId: string;
  voyageId: string | null;
  montant: number;
  devise: "GNF" | "XOF";
  montantGnf: number;
  echeance: string | null;
  marchandiseAssuree: boolean;
  tauxPenaliteRetard: number | null;
  afficherEquivalentCfa: boolean;
}

interface Props {
  clients: OptionClient[];
  voyages: OptionVoyageFacturable[];
  delaiPaiementJours: number;
  tauxReferenceXof: number | null;
  facture?: FactureEditable | null;
  /** Voyage imposé : ouverture depuis la fiche voyage. */
  voyageImpose?: string;
  declencheur: React.ReactNode;
}

const dansNJours = (jours: number) =>
  new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);

export function DialogueFacture({
  clients,
  voyages,
  delaiPaiementJours,
  tauxReferenceXof,
  facture,
  voyageImpose,
  declencheur,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!facture;

  const action = edition
    ? modifierFacture.bind(null, facture.id)
    : (creerFacture as (e: EtatFacture, d: FormData) => Promise<EtatFacture>);
  const [etat, envoyer] = useActionState<EtatFacture, FormData>(action, {});

  const [voyageId, setVoyageId] = useState(facture?.voyageId ?? voyageImpose ?? "");
  const [clientId, setClientId] = useState(facture?.clientId ?? "");
  const [devise, setDevise] = useState<"GNF" | "XOF">(facture?.devise ?? "GNF");
  const [montant, setMontant] = useState(facture ? String(facture.montant) : "");
  const [montantGnf, setMontantGnf] = useState(facture ? String(facture.montantGnf) : "");

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  useEffect(() => {
    const v = etat.valeurs;
    if (!v) return;
    setVoyageId(v.voyageId ?? "");
    setClientId(v.clientId ?? "");
    setDevise(v.devise === "XOF" ? "XOF" : "GNF");
    setMontant(v.montant ?? "");
    setMontantGnf(v.montantGnf ?? "");
  }, [etat.valeurs]);

  /**
   * Pré-remplissage depuis le voyage : recette, devise et client.
   * C'est le mode de création attendu (cf. CLAUDE.md) — l'utilisateur
   * garde la main pour corriger ensuite.
   */
  const reprendreLeVoyage = useCallback(
    (id: string) => {
      const voyage = voyages.find((v) => v.id === id);
      if (!voyage) return;

      setMontant(String(voyage.recette));
      setDevise(voyage.devise);
      setMontantGnf(String(voyage.recetteGnf));

      // Le voyage désigne son client par identifiant : plus de rapprochement
      // par nom, qui ratait dès qu'une orthographe différait d'un caractère.
      if (voyage.clientId) setClientId(voyage.clientId);
    },
    [voyages],
  );

  const choisirVoyage = (id: string) => {
    setVoyageId(id);
    reprendreLeVoyage(id);
  };

  /*
   * Ouverture depuis une mission : le voyage est imposé, mais personne ne le
   * « choisit » — la reprise des montants ne se déclenchait donc jamais. La
   * facture s'ouvrait vide alors que la mission connaît déjà le client et le
   * montant facturé, et il fallait tout ressaisir à la main. C'est
   * exactement là que les chiffres finissaient par diverger.
   */
  useEffect(() => {
    if (!ouvert || !voyageImpose || edition) return;
    setVoyageId(voyageImpose);
    reprendreLeVoyage(voyageImpose);
  }, [ouvert, voyageImpose, edition, reprendreLeVoyage]);

  // En CFA, l'équivalent GNF se pré-remplit au dernier taux connu.
  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const valeur = Number(montant.replace(",", "."));
    if (Number.isFinite(valeur) && valeur > 0) {
      setMontantGnf(String(Math.round(valeur * tauxReferenceXof)));
    }
  }, [devise, montant, tauxReferenceXof]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;
  const voyageChoisi = voyages.find((v) => v.id === voyageId);
  /** Ouverture depuis une mission : le voyage ne se change pas ici. */
  const voyageVerrouille = !!voyageImpose && !edition;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[560px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>
            {edition ? `Modifier ${facture.numero}` : "Nouvelle facture"}
          </DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--muted)]">
              Une facture se crée <b>depuis un voyage</b> : client, marchandise et recette sont
              repris automatiquement. Le numéro est attribué à l&apos;enregistrement.
            </p>

            <div className="form-grid">
              <div className="full">
                <Champ label="Voyage facturé">
                  {/*
                    * Un champ désactivé n'est PAS envoyé par le navigateur.
                    *
                    * Le voyage était donc perdu à chaque facture ouverte
                    * depuis une mission : la facture se créait détachée, la
                    * recette ne remontait jamais sur la mission, et celle-ci
                    * restait marquée « à facturer ». On garde le champ verrouillé
                    * — le voyage est imposé — mais un champ caché porte la valeur.
                    */}
                  {voyageVerrouille ? <input type="hidden" name="voyageId" value={voyageId} /> : null}
                  <select
                    name={voyageVerrouille ? undefined : "voyageId"}
                    key={voyageId}
                    defaultValue={voyageId}
                    onChange={(e) => choisirVoyage(e.target.value)}
                    disabled={voyageVerrouille}
                  >
                    <option value="">— facture hors voyage —</option>
                    {voyages.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.dejaFacture && v.id !== facture?.voyageId}>
                        {v.libelle}
                        {v.dejaFacture && v.id !== facture?.voyageId ? " — déjà facturé" : ""}
                      </option>
                    ))}
                  </select>
                </Champ>
              </div>

              {voyageChoisi?.marchandise ? (
                <div className="full -mt-2 mb-1 text-[11.5px] text-[var(--muted-2)]">
                  Marchandise : {voyageChoisi.marchandise}
                </div>
              ) : null}

              <div className="full">
                <Champ label="Client" erreur={err("clientId")}>
                  <select
                    name="clientId"
                    required
                    key={clientId}
                    defaultValue={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
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
              </div>

              <Champ label="Montant" erreur={err("montant")}>
                <ChampMontant
                    nom="montant"
                    valeur={montant}
                    devise={devise}
                    requis
                    onChange={setMontant}
                  />
              </Champ>

              <Champ label="Devise">
                {/* `key` : voir dialogue-voyage.tsx (select contrôlé désynchronisé). */}
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
                        : "Saisir le montant réel en GNF."
                    }
                  >
                    <input name="montantGnf" inputMode="numeric" value={montantGnf} onChange={(e) => setMontantGnf(e.target.value)} />
                  </Champ>
                </div>
              ) : (
                <input type="hidden" name="montantGnf" value={montant} />
              )}

              <Champ
                label="Échéance"
                aide={`Par défaut : ${delaiPaiementJours} jours (Paramètres).`}
              >
                <input
                  type="date"
                  name="echeance"
                  key={val("echeance", facture?.echeance ?? dansNJours(delaiPaiementJours))}
                  defaultValue={val("echeance", facture?.echeance ?? dansNJours(delaiPaiementJours))}
                />
              </Champ>

              <Champ
                label="Pénalité de retard (%/mois)"
                aide="Propre à cette facture."
              >
                <input
                  name="tauxPenaliteRetard"
                  inputMode="decimal"
                  key={val("tauxPenaliteRetard", facture?.tauxPenaliteRetard != null ? String(facture.tauxPenaliteRetard) : "")}
                  defaultValue={val("tauxPenaliteRetard", facture?.tauxPenaliteRetard != null ? String(facture.tauxPenaliteRetard) : "")}
                />
              </Champ>

              <div className="full flex flex-col gap-2 border-t border-[var(--line-soft)] pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    name="marchandiseAssuree"
                    value="true"
                    defaultChecked={etat.valeurs ? etat.valeurs.marchandiseAssuree === "true" : (facture?.marchandiseAssuree ?? false)}
                  />
                  Marchandise <b>assurée</b> (mention portée sur la facture)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    name="afficherEquivalentCfa"
                    value="true"
                    defaultChecked={etat.valeurs ? etat.valeurs.afficherEquivalentCfa === "true" : (facture?.afficherEquivalentCfa ?? true)}
                  />
                  Afficher l&apos;<b>équivalent en CFA</b> sur la facture
                </label>
              </div>

              {montant && devise === "GNF" ? (
                <div className="full text-[11.5px] text-[var(--muted-2)]">
                  Montant facturé : <b className="mono">{formatNombre(Number(montant.replace(",", ".")) || 0)} GNF</b>
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Créer la facture"}
    </button>
  );
}
