"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerEntretien, modifierEntretien, type EtatEntretien } from "@/actions/entretiens";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDecimal, formatNombre } from "@/lib/utils";

const LIBELLE_TYPE: Record<string, string> = {
  VIDANGE_TRACTEUR: "Vidange tracteur",
  ENTRETIEN_GROUPE_FROID: "Entretien groupe froid",
  FREINS: "Freins",
  PNEUS: "Pneumatiques",
  AUTRE: "Autre",
};

/** Périodicités usuelles, pour proposer une échéance cohérente. */
const PERIODICITE_KM: Record<string, number> = {
  VIDANGE_TRACTEUR: 10000,
  FREINS: 30000,
  PNEUS: 60000,
  AUTRE: 20000,
};

export interface EntretienEditable {
  id: string;
  camionId: string;
  type: string;
  dateFait: string | null;
  kmFait: number | null;
  heuresFait: number | null;
  prochainKm: number | null;
  prochainHeures: number | null;
  prochaineDate: string | null;
  cout: number;
  devise: "GNF" | "XOF";
  coutGnf: number;
}

interface Props {
  camionId: string;
  refrigere: boolean;
  kilometrage: number;
  heuresGroupeFroid: number;
  tauxReferenceXof: number | null;
  entretien?: EntretienEditable | null;
  declencheur: React.ReactNode;
}

