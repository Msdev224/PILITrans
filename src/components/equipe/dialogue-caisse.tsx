"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { enregistrerMouvementCaisse, type EtatCaisse } from "@/actions/caisse";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LIBELLE_TYPE_DEPENSE, OBJETS_REMISE, formatDecimal, formatNombre } from "@/lib/utils";
import { ChampMontant } from "@/components/champ-montant";

/**
 * Mouvement de caisse. Jusqu'ici seules les dépenses du terrain existaient :
 * la caisse ne pouvait que descendre. L'avance et le remboursement la rendent
 * cohérente.
 */
const LIBELLE_TYPE: Record<string, { titre: string; aide: string }> = {
  AVANCE: { titre: "Avance", aide: "Argent remis au chauffeur — augmente son solde." },
  REMBOURSEMENT: { titre: "Remboursement", aide: "Reliquat rendu par le chauffeur — réduit son solde." },
};

/**
 * La dépense ne figure pas dans cette liste.
 *
 * Sortir de l'argent de la caisse sans le rattacher à un camion le rend
 * invisible dans la rentabilité : le solde du chauffeur baisse, mais la marge
 * du véhicule reste inchangée alors que l'argent a bien servi au voyage. Une
 * dépense se saisit donc depuis l'écran Dépenses, où elle porte son type et
 * son rattachement, avec la case « payée sur la caisse du chauffeur ».
 */

