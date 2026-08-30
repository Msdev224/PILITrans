"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerReparation, modifierReparation, type EtatReparation } from "@/actions/reparations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  formatDecimal,
  formatNombre,
  LIBELLE_CATEGORIE_REPARATION,
  LIBELLE_STATUT_REPARATION,
} from "@/lib/utils";

export interface OptionCamionReparation {
  id: string;
  nom: string;
  refrigere: boolean;
}

export interface ReparationEditable {
  id: string;
  camionId: string;
  categorie: string;
  description: string;
  garage: string | null;
  coutPieces: number;
  coutMainOeuvre: number;
  coutForfait: number;
  /** Détail des pièces, vide quand l'intervention n'a qu'un montant global. */
  pieces: {
    designation: string;
    coutAchat: number;
    coutReparation: number;
    auForfait: boolean;
  }[];
  devise: "GNF" | "XOF";
  coutTotalGnf: number;
  kilometrage: number | null;
  heuresGroupe: number | null;
  immobiliseDu: string | null;
  immobiliseAu: string | null;
  statut: string;
}

/** Une pièce telle qu'elle se saisit : des chaînes, pas encore des nombres. */
interface LigneSaisiePiece {
  cle: string;
  designation: string;
  achat: string;
  reparation: string;
  auForfait: boolean;
}

interface Props {
  /** Camion imposé — ouverture depuis une fiche camion. */
  camionId?: string;
  /** Le groupe froid ne se propose que sur un véhicule frigorifique. */
  refrigere?: boolean;
  /** Liste de camions — ouverture depuis l'écran transversal. */
  camions?: OptionCamionReparation[];
  tauxReferenceXof: number | null;
  reparation?: ReparationEditable | null;
  declencheur: React.ReactNode;
}

