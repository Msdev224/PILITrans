"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerCamion, modifierCamion, type EtatCamion } from "@/actions/camions";
import { ChampTelephone } from "@/components/champ-telephone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LIBELLE_CARROSSERIE, LIBELLE_STATUT_CAMION, LIBELLE_TYPE_VEHICULE } from "@/lib/utils";
import { ChampPhoto } from "@/components/equipe/champ-photo";

export interface CamionEditable {
  id: string;
  nom: string;
  typeVehicule: string;
  carrosserie: string;
  refrigere: boolean;
  immatTracteur: string;
  immatRemorque: string | null;
  marqueTracteur: string | null;
  photo: string | null;
  telephoneBord1: string | null;
  telephoneBord2: string | null;
  marqueGroupeFroid: string | null;
  modeleGroupeFroid: string | null;
  heuresGroupeFroid: number;
  kilometrage: number;
  coutAcquisition: number | null;
  dateAcquisition: string | null;
  dureeAmortissementMois: number | null;
  statut: string;
}

interface Props {
  /** Carrosseries proposées : dépend du module transport de personnes. */
  carrosseries: string[];
  camion?: CamionEditable | null;
  /** Pays proposés pour les numéros, tenus dans l'écran Pays. */
  indicatifs: { code: string; libelle: string; longueur: number | null }[];
  declencheur: React.ReactNode;
}