export function DialogueCaisse({
  chauffeurId,
  nom,
  soldeGnf,
  soldeXof,
  tauxReferenceXof,
  missions,
  moyens,
  voyageImpose,
  declencheur,
}: {
  chauffeurId: string;
  nom: string;
  soldeGnf: number;
  soldeXof: number;
  tauxReferenceXof: number | null;
  /** Missions en cours de ce chauffeur, pour rattacher l'avance. */
  missions: { id: string; libelle: string }[];
  /** Moyens de paiement actifs, tenus dans Configuration. */
  moyens: { id: string; nom: string }[];
  /**
   * Mission imposée : ouvert depuis une fiche mission, le rattachement est
   * déjà connu et ne se choisit pas.
   */
  voyageImpose?: string;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatCaisse, FormData>(enregistrerMouvementCaisse, {});

  const [type, setType] = useState("AVANCE");
  const [devise, setDevise] = useState<"GNF" | "XOF">("GNF");
  const [montant, setMontant] = useState("");
  const [montantGnf, setMontantGnf] = useState("");

  useEffect(() => {
    if (etat.ok) {
      setOuvert(false);
      setMontant("");
    }
  }, [etat.ok]);

  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const valeur = Number(montant.replace(",", "."));
    if (Number.isFinite(valeur) && valeur > 0) {
      setMontantGnf(String(Math.round(valeur * tauxReferenceXof)));
    }
  }, [devise, montant, tauxReferenceXof]);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-w-[460px] gap-0 p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>Caisse — {nom}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <input type="hidden" name="chauffeurId" value={chauffeurId} />

          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="mb-4 text-[12.5px] text-[var(--muted)]">
              Solde détenu :{" "}
              <b className="mono text-[var(--ink)]">{formatNombre(soldeGnf)} GNF</b>
              {soldeXof !== 0 ? (
                <>
                  {" + "}
                  <b className="mono text-[var(--intl)]">{formatNombre(soldeXof)} CFA</b>
                </>
              ) : null}
            </div>

            <div className="form-grid">
              <div className="full">
                <div className="field">
                  <label>Nature du mouvement</label>
                  <select name="type" key={type} defaultValue={type} onChange={(e) => setType(e.target.value)}>
                    {Object.keys(LIBELLE_TYPE).map((t) => (
                      <option key={t} value={t}>
                        {LIBELLE_TYPE[t].titre}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[var(--muted-2)]">{LIBELLE_TYPE[type]?.aide}</span>
                </div>
              </div>

              <div className="field">
                <label>Montant</label>
                <ChampMontant nom="montant" valeur={montant} devise={devise} requis onChange={setMontant} />
                {etat.champs?.montant ? (
                  <span className="text-[11.5px] text-[var(--neg)]">{etat.champs.montant}</span>
                ) : null}
              </div>

              <div className="field">
                <label>Devise</label>
                {/* `key` : voir dialogue-voyage.tsx (select contrôlé désynchronisé). */}
                <select name="devise" key={devise} defaultValue={devise} onChange={(e) => setDevise(e.target.value as "GNF" | "XOF")}>
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
                      value={montantGnf}
                      onChange={(e) => setMontantGnf(e.target.value)}
                    />
                    <span className="text-[11px] text-[var(--muted-2)]">
                      {tauxReferenceXof
                        ? `Pré-rempli au taux ${formatDecimal(tauxReferenceXof, 2)}. Corrige au taux du jour.`
                        : "Saisir la contre-valeur réelle en GNF."}
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
                <label>Date</label>
                <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>

              <div className="field">
                <label>Motif</label>
                <input name="motif" placeholder="Avance mission Dakar…" />
              </div>

              <div className="field">
                <label>Moyen</label>
                <select name="moyenId" defaultValue="">
                  <option value="">— à préciser —</option>
                  {moyens.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Référence</label>
                <input name="reference" placeholder="N° de transfert…" />
              </div>

              {/* Envoyer 2 000 000 par Orange Money n'en coûte pas 2 000 000 :
                  la commission est un vrai coût, comptée à part de ce que le
                  chauffeur devra justifier. */}
              <div className="field">
                <label>Frais d&apos;envoi (GNF)</label>
                <input name="fraisGnf" inputMode="numeric" placeholder="0" />
                <span className="text-[11px] text-[var(--muted-2)]">
                  Commission de l&apos;opérateur. Sort de la caisse sans être remise au chauffeur.
                </span>
              </div>

              {/* Rattacher l'avance à la mission qu'elle finance : sans cela,
                  impossible de dire ce qu'un voyage a coûté en trésorerie. */}
              {/* Ventiler la remise par objet : le chauffeur doit savoir sur
                  quelle enveloppe il pioche, et l'exploitation pouvoir dire si
                  ce qui était prévu pour manger a servi au gasoil. */}
              {type === "AVANCE" ? (
                <div className="field">
                  <label>Objet de la remise</label>
                  {/*
                   * Aucun objet par défaut.
                   *
                   * « Per diem / restauration » était présélectionné : une
                   * avance pour le gasoil ou la douane s'enregistrait comme
                   * de la nourriture dès qu'on ne touchait pas au champ. Or
                   * ce champ existe précisément pour distinguer les
                   * enveloppes — et savoir si ce qui était prévu pour manger
                   * a servi au gasoil. Un objet inconnu se repère et se
                   * corrige ; un objet faux passe inaperçu.
                   */}
                  <select name="objet" defaultValue="">
                    <option value="">— à préciser —</option>
                    {OBJETS_REMISE.map((o) => (
                      <option key={o} value={o}>
                        {LIBELLE_TYPE_DEPENSE[o] ?? o}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Champ caché plutôt que liste désactivée : un champ désactivé
                  n'est pas envoyé par le navigateur, et l'avance repartirait
                  sans mission — invisible dans le coût du voyage. */}
              {voyageImpose ? (
                <input type="hidden" name="voyageId" value={voyageImpose} />
              ) : missions.length > 0 ? (
                <div className="field">
                  <label>Mission financée</label>
                  {/*
                   * Une seule mission en cours : elle est présélectionnée.
                   *
                   * « Aucune mission précise » était le choix par défaut, y
                   * compris quand le chauffeur roulait pour une course unique.
                   * On remettait l'argent, on ne touchait pas au champ, et
                   * l'avance restait détachée : le « reste à justifier » du
                   * voyage demeurait à zéro et son rapport annonçait « aucune
                   * avance ». Le défaut le plus coûteux est celui qui ne
                   * signale rien.
                   *
                   * À plusieurs missions, aucun choix n'est évident : on
                   * continue de demander.
                   */}
                  <select
                    name="voyageId"
                    defaultValue={missions.length === 1 ? missions[0].id : ""}
                  >
                    <option value="">— Aucune mission précise —</option>
                    {missions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.libelle}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[var(--muted-2)]">
                    {missions.length === 1
                      ? "Rattachée à la mission en cours. À laisser vide seulement si cet argent ne la finance pas."
                      : "Sans mission, l'avance n'entre pas dans le « reste à justifier » du voyage."}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="modal-pied">
            <button type="button" className="btn ghost" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <BoutonEnvoyer />
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BoutonEnvoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Enregistrement…" : "Enregistrer le mouvement"}
    </button>
  );
}
