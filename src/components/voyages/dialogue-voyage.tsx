"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  creerVoyage,
  modifierVoyage,
  proposerDepuisHistorique,
  type EtatFormulaire,
} from "@/actions/voyages";
import { IconeInfo } from "@/components/icones";
import type { Suggestion } from "@/lib/donnees/trajets";
import { formatDecimal, formatNombre } from "@/lib/utils";


// Les objets Prisma portent des Decimal, qui ne traversent pas la frontière
// serveur → client. Le formulaire reçoit donc des données déjà aplaties.
export interface OptionCamion {
  id: string;
  nom: string;
  immatTracteur: string;
}

export interface OptionChauffeur {
  id: string;
  nom: string;
}

interface SaisieLigne {
  cle: string;
  designation: string;
  uniteId: string;
  quantite: string;
  clientId: string;
}

export interface OptionUnite {
  id: string;
  nom: string;
  symbole: string;
}

export interface OptionClientVoyage {
  id: string;
  nom: string;
}

export interface LigneEditable {
  id: string;
  designation: string;
  uniteId: string;
  quantiteACharger: number | null;
  /** Destinataire, s'il diffère du client principal. */
  clientId: string | null;
}

export interface VoyageEditable {
  id: string;
  reference: string;
  camionId: string;
  chauffeurId: string;
  paysDepartId: string | null;
  villeDepart: string;
  paysArriveeId: string | null;
  villeArrivee: string;
  clientId: string | null;
  /** Trajet à vide servant à aller chercher la marchandise du client. */
  vaChercher: boolean;
  /** Marchandises déjà déclarées, avec leur unité. */
  marchandises: LigneEditable[];
  distanceKm: number | null;
  dateDepart: string;
  aVide: boolean;
  recette: number;
  devise: "GNF" | "XOF";
  recetteGnf: number;
  nbRotations: number;
  tarifRotation: number | null;
  statut: string;
}

interface Props {
  camions: OptionCamion[];
  chauffeurs: OptionChauffeur[];
  /** Taux de référence GNF pour 1 CFA — pré-remplissage uniquement. */
  tauxReferenceXof: number | null;
  unites: OptionUnite[];
  clients: OptionClientVoyage[];
  /** Pays proposés, tenus par l'exploitation. Le premier sert de défaut. */
  pays: { id: string; nom: string }[];
  voyage?: VoyageEditable | null;
  declencheur: React.ReactNode;
}

const jour = (date: string | null | undefined) => date ?? new Date().toISOString().slice(0, 10);