export function DialogueCamion({ indicatifs, carrosseries, camion, declencheur }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!camion;

  const action = edition
    ? modifierCamion.bind(null, camion.id)
    : (creerCamion as (e: EtatCamion, d: FormData) => Promise<EtatCamion>);
  const [etat, envoyer] = useActionState<EtatCamion, FormData>(action, {});

  // Ces deux choix pilotent l'affichage des blocs conditionnels.
  const [carrosserie, setCarrosserie] = useState(camion?.carrosserie ?? "FRIGO");
  const [type, setType] = useState(camion?.typeVehicule ?? "TRACTEUR_REMORQUE");
  // Seule une caisse frigorifique a un groupe froid à suivre.
  const refrigere = carrosserie === "FRIGO";

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  useEffect(() => {
    const v = etat.valeurs;
    if (!v) return;
    setCarrosserie(v.carrosserie ?? "FRIGO");
    setType(v.typeVehicule ?? "TRACTEUR_REMORQUE");
  }, [etat.valeurs]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;
  const num = (v: number | null | undefined) => (v != null ? String(v) : "");

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[600px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? `Modifier ${camion.nom}` : "Ajouter un camion"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <Champ label="Nom du camion" erreur={err("nom")}>
                <input name="nom" required key={val("nom", camion?.nom ?? "")} defaultValue={val("nom", camion?.nom ?? "")} placeholder="PILI-04" />
              </Champ>

              <Champ label="Type de véhicule">
                <select name="typeVehicule" key={type} defaultValue={type} onChange={(e) => setType(e.target.value)}>
                  {Object.keys(LIBELLE_TYPE_VEHICULE).map((t) => (
                    <option key={t} value={t}>
                      {LIBELLE_TYPE_VEHICULE[t]}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="Immatriculation tracteur" erreur={err("immatTracteur")}>
                <input name="immatTracteur" required key={val("immatTracteur", camion?.immatTracteur ?? "")} defaultValue={val("immatTracteur", camion?.immatTracteur ?? "")} />
              </Champ>

              {type === "TRACTEUR_REMORQUE" ? (
                <Champ label="Immatriculation remorque" erreur={err("immatRemorque")}>
                  <input name="immatRemorque" key={val("immatRemorque", camion?.immatRemorque ?? "")} defaultValue={val("immatRemorque", camion?.immatRemorque ?? "")} />
                </Champ>
              ) : null}

              <Champ label="Marque du tracteur">
                <input name="marqueTracteur" key={val("marqueTracteur", camion?.marqueTracteur ?? "")} defaultValue={val("marqueTracteur", camion?.marqueTracteur ?? "")} />
              </Champ>

              <Champ label="État">
                <select name="statut" key={val("statut", camion?.statut ?? "DISPONIBLE")} defaultValue={val("statut", camion?.statut ?? "DISPONIBLE")}>
                  {Object.keys(LIBELLE_STATUT_CAMION).map((s) => (
                    <option key={s} value={s}>
                      {LIBELLE_STATUT_CAMION[s]}
                    </option>
                  ))}
                </select>
              </Champ>

              {/* Un chauffeur reconnaît son camion plus vite sur une image que
                  sur une immatriculation. */}
              <div className="full">
                <Champ label="Photo du véhicule" aide="Facultative. Réduite automatiquement.">
                  <ChampPhoto nom="photo" valeur={camion?.photo ?? null} />
                </Champ>
              </div>

              <Champ label="Téléphone de bord 1">
                <ChampTelephone
                  indicatifs={indicatifs}
                  nom="telephoneBord1"
                  key={val("telephoneBord1", camion?.telephoneBord1 ?? "")}
                  valeur={val("telephoneBord1", camion?.telephoneBord1 ?? "")}
                />
              </Champ>

              <Champ label="Téléphone de bord 2 (CFA)">
                <ChampTelephone
                  indicatifs={indicatifs}
                  nom="telephoneBord2"
                  key={val("telephoneBord2", camion?.telephoneBord2 ?? "")}
                  valeur={val("telephoneBord2", camion?.telephoneBord2 ?? "")}
                  indicatifDefaut="+221"
                />
              </Champ>

              <Champ label="Compteur (km)">
                <input name="kilometrage" inputMode="numeric" key={val("kilometrage", num(camion?.kilometrage))} defaultValue={val("kilometrage", num(camion?.kilometrage))} />
              </Champ>

              <Champ
                label="Carrosserie"
                aide="Ce que porte le véhicule — indépendant du châssis."
              >
                <select
                  name="carrosserie"
                  key={carrosserie}
                  defaultValue={carrosserie}
                  onChange={(e) => setCarrosserie(e.target.value)}
                >
                  {carrosseries.map((c) => (
                    <option key={c} value={c}>
                      {LIBELLE_CARROSSERIE[c]}
                    </option>
                  ))}
                </select>
              </Champ>

              {/* Sans groupe froid, ces champs n'ont pas lieu d'exister. */}
              {refrigere ? (
                <>
                  <Champ label="Marque du groupe froid">
                    <input name="marqueGroupeFroid" key={val("marqueGroupeFroid", camion?.marqueGroupeFroid ?? "")} defaultValue={val("marqueGroupeFroid", camion?.marqueGroupeFroid ?? "")} placeholder="Thermo King" />
                  </Champ>
                  <Champ label="Modèle du groupe froid">
                    <input name="modeleGroupeFroid" key={val("modeleGroupeFroid", camion?.modeleGroupeFroid ?? "")} defaultValue={val("modeleGroupeFroid", camion?.modeleGroupeFroid ?? "")} />
                  </Champ>
                  <Champ label="Groupe froid (heures)" aide="Le groupe froid se suit en heures, pas en km.">
                    <input name="heuresGroupeFroid" inputMode="numeric" key={val("heuresGroupeFroid", num(camion?.heuresGroupeFroid))} defaultValue={val("heuresGroupeFroid", num(camion?.heuresGroupeFroid))} />
                  </Champ>
                </>
              ) : null}

              <div className="full mt-1 border-t border-[var(--line-soft)] pt-3">
                <p className="mb-3 text-[11.5px] text-[var(--muted)]">
                  <b>Acquisition</b> — sert au suivi du remboursement de l&apos;investissement. Le prix d&apos;achat n&apos;est jamais déduit de la marge du mois.
                  Laisser vide si le camion n&apos;est pas amorti.
                </p>
                <div className="form-grid">
                  <Champ label="Coût d'acquisition (GNF)">
                    <input name="coutAcquisition" inputMode="numeric" key={val("coutAcquisition", num(camion?.coutAcquisition))} defaultValue={val("coutAcquisition", num(camion?.coutAcquisition))} />
                  </Champ>
                  <Champ label="Date d'acquisition">
                    <input type="date" name="dateAcquisition" key={val("dateAcquisition", camion?.dateAcquisition ?? "")} defaultValue={val("dateAcquisition", camion?.dateAcquisition ?? "")} />
                  </Champ>
                  <Champ label="Durée d'amortissement (mois)" erreur={err("dureeAmortissementMois")}>
                    <input name="dureeAmortissementMois" inputMode="numeric" key={val("dureeAmortissementMois", num(camion?.dureeAmortissementMois ?? 60))} defaultValue={val("dureeAmortissementMois", num(camion?.dureeAmortissementMois ?? 60))} />
                  </Champ>
                </div>
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter le camion"}
    </button>
  );
}
