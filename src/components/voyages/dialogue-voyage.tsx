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
import { ChampRecherche } from "@/components/champ-recherche";
import { formatTelephone } from "@/lib/telephone";
import {
  LIBELLE_MOTIF_VOYAGE,
  LIBELLE_MOYEN_PAIEMENT,
  LIBELLE_TYPE_DEPENSE,
  MOTIFS_SANS_MARCHANDISE,
  OBJETS_REMISE,
} from "@/lib/utils";
import { ChampMontant } from "@/components/champ-montant";


// Les objets Prisma portent des Decimal, qui ne traversent pas la frontière
// serveur → client. Le formulaire reçoit donc des données déjà aplaties.
export interface OptionCamion {
  id: string;
  nom: string;
  immatTracteur: string;
  photo?: string | null;
}

export interface OptionChauffeur {
  id: string;
  nom: string;
  telephone?: string | null;
  photo?: string | null;
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
  ville?: string | null;
  telephone?: string | null;
  /** Ligne directe du contact : on a souvent ce numéro sans savoir à qui il est. */
  telephoneContact?: string | null;
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
  dateDepart: string;
  aVide: boolean;
  motif: string;
  remunererChauffeur: boolean;
  perDiemJournalierGnf: number | null;
  remunerationChauffeur: number | null;
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

/** Une somme remise au chauffeur, telle qu'elle se saisit dans le formulaire. */
interface LigneRemiseSaisie {
  cle: string;
  /** Ce que la somme doit couvrir : nourriture, gasoil, réparation… */
  objet: string;
  montant: string;
  devise: string;
  /** Équivalent GNF, saisi au taux réel quand la remise est en CFA. */
  montantGnf: string;
  /** Nourriture seulement : ce que coûte chaque jour de mission. */
  parJour: string;
}

export function DialogueVoyage({ pays, unites, clients, camions, chauffeurs, tauxReferenceXof, voyage, declencheur }: Props) {
  // Le pays du siège est en tête de liste : c'est le cas courant.
  const paysDefaut = pays[0]?.id ?? "";

  const [ouvert, setOuvert] = useState(false);
  const edition = !!voyage;
  /**
   * Sommes remises au chauffeur au départ, ventilées par objet.
   *
   * Une seule ligne au départ — la nourriture, qui est la remise la plus
   * constante. Le gérant en ajoute autant qu'il en donne.
   */
  const [remises, setRemises] = useState<LigneRemiseSaisie[]>([
    { cle: "r0", objet: "PER_DIEM", montant: "", devise: "GNF", montantGnf: "", parJour: "" },
  ]);
  const compteurRemise = useRef(1);
  const majRemise = (index: number, champs: Partial<LigneRemiseSaisie>) =>
    setRemises((l) => l.map((r, i) => (i === index ? { ...r, ...champs } : r)));

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
  const [motif, setMotif] = useState(voyage?.motif ?? "TRANSPORT");
  const [remunerer, setRemunerer] = useState(voyage?.remunererChauffeur ?? true);
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
                    <ChampRecherche
                      nom="camionId"
                      requis
                      placeholder="Nom ou immatriculation…"
                      valeur={val("camionId", voyage?.camionId ?? "")}
                      options={camions.map((c) => ({
                        id: c.id,
                        libelle: c.nom,
                        detail: c.immatTracteur,
                        recherche: c.immatTracteur,
                        photo: c.photo,
                      }))}
                    />
                  </Champ>

                  <Champ label="Chauffeur" erreur={err("chauffeurId")}>
                    <ChampRecherche
                      nom="chauffeurId"
                      requis
                      placeholder="Nom ou téléphone…"
                      valeur={val("chauffeurId", voyage?.chauffeurId ?? "")}
                      options={chauffeurs.map((c) => ({
                        id: c.id,
                        libelle: c.nom,
                        detail: c.telephone ? formatTelephone(c.telephone) : null,
                        recherche: c.telephone,
                        photo: c.photo,
                      }))}
                    />
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
                          // La distance ne se reprend plus : elle se relève sur
                          // la route. Seul le forfait pratiqué est réutilisable.
                          if (suggestion.recetteMoyGnf && devise === "GNF") {
                            setRecette(String(suggestion.recetteMoyGnf));
                          }
                        }}
                      >
                        Reprendre ce montant
                      </button>
                    </span>
                  </div>
                ) : null}

                <div className="form-grid">
                  {/* Le client est choisi dans la liste, plus saisi à la main :
                      deux orthographes créaient deux clients, et la fiche
                      client ne retrouvait plus ses missions. */}
                  <Champ label="Client" erreur={err("clientId")}>
                    <ChampRecherche
                      nom="clientId"
                      placeholder="Raison sociale, ville ou numéro…"
                      vide="— Aucun client —"
                      valeur={val("clientId", voyage?.clientId ?? "")}
                      options={clients.map((c) => ({
                        id: c.id,
                        libelle: c.nom,
                        detail: [c.ville, c.telephone ? formatTelephone(c.telephone) : null]
                          .filter(Boolean)
                          .join(" · "),
                        // Le numéro du contact est cherché sans être affiché :
                        // on l'a souvent sous les yeux sans savoir à quel client il
                        // se rattache.
                        recherche: [c.telephone, c.telephoneContact].filter(Boolean).join(" "),
                      }))}
                    />
                    {clients.length === 0 ? (
                      <span className="text-[11px] text-[var(--muted-2)]">
                        Aucun client enregistré : créez-le d&apos;abord depuis l&apos;écran Clients.
                      </span>
                    ) : null}
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

                  {/* Toutes les missions ne transportent pas : on roule aussi
                      pour l'atelier ou pour repositionner le camion. Ce choix
                      commande le reste — une course d'atelier ne se facture ni
                      ne se rémunère comme un transport. */}
                  <Champ label="Motif de la mission">
                    <select
                      name="motif"
                      key={motif}
                      defaultValue={motif}
                      onChange={(e) => {
                        const m = e.target.value;
                        setMotif(m);
                        // Un aller d'atelier part forcément à vide et ne se
                        // rémunère pas par défaut : on l'applique plutôt que
                        // de laisser l'utilisateur y penser.
                        if (MOTIFS_SANS_MARCHANDISE.includes(m)) {
                          setAVide(true);
                          setRemunerer(false);
                        }
                      }}
                    >
                      {Object.keys(LIBELLE_MOTIF_VOYAGE).map((m) => (
                        <option key={m} value={m}>
                          {LIBELLE_MOTIF_VOYAGE[m]}
                        </option>
                      ))}
                    </select>
                  </Champ>

                  {/* À la création, ce montant se saisit sur la ligne de
                      remise « nourriture », à côté du total remis : deux
                      champs pour la même valeur finiraient par diverger. */}
                  {edition ? (
                    <Champ
                      label="Indemnité de nourriture (GNF/jour)"
                      aide="Comptée par jour de mission. Vide : le barème du chauffeur s'applique."
                    >
                      <input
                        name="perDiemJournalierGnf"
                        inputMode="numeric"
                        key={val("perDiemJournalierGnf", voyage?.perDiemJournalierGnf != null ? String(voyage.perDiemJournalierGnf) : "")}
                        defaultValue={val("perDiemJournalierGnf", voyage?.perDiemJournalierGnf != null ? String(voyage.perDiemJournalierGnf) : "")}
                      />
                    </Champ>
                  ) : null}

                  <div className="full">
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                      <input
                        type="checkbox"
                        name="remunererChauffeur"
                        value="true"
                        checked={remunerer}
                        onChange={(e) => setRemunerer(e.target.checked)}
                      />
                      Le chauffeur est <b>rémunéré</b> pour cette mission
                    </label>
                    {!remunerer ? (
                      <p className="aide-role">
                        Il ne touchera que ses frais de route et son indemnité de nourriture.
                        Sans cette case, l&apos;application appliquerait son forfait et la mission
                        paraîtrait lourdement déficitaire.
                      </p>
                    ) : (
                      <Champ
                        label="Paie de la mission (GNF)"
                        aide="Facultatif. Vide : le mode de rémunération du chauffeur s'applique."
                      >
                        <input
                          name="remunerationChauffeur"
                          inputMode="numeric"
                          key={val("remunerationChauffeur", voyage?.remunerationChauffeur != null ? String(voyage.remunerationChauffeur) : "")}
                          defaultValue={val("remunerationChauffeur", voyage?.remunerationChauffeur != null ? String(voyage.remunerationChauffeur) : "")}
                        />
                      </Champ>
                    )}
                  </div>

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

                  {/* Ce que le gérant remet de la main à la main en lançant
                      la mission, ventilé par objet. Saisi ici parce que c'est
                      là que ça se passe : renvoyé à plus tard, cet argent
                      n'était jamais enregistré et la trésorerie affichait un
                      solde trop élevé.
                      À la création seulement — les compléments en cours de
                      route se corrigent depuis l'écran Caisse. */}
                  {!edition ? (
                    <div className="full mt-1 border-t border-[var(--line-soft)] pt-3">
                      <div className="lignes-tete">
                        <span>Remis au chauffeur au départ</span>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            setRemises((l) => [
                              ...l,
                              { cle: `r${compteurRemise.current++}`, objet: "DIVERS", montant: "", devise: "GNF", montantGnf: "", parJour: "" },
                            ])
                          }
                        >
                          + Ajouter une somme
                        </button>
                      </div>

                      <p className="mb-3 text-[11.5px] text-[var(--muted)]">
                        Facultatif. Chaque somme est rattachée à ce qu&apos;elle doit couvrir :
                        le chauffeur verra ce détail dans sa caisse et saura ce qu&apos;il a à
                        justifier. L&apos;argent entre dans sa caisse ; le carburant est une
                        dépense du camion.
                      </p>

                      {remises.map((r, i) => (
                        <div key={r.cle} className="ligne-remise">
                          <div className="form-grid">
                            <Champ label="Pour quoi">
                              <select
                                name="remiseObjet"
                                value={r.objet}
                                onChange={(e) => majRemise(i, { objet: e.target.value })}
                              >
                                {OBJETS_REMISE.map((o) => (
                                  <option key={o} value={o}>
                                    {LIBELLE_TYPE_DEPENSE[o]}
                                  </option>
                                ))}
                              </select>
                            </Champ>

                            <Champ label="Devise">
                              <select
                                name="remiseDevise"
                                value={r.devise}
                                onChange={(e) => majRemise(i, { devise: e.target.value })}
                              >
                                <option value="GNF">GNF</option>
                                <option value="XOF">CFA (XOF)</option>
                              </select>
                            </Champ>

                            <Champ label={`Montant remis (${r.devise === "GNF" ? "GNF" : "CFA"})`}>
                              <ChampMontant
                                nom="remiseMontant"
                                devise={r.devise === "GNF" ? "GNF" : "XOF"}
                                valeur={r.montant}
                                onChange={(v) => majRemise(i, { montant: v })}
                              />
                            </Champ>

                            {/* Le taux varie d'un jour à l'autre : l'équivalent réel
                                est saisi, jamais calculé. */}
                            {r.devise !== "GNF" ? (
                              <Champ label="Équivalent en GNF" aide="Ce que cette somme vaut réellement aujourd'hui.">
                                <ChampMontant
                                  nom="remiseMontantGnf"
                                  devise="GNF"
                                  valeur={r.montantGnf}
                                  onChange={(v) => majRemise(i, { montantGnf: v })}
                                />
                              </Champ>
                            ) : (
                              <input type="hidden" name="remiseMontantGnf" value="" />
                            )}

                            {/* La nourriture se remet en bloc mais se compte au
                                jour : le total dit ce qu'il a reçu, le taux
                                journalier ce que la mission supporte. */}
                            {r.objet === "PER_DIEM" ? (
                              <Champ
                                label="Dont par jour (GNF)"
                                aide="Le total ci-contre est ce qu'il emporte ; ce montant est ce que coûte chaque jour de mission."
                              >
                                <input
                                  name="perDiemJournalierGnf"
                                  inputMode="numeric"
                                  value={r.parJour}
                                  onChange={(e) => majRemise(i, { parJour: e.target.value })}
                                />
                              </Champ>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => setRemises((l) => l.filter((_, j) => j !== i))}
                          >
                            Retirer
                          </button>
                        </div>
                      ))}

                      <div className="form-grid mt-2">
                        <Champ label="Comment l'argent a été remis">
                          <select name="avanceMoyen" defaultValue="ESPECES">
                            {Object.keys(LIBELLE_MOYEN_PAIEMENT).map((m) => (
                              <option key={m} value={m}>
                                {LIBELLE_MOYEN_PAIEMENT[m]}
                              </option>
                            ))}
                          </select>
                        </Champ>

                        <Champ label="Référence du transfert" aide="Facultative.">
                          <input name="avanceReference" />
                        </Champ>

                        <Champ
                          label="Frais de transfert (GNF)"
                          aide="Commission de l'opérateur, comptée une seule fois. Elle sort de la caisse sans être remise au chauffeur."
                        >
                          <input name="avanceFraisGnf" inputMode="numeric" />
                        </Champ>

                        <Champ label="Carburant remis (litres)">
                          <input name="carburantLitres" inputMode="decimal" />
                        </Champ>

                        <Champ
                          label="Valeur du carburant (GNF)"
                          aide="Enregistré comme dépense de gasoil sur cette mission, pas comme argent à justifier."
                        >
                          <input name="carburantMontantGnf" inputMode="numeric" />
                        </Champ>
                      </div>
                    </div>
                  ) : null}

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

                  {/* Le gérant ne connaît qu'un chiffre au départ : ce qu'il
                      facture au client. La recette de la mission en découle,
                      et la facture reprendra ce montant — un seul nombre à
                      saisir, donc un seul endroit où se tromper.
                      Le montant est relu en toutes lettres : les écrans parlent
                      en millions, ce champ attend des francs, et 46,5 saisi à
                      la place de 50 000 000 passait inaperçu. */}
                  <Champ
                    label="Montant facturé au client"
                    aide={
                      recetteCalculee !== null
                        ? "Calculé : tarif par rotation × nombre de rotations."
                        : "Le forfait convenu. C'est la recette de la mission, et le montant repris sur la facture."
                    }
                  >
                    <ChampMontant
                      nom="recette"
                      key={`recette-${recetteCalculee ?? ""}`}
                      valeur={recetteCalculee ?? recette}
                      devise={devise}
                      desactive={aVide || recetteCalculee !== null}
                      onChange={setRecette}
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
