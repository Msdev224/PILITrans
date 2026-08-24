"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { enregistrerOperation, type EtatTresorerie } from "@/actions/tresorerie";
import { ChampMontant } from "@/components/champ-montant";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LIBELLE_MOTIF_TRESORERIE } from "@/lib/utils";

export interface OptionCompte {
  id: string;
  nom: string;
  type: string;
  devise: string;
}

/** Motifs qui déplacent l'argent vers un autre compte. */
const AVEC_DESTINATION = ["DEPOT", "RETRAIT", "TRANSFERT"];

const AIDE: Record<string, string> = {
  DEPOT: "Les espèces partent à la banque ou sur un compte mobile.",
  RETRAIT: "De l'argent sort de la banque pour rejoindre la caisse.",
  TRANSFERT: "L'argent passe d'un compte à un autre, sans quitter l'entreprise.",
  APPORT: "Argent injecté par le gérant ou un associé. Il entre dans la trésorerie.",
  PRELEVEMENT: "Argent retiré de l'exploitation. Il en sort définitivement.",
  AJUSTEMENT: "Écart constaté à un comptage physique. À n'utiliser qu'après avoir compté.",
};

export function DialogueOperation({
  comptes,
  compteImpose,
  tauxReferenceXof,
  declencheur,
}: {
  comptes: OptionCompte[];
  /** Ouvert depuis un compte précis : l'origine est déjà connue. */
  compteImpose?: string;
  tauxReferenceXof: number | null;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, envoyer] = useActionState<EtatTresorerie, FormData>(enregistrerOperation, {});

  const [motif, setMotif] = useState("DEPOT");
  const [devise, setDevise] = useState<"GNF" | "XOF">("GNF");
  const [montant, setMontant] = useState("");
  const [montantGnf, setMontantGnf] = useState("");

  useEffect(() => {
    if (etat.ok) {
      setOuvert(false);
      setMontant("");
    }
  }, [etat.ok]);

  // En CFA, l'équivalent GNF se pré-remplit au dernier taux connu.
  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const valeur = Number(montant.replace(",", "."));
    if (Number.isFinite(valeur) && valeur > 0) {
      setMontantGnf(String(Math.round(valeur * tauxReferenceXof)));
    }
  }, [devise, montant, tauxReferenceXof]);

  const err = (champ: string) => etat.champs?.[champ];
  const avecDestination = AVEC_DESTINATION.includes(motif);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[520px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>Mouvement d&apos;argent</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <div className="full">
                <div className="field">
                  <label>Nature</label>
                  <select
                    name="motif"
                    key={motif}
                    defaultValue={motif}
                    onChange={(e) => setMotif(e.target.value)}
                  >
                    {Object.entries(LIBELLE_MOTIF_TRESORERIE).map(([cle, libelle]) => (
                      <option key={cle} value={cle}>
                        {libelle}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[var(--muted-2)]">{AIDE[motif]}</span>
                </div>
              </div>

              <div className="field">
                <label>{avecDestination ? "Depuis" : "Compte"}</label>
                <select name="compteId" required defaultValue={compteImpose ?? ""}>
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {comptes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                {err("compteId") ? (
                  <span className="text-[11.5px] text-[var(--neg)]">{err("compteId")}</span>
                ) : null}
              </div>

              {/* La destination n'a de sens que pour un déplacement interne :
                  un apport vient de l'extérieur, un prélèvement en sort. */}
              {avecDestination ? (
                <div className="field">
                  <label>Vers</label>
                  <select name="versId" required defaultValue="">
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {comptes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                  {err("versId") ? (
                    <span className="text-[11.5px] text-[var(--neg)]">{err("versId")}</span>
                  ) : null}
                </div>
              ) : null}

              <div className="field">
                <label>Montant</label>
                <ChampMontant nom="montant" valeur={montant} devise={devise} requis onChange={setMontant} />
                {err("montant") ? (
                  <span className="text-[11.5px] text-[var(--neg)]">{err("montant")}</span>
                ) : null}
              </div>

              <div className="field">
                <label>Devise</label>
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
                      value={montantGnf}
                      onChange={(e) => setMontantGnf(e.target.value)}
                    />
                    <span className="text-[11px] text-[var(--muted-2)]">
                      Corrige au taux réellement pratiqué ce jour-là.
                    </span>
                    {err("montantGnf") ? (
                      <span className="text-[11.5px] text-[var(--neg)]">{err("montantGnf")}</span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <input type="hidden" name="montantGnf" value={montant} />
              )}

              <div className="field">
                <label>Frais (GNF)</label>
                <input name="fraisGnf" inputMode="numeric" placeholder="0" />
                <span className="text-[11px] text-[var(--muted-2)]">
                  Commission de la banque ou de l&apos;opérateur. Elle sort sans arriver nulle part.
                </span>
              </div>

              <div className="field">
                <label>Date</label>
                <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>

              <div className="full">
                <div className="field">
                  <label>Motif</label>
                  <input name="libelle" placeholder="Dépôt de la recette de la semaine…" />
                </div>
              </div>

              <div className="full">
                <div className="field">
                  <label>Référence</label>
                  <input name="reference" placeholder="N° de bordereau, de transfert…" />
                </div>
              </div>
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
      {pending ? "Enregistrement…" : "Enregistrer"}
    </button>
  );
}