export function DialogueVoyage({ pays, unites, clients, camions, chauffeurs, tauxReferenceXof, voyage, declencheur }: Props) {
  // Le pays du siège est en tête de liste : c'est le cas courant.
  const paysDefaut = pays[0]?.id ?? "";

  const [ouvert, setOuvert] = useState(false);
  const edition = !!voyage;

  const action = edition
    ? modifierVoyage.bind(null, voyage.id)
    : (creerVoyage as (e: EtatFormulaire, d: FormData) => Promise<EtatFormulaire>);
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(action, {});

  // Champs contrôlés : ils pilotent la suggestion et l'équivalent GNF.
  const [depart, setDepart] = useState(voyage?.villeDepart ?? "");
  const [arrivee, setArrivee] = useState(voyage?.villeArrivee ?? "");
  const [devise, setDevise] = useState<"GNF" | "XOF">(voyage?.devise ?? "GNF");
  const [recette, setRecette] = useState(voyage ? String(voyage.recette) : "");
  const [recetteGnf, setRecetteGnf] = useState(voyage ? String(voyage.recetteGnf) : "");
  const [aVide, setAVide] = useState(voyage?.aVide ?? false);
  const [vaChercher, setVaChercher] = useState(voyage?.vaChercher ?? false);

  // Les marchandises sont éditées en liste. Chaque ligne garde une clé stable :
  // sans elle, React réutiliserait les champs d'une ligne supprimée et le
  // contenu se décalerait d'un cran.
  const compteur = useRef(0);
  const [lignes, setLignes] = useState<SaisieLigne[]>(() =>
    (voyage?.marchandises ?? []).map((l) => ({
      cle: l.id,
      designation: l.designation,
      uniteId: l.uniteId,
      quantite: l.quantiteACharger != null ? String(l.quantiteACharger) : "",
      clientId: l.clientId ?? "",
    })),
  );

  const majLigne = (i: number, champs: Partial<SaisieLigne>) =>
    setLignes((xs) => xs.map((x, j) => (j === i ? { ...x, ...champs } : x)));
  const [distanceKm, setDistanceKm] = useState(voyage?.distanceKm ? String(voyage.distanceKm) : "");
  // Bennes : une mission = une journée de rotations sur le même trajet.
  const [nbRotations, setNbRotations] = useState(String(voyage?.nbRotations ?? 1));
  const [tarifRotation, setTarifRotation] = useState(
    voyage?.tarifRotation != null ? String(voyage.tarifRotation) : "",
  );

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [chargement, demarrer] = useTransition();

  // Le formulaire se referme dès que l'action a réussi.
  useEffect(() => {
    if (etat.ok) {
      setOuvert(false);
      setSuggestion(null);
    }
  }, [etat.ok]);

  // Après un refus de validation, on remet dans les champs contrôlés ce que
  // l'utilisateur avait saisi — sinon il perdrait tout sauf le champ fautif.
  useEffect(() => {
    const v = etat.valeurs;
    if (!v) return;
    setDepart(v.villeDepart ?? "");
    setArrivee(v.villeArrivee ?? "");
    setDevise(v.devise === "XOF" ? "XOF" : "GNF");
    setRecette(v.recette ?? "");
    setRecetteGnf(v.recetteGnf ?? "");
    setAVide(v.aVide === "true");
    setVaChercher(v.vaChercher === "true");
    setDistanceKm(v.distanceKm ?? "");
    setNbRotations(v.nbRotations ?? "1");
    setTarifRotation(v.tarifRotation ?? "");
  }, [etat.valeurs]);

  // Interroge l'historique quand les deux villes sont renseignées.
  useEffect(() => {
    if (!ouvert || depart.trim().length < 3 || arrivee.trim().length < 3) {
      setSuggestion(null);
      return;
    }
    const minuteur = setTimeout(() => {
      demarrer(async () => setSuggestion(await proposerDepuisHistorique(depart, arrivee)));
    }, 400);
    return () => clearTimeout(minuteur);
  }, [ouvert, depart, arrivee]);

  // Pré-remplit l'équivalent GNF au dernier taux connu — l'utilisateur corrige
  // ensuite avec le taux réellement pratiqué (règle multi-devise de CLAUDE.md).
  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const montant = Number(recette.replace(",", "."));
    if (Number.isFinite(montant) && montant > 0) {
      setRecetteGnf(String(Math.round(montant * tauxReferenceXof)));
    }
  }, [devise, recette, tauxReferenceXof]);

  const err = (champ: string) => etat.champs?.[champ];
  /** Valeur à réafficher : celle refusée par la validation, sinon celle d'origine. */
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;

  // Recette dérivée du tarif × rotations — le champ passe alors en lecture seule
  // pour qu'il ne puisse pas diverger de son calcul.
  const tarifNum = Number(tarifRotation.replace(",", "."));
  const rotationsNum = Math.max(Math.round(Number(nbRotations)) || 1, 1);
  const recetteCalculee =
    Number.isFinite(tarifNum) && tarifNum > 0 ? String(tarifNum * rotationsNum) : null;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[560px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? `Modifier ${voyage.reference}` : "Nouveau voyage"}</DialogTitle>
        </DialogHeader>

            <form action={envoyer}>
              <div className="modal-corps">
                {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

                <div className="form-grid">
                  <Champ label="Camion" erreur={err("camionId")}>
                    <select name="camionId" key={val("camionId", voyage?.camionId ?? "")} defaultValue={val("camionId", voyage?.camionId ?? "")} required>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {camions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom} — {c.immatTracteur}
                        </option>
                      ))}
                    </select>
                  </Champ>

                  <Champ label="Chauffeur" erreur={err("chauffeurId")}>
                    <select name="chauffeurId" key={val("chauffeurId", voyage?.chauffeurId ?? "")} defaultValue={val("chauffeurId", voyage?.chauffeurId ?? "")} required>
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {chauffeurs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>

                  <Champ label="Pays de départ">
                    <select name="paysDepartId" key={val("paysDepartId", voyage?.paysDepartId ?? paysDefaut)} defaultValue={val("paysDepartId", voyage?.paysDepartId ?? paysDefaut)}>
                      {pays.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>

                  <Champ label="Ville de départ" erreur={err("villeDepart")}>
                    <input
                      name="villeDepart"
                      value={depart}
                      onChange={(e) => setDepart(e.target.value)}
                      required
                    />
                  </Champ>

                  <Champ label="Pays d'arrivée">
                    <select name="paysArriveeId" key={val("paysArriveeId", voyage?.paysArriveeId ?? paysDefaut)} defaultValue={val("paysArriveeId", voyage?.paysArriveeId ?? paysDefaut)}>
                      {pays.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>

                  <Champ label="Ville d'arrivée" erreur={err("villeArrivee")}>
                    <input
                      name="villeArrivee"
                      value={arrivee}
                      onChange={(e) => setArrivee(e.target.value)}
                      required
                    />
                  </Champ>
                </div>

                {/* Suggestion issue des trajets passés (sens inverse compris) */}
                {chargement ? (
                  <p className="mt-1 text-[11.5px] text-[var(--muted-2)]">Recherche dans l&apos;historique…</p>
                ) : suggestion?.trouve ? (
                  <div className="note mt-2 mb-3">
                    <IconeInfo strokeWidth={2} />
                    <span>
                      <b>
                        {suggestion.occurrences} trajet{suggestion.occurrences > 1 ? "s" : ""} similaire
                        {suggestion.occurrences > 1 ? "s" : ""}
                      </b>
                      {suggestion.inverseInclus ? " (sens inverse compris)" : ""} —{" "}
                      {formatNombre(suggestion.distanceMoyKm)} km, {formatNombre(suggestion.carburantMoyL)} L
                      {suggestion.consoMoyL100 > 0
                        ? ` (${formatDecimal(suggestion.consoMoyL100)} L/100)`
                        : ""}
                      {suggestion.recetteMoyGnf
                        ? `, recette moyenne ${formatNombre(suggestion.recetteMoyGnf)} GNF`
                        : ""}
                      .{" "}
                      <button
                        type="button"
                        className="link bg-transparent border-0 p-0 font-semibold"
                        onClick={() => {
                          setDistanceKm(String(suggestion.distanceMoyKm));
                          if (suggestion.recetteMoyGnf && devise === "GNF") {
                            setRecette(String(suggestion.recetteMoyGnf));
                          }
                        }}
                      >
                        Reprendre ces valeurs
                      </button>
                    </span>
                  </div>
                ) : null}

                <div className="form-grid">
                  {/* Le client est choisi dans la liste, plus saisi à la main :
                      deux orthographes créaient deux clients, et la fiche
                      client ne retrouvait plus ses missions. */}
                  <Champ label="Client" erreur={err("clientId")}>
                    <select
                      name="clientId"
                      key={val("clientId", voyage?.clientId ?? "")}
                      defaultValue={val("clientId", voyage?.clientId ?? "")}
                    >
                      <option value="">— Aucun —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                    {clients.length === 0 ? (
                      <span className="text-[11px] text-[var(--muted-2)]">
                        Aucun client enregistré : créez-le d&apos;abord depuis l&apos;écran Clients.
                      </span>
                    ) : null}
                  </Champ>

                  <Champ label="Distance (km)">
                    <input
                      name="distanceKm"
                      inputMode="numeric"
                      value={distanceKm}
                      onChange={(e) => setDistanceKm(e.target.value)}
                    />
                  </Champ>

                  <Champ label="Date de départ" erreur={err("dateDepart")}>
                    <input type="date" name="dateDepart" key={val("dateDepart", jour(voyage?.dateDepart))} defaultValue={val("dateDepart", jour(voyage?.dateDepart))} required />
                  </Champ>

                  <Champ label="État">
                    <select name="statut" key={val("statut", voyage?.statut ?? "PLANIFIE")} defaultValue={val("statut", voyage?.statut ?? "PLANIFIE")}>
                      <option value="PLANIFIE">Planifié</option>
                      <option value="EN_ATTENTE_CHARGEMENT">En attente de chargement</option>
                      <option value="EN_COURS">En cours</option>
                      <option value="ARRIVE_DESTINATION">Arrivé à destination</option>
                      <option value="EN_DECHARGEMENT">En déchargement</option>
                      <option value="TERMINE">Terminé</option>
                    </select>
                  </Champ>

                  <div className="full">
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                      <input
                        type="checkbox"
                        name="aVide"
                        value="true"
                        checked={aVide}
                        onChange={(e) => setAVide(e.target.checked)}
                      />
                      Trajet <b>à vide</b> (aucun chargement au départ)
                    </label>

                    {/* Un aller à vide n'est pas forcément un trajet perdu :
                        il peut servir à aller chercher la marchandise d'un
                        client, auquel cas la course lui est imputable. */}
                    {aVide ? (
                      <label className="ml-6 flex cursor-pointer items-center gap-2 text-[12.5px]">
                        <input
                          type="checkbox"
                          name="vaChercher"
                          value="true"
                          checked={vaChercher}
                          onChange={(e) => setVaChercher(e.target.checked)}
                        />
                        On part <b>chercher</b> la marchandise du client ci-dessus
                      </label>
                    ) : null}
                  </div>

                  {/* Marchandises : un même trajet en porte souvent plusieurs,
                      dans des unités différentes et parfois pour des
                      destinataires différents. */}
                  {!aVide ? (
                    <div className="full">
                      <div className="lignes-tete">
                        <span>Marchandises</span>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            setLignes((l) => [
                              ...l,
                              { cle: `n${compteur.current++}`, designation: "", uniteId: unites[0]?.id ?? "", quantite: "", clientId: "" },
                            ])
                          }
                        >
                          + Ajouter une marchandise
                        </button>
                      </div>

                      {lignes.length === 0 ? (
                        <p className="ph-aide">
                          Aucune marchandise déclarée. Ajoutez-en une pour suivre les quantités
                          chargées, reçues et livrées.
                        </p>
                      ) : null}

                      {lignes.map((l, i) => (
                        <div key={l.cle} className="ligne-marchandise">
                          {/* L'identifiant permet de conserver, à la modification,
                              les quantités reçues/livrées et les prélèvements de
                              douane déjà rattachés à cette marchandise. */}
                          <input type="hidden" name="ligneId" value={l.cle.startsWith("n") ? "" : l.cle} />
                          <input
                            name="ligneDesignation"
                            placeholder="Désignation (riz, ciment, produits frais…)"
                            value={l.designation}
                            onChange={(e) => majLigne(i, { designation: e.target.value })}
                            aria-label={`Marchandise ${i + 1}`}
                          />
                          <input
                            name="ligneQuantite"
                            inputMode="decimal"
                            placeholder="Quantité"
                            value={l.quantite}
                            onChange={(e) => majLigne(i, { quantite: e.target.value })}
                            aria-label={`Quantité ${i + 1}`}
                          />
                          <select
                            name="ligneUniteId"
                            value={l.uniteId}
                            onChange={(e) => majLigne(i, { uniteId: e.target.value })}
                            aria-label={`Unité ${i + 1}`}
                          >
                            {unites.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.symbole}
                              </option>
                            ))}
                          </select>
                          <select
                            name="ligneClientId"
                            value={l.clientId}
                            onChange={(e) => majLigne(i, { clientId: e.target.value })}
                            aria-label={`Destinataire ${i + 1}`}
                          >
                            <option value="">Client du voyage</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nom}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => setLignes((xs) => xs.filter((_, j) => j !== i))}
                            aria-label={`Retirer la marchandise ${i + 1}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {err("lignes") ? <p className="text-[11.5px] text-[var(--neg)]">{err("lignes")}</p> : null}
                    </div>
                  ) : null}

                  <Champ
                    label="Rotations"
                    aide="1 pour un transport classique. Pour une benne : nombre d'allers-retours sur ce trajet."
                  >
                    <input
                      name="nbRotations"
                      inputMode="numeric"
                      value={nbRotations}
                      onChange={(e) => setNbRotations(e.target.value)}
                      disabled={aVide}
                    />
                  </Champ>

                  <Champ
                    label="Tarif par rotation"
                    aide="Si renseigné, la recette se calcule automatiquement."
                  >
                    <input
                      name="tarifRotation"
                      inputMode="decimal"
                      value={tarifRotation}
                      onChange={(e) => setTarifRotation(e.target.value)}
                      disabled={aVide}
                    />
                  </Champ>

                  <Champ label="Recette">
                    <input
                      name="recette"
                      inputMode="decimal"
                      value={recetteCalculee ?? recette}
                      onChange={(e) => setRecette(e.target.value)}
                      disabled={aVide || recetteCalculee !== null}
                    />
                  </Champ>

                  <Champ label="Devise">
                    {/* `key` force le remontage : un <select> contrôlé se
                        désynchronise quand l'état est restauré après un refus
                        de validation — la devise repasserait à GNF alors que
                        les montants restent en CFA. */}
                    <select
                      name="devise"
                      key={devise}
                      defaultValue={devise}
                      onChange={(e) => setDevise(e.target.value as "GNF" | "XOF")}
                      disabled={aVide}
                    >
                      <option value="GNF">GNF — franc guinéen</option>
                      <option value="XOF">CFA — franc XOF</option>
                    </select>
                  </Champ>

                  {devise === "XOF" && !aVide ? (
                    <div className="full">
                      <Champ
                        label="Équivalent réel en GNF"
                        erreur={err("recetteGnf")}
                        aide={
                          tauxReferenceXof
                            ? `Pré-rempli au dernier taux connu (1 CFA ≈ ${formatDecimal(tauxReferenceXof, 2)} GNF). Corrige avec le taux réellement pratiqué.`
                            : "Saisir le montant réellement obtenu en GNF."
                        }
                      >
                        <input
                          name="recetteGnf"
                          inputMode="numeric"
                          value={recetteGnf}
                          onChange={(e) => setRecetteGnf(e.target.value)}
                        />
                      </Champ>
                    </div>
                  ) : (
                    <input type="hidden" name="recetteGnf" value={devise === "GNF" ? recette : recetteGnf} />
                  )}
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Créer le voyage"}
    </button>
  );
}