export function DialogueEntretien({
  camionId,
  refrigere,
  kilometrage,
  heuresGroupeFroid,
  tauxReferenceXof,
  entretien,
  declencheur,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!entretien;

  const action = edition
    ? modifierEntretien.bind(null, entretien.id)
    : (creerEntretien as (e: EtatEntretien, d: FormData) => Promise<EtatEntretien>);
  const [etat, envoyer] = useActionState<EtatEntretien, FormData>(action, {});

  const [type, setType] = useState(entretien?.type ?? "VIDANGE_TRACTEUR");
  const [devise, setDevise] = useState<"GNF" | "XOF">(entretien?.devise ?? "GNF");
  const [cout, setCout] = useState(entretien ? String(entretien.cout) : "");
  const [coutGnf, setCoutGnf] = useState(entretien ? String(entretien.coutGnf) : "");
  const [kmFait, setKmFait] = useState(
    entretien?.kmFait != null ? String(entretien.kmFait) : String(kilometrage),
  );
  const [prochainKm, setProchainKm] = useState(
    entretien?.prochainKm != null ? String(entretien.prochainKm) : "",
  );

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const valeur = Number(cout.replace(",", "."));
    if (Number.isFinite(valeur) && valeur > 0) setCoutGnf(String(Math.round(valeur * tauxReferenceXof)));
  }, [devise, cout, tauxReferenceXof]);

  // La prochaine échéance se propose depuis le km réalisé et la périodicité.
  const proposerEcheance = () => {
    const base = Number(kmFait.replace(/\s/g, "")) || kilometrage;
    setProchainKm(String(base + (PERIODICITE_KM[type] ?? 20000)));
  };

  const err = (c: string) => etat.champs?.[c];
  const val = (c: string, origine: string | number | null) =>
    etat.valeurs?.[c] ?? (origine != null ? String(origine) : "");

  const surGroupeFroid = refrigere && type === "ENTRETIEN_GROUPE_FROID";

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[560px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? "Modifier l'entretien" : "Nouvel entretien"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <input type="hidden" name="camionId" value={camionId} />

          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <p className="mb-4 text-[11.5px] leading-relaxed text-[var(--muted)]">
              L&apos;entretien préventif se suit <b>au kilométrage</b> pour le tracteur,{" "}
              <b>aux heures</b> pour le groupe froid, <b>à la date</b> pour ce qui se périme. Une
              alerte est levée à l&apos;approche de l&apos;échéance.
            </p>

            <div className="form-grid">
              <Champ label="Nature">
                <select name="type" key={type} defaultValue={type} onChange={(e) => setType(e.target.value)}>
                  {Object.keys(LIBELLE_TYPE)
                    .filter((t) => refrigere || t !== "ENTRETIEN_GROUPE_FROID")
                    .map((t) => (
                      <option key={t} value={t}>
                        {LIBELLE_TYPE[t]}
                      </option>
                    ))}
                </select>
              </Champ>

              <Champ label="Réalisé le">
                <input type="date" name="dateFait" key={val("dateFait", entretien?.dateFait ?? new Date().toISOString().slice(0, 10))} defaultValue={val("dateFait", entretien?.dateFait ?? new Date().toISOString().slice(0, 10))} />
              </Champ>

              <Champ label="Compteur au moment de l'entretien (km)">
                <input name="kmFait" inputMode="numeric" value={kmFait} onChange={(e) => setKmFait(e.target.value)} />
              </Champ>

              {surGroupeFroid ? (
                <Champ label="Heures de groupe" aide={`Actuellement ${formatNombre(heuresGroupeFroid)} h.`}>
                  <input name="heuresFait" inputMode="numeric" key={val("heuresFait", entretien?.heuresFait ?? heuresGroupeFroid)} defaultValue={val("heuresFait", entretien?.heuresFait ?? heuresGroupeFroid)} />
                </Champ>
              ) : null}

              <div className="full mt-1 border-t border-[var(--line-soft)] pt-3">
                <p className="mb-3 text-[11.5px] text-[var(--muted)]">
                  <b>Prochaine échéance</b> — au moins une des trois.
                </p>
                <div className="form-grid">
                  <Champ label="Prochain kilométrage" erreur={err("prochainKm")}>
                    <input name="prochainKm" inputMode="numeric" value={prochainKm} onChange={(e) => setProchainKm(e.target.value)} />
                    <button
                      type="button"
                      className="link mt-1 self-start bg-transparent p-0 text-[11px]"
                      onClick={proposerEcheance}
                    >
                      Proposer (+{formatNombre(PERIODICITE_KM[type] ?? 20000)} km)
                    </button>
                  </Champ>

                  {surGroupeFroid ? (
                    <Champ label="Prochaines heures">
                      <input name="prochainHeures" inputMode="numeric" key={val("prochainHeures", entretien?.prochainHeures ?? null)} defaultValue={val("prochainHeures", entretien?.prochainHeures ?? null)} />
                    </Champ>
                  ) : null}

                  <Champ label="Prochaine date">
                    <input type="date" name="prochaineDate" key={val("prochaineDate", entretien?.prochaineDate ?? null)} defaultValue={val("prochaineDate", entretien?.prochaineDate ?? null)} />
                  </Champ>
                </div>
              </div>

              <Champ label="Coût">
                <input name="cout" inputMode="decimal" value={cout} onChange={(e) => setCout(e.target.value)} />
              </Champ>

              <Champ label="Devise">
                {/* `key` : voir dialogue-voyage.tsx (select contrôlé désynchronisé). */}
                <select name="devise" key={devise} defaultValue={devise} onChange={(e) => setDevise(e.target.value as "GNF" | "XOF")}>
                  <option value="GNF">GNF</option>
                  <option value="XOF">CFA</option>
                </select>
              </Champ>

              {devise === "XOF" ? (
                <div className="full">
                  <Champ
                    label="Équivalent réel en GNF"
                    erreur={err("coutGnf")}
                    aide={
                      tauxReferenceXof
                        ? `Pré-rempli au taux ${formatDecimal(tauxReferenceXof, 2)}. Corrige au taux réellement payé.`
                        : "Saisir le montant réellement déboursé en GNF."
                    }
                  >
                    <input name="coutGnf" inputMode="numeric" value={coutGnf} onChange={(e) => setCoutGnf(e.target.value)} />
                  </Champ>
                </div>
              ) : (
                <input type="hidden" name="coutGnf" value={cout} />
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
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter l'entretien"}
    </button>
  );
}