export function DialogueReparation({
  camionId,
  refrigere,
  camions,
  tauxReferenceXof,
  reparation,
  declencheur,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!reparation;

  // Camion sélectionnable si aucun n'est imposé par le contexte d'ouverture.
  const [camionChoisi, setCamionChoisi] = useState(camionId ?? reparation?.camionId ?? "");

  const action = edition
    ? modifierReparation.bind(null, reparation.id)
    : (creerReparation as (e: EtatReparation, d: FormData) => Promise<EtatReparation>);
  const [etat, envoyer] = useActionState<EtatReparation, FormData>(action, {});

  const [devise, setDevise] = useState<"GNF" | "XOF">(reparation?.devise ?? "GNF");
  const [pieces, setPieces] = useState(reparation ? String(reparation.coutPieces) : "");
  const [mainOeuvre, setMainOeuvre] = useState(reparation ? String(reparation.coutMainOeuvre) : "");

  /**
   * Détail des pièces.
   *
   * Vide par défaut : beaucoup d'interventions se notent d'un seul montant, et
   * imposer une ligne obligerait à la remplir ou à la retirer à chaque fois.
   */
  const [detail, setDetail] = useState<LigneSaisiePiece[]>(
    reparation?.pieces.map((p, i) => ({
      cle: `p${i}`,
      designation: p.designation,
      achat: p.coutAchat ? String(p.coutAchat) : "",
      reparation: p.coutReparation ? String(p.coutReparation) : "",
      auForfait: p.auForfait,
    })) ?? [],
  );
  const compteurPiece = useRef(1000);
  const majPiece = (i: number, champs: Partial<LigneSaisiePiece>) =>
    setDetail((l) => l.map((p, j) => (j === i ? { ...p, ...champs } : p)));

  const [forfait, setForfait] = useState(
    reparation?.coutForfait ? String(reparation.coutForfait) : "",
  );
  const auMoinsUnForfait = detail.some((p) => p.auForfait);
  const [coutTotalGnf, setCoutTotalGnf] = useState(reparation ? String(reparation.coutTotalGnf) : "");

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  useEffect(() => {
    const v = etat.valeurs;
    if (!v) return;
    setDevise(v.devise === "XOF" ? "XOF" : "GNF");
    setPieces(v.coutPieces ?? "");
    setMainOeuvre(v.coutMainOeuvre ?? "");
    setCoutTotalGnf(v.coutTotalGnf ?? "");
    if (v.camionId) setCamionChoisi(v.camionId);
  }, [etat.valeurs]);

  const nb = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;

  /**
   * Total des pièces.
   *
   * Dès qu'une pièce est listée, il se déduit du détail — achats, remises en
   * état chiffrées, forfait — et le champ libre passe en lecture seule : deux
   * saisies pour un même nombre finiraient par se contredire.
   */
  const totalPiecesDetaille =
    detail.reduce((t, p) => t + nb(p.achat) + (p.auForfait ? 0 : nb(p.reparation)), 0) + nb(forfait);
  const detailActif = detail.length > 0;
  const coutPiecesRetenu = detailActif ? totalPiecesDetaille : nb(pieces);

  const total = coutPiecesRetenu + nb(mainOeuvre);

  // Pré-remplissage au dernier taux connu ; le taux réel se corrige à la main.
  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof || total <= 0) return;
    setCoutTotalGnf(String(Math.round(total * tauxReferenceXof)));
  }, [devise, total, tauxReferenceXof]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;
  const num = (v: number | null | undefined) => (v != null ? String(v) : "");

  // Le groupe froid n'est proposé que si le camion retenu en possède un.
  const estFrigo =
    refrigere ?? camions?.find((c) => c.id === camionChoisi)?.refrigere ?? true;
  const categories = Object.keys(LIBELLE_CATEGORIE_REPARATION).filter(
    (c) => estFrigo || c !== "GROUPE_FROID",
  );

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[560px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? "Modifier la réparation" : "Nouvelle réparation"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          {camionId ? <input type="hidden" name="camionId" value={camionId} /> : null}

          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              {!camionId && camions ? (
                <div className="full">
                  <Champ label="Camion" erreur={err("camionId")}>
                    <select
                      name="camionId"
                      required
                      key={camionChoisi}
                      defaultValue={camionChoisi}
                      onChange={(e) => setCamionChoisi(e.target.value)}
                    >
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {camions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>
                </div>
              ) : null}

              <Champ label="Catégorie">
                <select name="categorie" key={val("categorie", reparation?.categorie ?? categories[0])} defaultValue={val("categorie", reparation?.categorie ?? categories[0])}>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {LIBELLE_CATEGORIE_REPARATION[c]}
                    </option>
                  ))}
                </select>
              </Champ>

              <Champ label="État">
                <select name="statut" key={val("statut", reparation?.statut ?? "A_FAIRE")} defaultValue={val("statut", reparation?.statut ?? "A_FAIRE")}>
                  {Object.keys(LIBELLE_STATUT_REPARATION).map((s) => (
                    <option key={s} value={s}>
                      {LIBELLE_STATUT_REPARATION[s]}
                    </option>
                  ))}
                </select>
              </Champ>

              <div className="full">
                <Champ label="Description" erreur={err("description")}>
                  <input name="description" required key={val("description", reparation?.description ?? "")} defaultValue={val("description", reparation?.description ?? "")} placeholder="Compresseur groupe froid" />
                </Champ>
              </div>

              <Champ label="Garage / mécanicien">
                <input name="garage" key={val("garage", reparation?.garage ?? "")} defaultValue={val("garage", reparation?.garage ?? "")} placeholder="Frigo-Service, Dakar" />
              </Champ>

              <Champ label="Devise">
                <select name="devise" key={devise} defaultValue={devise} onChange={(e) => setDevise(e.target.value as "GNF" | "XOF")}>
                  <option value="GNF">GNF — franc guinéen</option>
                  <option value="XOF">CFA — franc XOF</option>
                </select>
              </Champ>

              {/* --- Détail des pièces ---

                  Le garage mélange les deux façons de payer dans la même
                  facture : une pièce chiffrée à part, les autres dans un
                  montant global. Le formulaire suit ce qu'il fait plutôt que
                  d'imposer un découpage qui n'existe pas. */}
              <div className="full mt-1 border-t border-[var(--line-soft)] pt-3">
                <div className="lignes-tete">
                  <span>Pièces réparées ou remplacées</span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() =>
                      setDetail((l) => [
                        ...l,
                        { cle: `p${compteurPiece.current++}`, designation: "", achat: "", reparation: "", auForfait: false },
                      ])
                    }
                  >
                    + Ajouter une pièce
                  </button>
                </div>

                {detail.length === 0 ? (
                  <p className="text-[11.5px] text-[var(--muted-2)]">
                    Facultatif. Sans détail, la réparation se note d&apos;un seul montant, comme avant.
                  </p>
                ) : null}

                {detail.map((p, i) => (
                  <div key={p.cle} className="piece-ligne">
                    {/* La case cochée voyage en champ caché : une case décochée
                        n'est pas envoyée, et la colonne se décalerait — le
                        forfait tomberait sur la mauvaise pièce. */}
                    <input type="hidden" name="pieceAuForfait" value={p.auForfait ? "1" : "0"} />

                    <Champ label="Pièce">
                      <input
                        name="pieceDesignation"
                        value={p.designation}
                        onChange={(e) => majPiece(i, { designation: e.target.value })}
                        placeholder="Alternateur"
                      />
                    </Champ>

                    <Champ label="Achat">
                      <input
                        name="pieceAchat"
                        inputMode="decimal"
                        value={p.achat}
                        onChange={(e) => majPiece(i, { achat: e.target.value })}
                        placeholder="0"
                      />
                    </Champ>

                    <Champ label="Réparation">
                      <input
                        name="pieceReparation"
                        inputMode="decimal"
                        value={p.auForfait ? "" : p.reparation}
                        disabled={p.auForfait}
                        onChange={(e) => majPiece(i, { reparation: e.target.value })}
                        placeholder={p.auForfait ? "au forfait" : "0"}
                      />
                    </Champ>

                    <div className="piece-actions">
                      <label className="case-forfait">
                        <input
                          type="checkbox"
                          checked={p.auForfait}
                          onChange={(e) => majPiece(i, { auForfait: e.target.checked })}
                        />
                        <span>Au forfait</span>
                      </label>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setDetail((l) => l.filter((_, j) => j !== i))}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                ))}

                {auMoinsUnForfait ? (
                  <div className="mt-2">
                    <Champ
                      label="Forfait pour les pièces cochées"
                      aide="Le montant payé d'un bloc, sans détail par pièce — il reste tel quel, il n'est pas réparti."
                    >
                      <input
                        name="coutForfait"
                        inputMode="decimal"
                        value={forfait}
                        onChange={(e) => setForfait(e.target.value)}
                      />
                    </Champ>
                  </div>
                ) : (
                  <input type="hidden" name="coutForfait" value="0" />
                )}
              </div>

              <Champ
                label="Coût des pièces"
                aide={detailActif ? "Déduit du détail ci-dessus." : undefined}
              >
                {detailActif ? (
                  <input value={formatNombre(totalPiecesDetaille)} readOnly className="champ-deduit" />
                ) : (
                  <input name="coutPieces" inputMode="decimal" value={pieces} onChange={(e) => setPieces(e.target.value)} />
                )}
              </Champ>

              <Champ label="Main d'œuvre">
                <input name="coutMainOeuvre" inputMode="decimal" value={mainOeuvre} onChange={(e) => setMainOeuvre(e.target.value)} />
              </Champ>

              {devise === "XOF" ? (
                <div className="full">
                  <Champ
                    label="Équivalent réel en GNF"
                    erreur={err("coutTotalGnf")}
                    aide={
                      tauxReferenceXof
                        ? `Total saisi : ${formatNombre(total)} CFA. Pré-rempli au dernier taux connu (1 CFA ≈ ${formatDecimal(tauxReferenceXof, 2)} GNF) — corrige avec le taux réellement pratiqué.`
                        : undefined
                    }
                  >
                    <input name="coutTotalGnf" inputMode="numeric" value={coutTotalGnf} onChange={(e) => setCoutTotalGnf(e.target.value)} />
                  </Champ>
                </div>
              ) : (
                <input type="hidden" name="coutTotalGnf" value={String(total)} />
              )}

              <Champ label="Compteur (km)">
                <input name="kilometrage" inputMode="numeric" key={val("kilometrage", num(reparation?.kilometrage))} defaultValue={val("kilometrage", num(reparation?.kilometrage))} />
              </Champ>

              {refrigere ? (
                <Champ label="Heures groupe froid">
                  <input name="heuresGroupe" inputMode="numeric" key={val("heuresGroupe", num(reparation?.heuresGroupe))} defaultValue={val("heuresGroupe", num(reparation?.heuresGroupe))} />
                </Champ>
              ) : null}

              <Champ label="Immobilisé du">
                <input type="date" name="immobiliseDu" key={val("immobiliseDu", reparation?.immobiliseDu ?? "")} defaultValue={val("immobiliseDu", reparation?.immobiliseDu ?? "")} />
              </Champ>

              <Champ label="Immobilisé au" erreur={err("immobiliseAu")} aide="Les jours d'arrêt sont un coût caché : ils sont suivis.">
                <input type="date" name="immobiliseAu" key={val("immobiliseAu", reparation?.immobiliseAu ?? "")} defaultValue={val("immobiliseAu", reparation?.immobiliseAu ?? "")} />
              </Champ>
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter la réparation"}
    </button>
  );
}
