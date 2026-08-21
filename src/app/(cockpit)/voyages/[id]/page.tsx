import Link from "next/link";
import { notFound } from "next/navigation";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconeInfo, IconePlus } from "@/components/icones";
import { ActionsEtape } from "@/components/voyages/actions-etape";
import {
  DialogueEtape,
  type RavitaillementOption,
} from "@/components/voyages/dialogue-etape";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { ficheVoyage, type TronconVue } from "@/lib/donnees/voyages";
import { prisma } from "@/lib/prisma";
import {
  LIBELLE_PAYS,
  LIBELLE_STATUT_VOYAGE,
  LIBELLE_TYPE_DEPENSE,
  LIBELLE_TYPE_ETAPE,
  formatDate,
  formatDecimal,
  formatGnf,
  formatNombre,
  formatSigne,
  n,
} from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";
import { formatQuantite } from "@/lib/donnees/unites";
import { supprimerPrelevement } from "@/actions/douane";

export const dynamic = "force-dynamic";

export default async function FicheVoyagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, fiche, parametres, fil] = await Promise.all([
    sessionRequise(),
    ficheVoyage(id),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  if (!fiche) notFound();
  const { voyage } = fiche;

  // Pleins saisis en litres : rattachables à un tronçon.
  const dejaRattaches = new Set(
    fiche.troncons.flatMap((t) => t.etape.ravitaillements.map((r) => r.id)),
  );
  const ravitaillements: RavitaillementOption[] = fiche.postes
    .filter((d) => d.litres != null && n(d.litres) > 0)
    .map((d) => ({
      id: d.id,
      libelle: `${LIBELLE_TYPE_DEPENSE[d.type] ?? d.type}${d.description ? ` — ${d.description}` : ""}`,
      litres: n(d.litres),
      prisAilleurs: false,
    }));

  return (
    <>
      <BarreHaut
        titre={`${voyage.villeDepart} → ${voyage.villeArrivee}`}
        sousTitre={`${voyage.reference} · ${voyage.camion.nom} · ${voyage.chauffeur.nom} · ${formatDate(voyage.dateDepart)}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="mb-3.5">
          <Link href="/voyages" className="link text-[13px]">
            ← Retour aux voyages
          </Link>
        </div>

        {/* ---------- Résumé de la mission ---------- */}
        <div className="vstats">
          <div className="vstat">
            <div className="vs-lab">Recette</div>
            <div className="vs-val pos">{formatNombre(fiche.recetteGnf)}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Frais de voyage</div>
            <div className="vs-val">{formatNombre(fiche.fraisGnf)}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Rémunération chauffeur</div>
            <div className="vs-val">{formatNombre(fiche.remunerationGnf)}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Marge de la mission</div>
            <div className={`vs-val ${fiche.margeGnf >= 0 ? "pos" : "warn"}`}>
              {formatSigne(fiche.margeGnf)}
            </div>
          </div>
        </div>

        <div className="card panel mb-5">
          <h3>Mission</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-[var(--muted)]">
            <Info libelle="État" valeur={LIBELLE_STATUT_VOYAGE[voyage.statut]} />
            <Info
              libelle="Trajet"
              valeur={`${LIBELLE_PAYS[voyage.paysDepart]} → ${LIBELLE_PAYS[voyage.paysArrivee]}`}
            />
            <Info libelle="Client" valeur={voyage.client?.nom ?? "—"} />
            {/* Le trajet à vide vers un chargement n'est pas un
                repositionnement : la course appartient au client. */}
            {voyage.aVide ? (
              <Info
                libelle="À vide"
                valeur={voyage.vaChercher ? "Va chercher la marchandise" : "Repositionnement"}
              />
            ) : null}
            <Info libelle="Distance" valeur={fiche.km > 0 ? `${formatNombre(fiche.km)} km` : "—"} mono />
            <Info
              libelle="Conso moyenne"
              valeur={fiche.consoMoyenneL100 != null ? `${formatDecimal(fiche.consoMoyenneL100)} L/100` : "—"}
              mono
            />
            {fiche.joursAttente > 0 ? (
              <Info libelle="Attente au chargement" valeur={`${fiche.joursAttente} j`} mono />
            ) : null}
          </div>

        </div>

        {/* ---------- Marchandises ---------- */}
        {/* Un voyage groupe souvent plusieurs marchandises, dans des unités
            différentes et parfois pour des destinataires différents. Chacune
            porte son propre suivi : c'est le seul niveau où un manquant a un
            sens. */}
        <div className="head-row">
          <h3>
            Marchandises{" "}
            <span className="sec-sub">
              — {fiche.lignes.length} article{fiche.lignes.length > 1 ? "s" : ""}
            </span>
          </h3>
        </div>

        {fiche.lignes.length > 0 ? (
          <div className="card overflow-x-auto mb-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Marchandise</th>
                  <th className="num">À charger</th>
                  <th className="num">Reçu</th>
                  <th className="num">Douane</th>
                  <th className="num">Livré</th>
                  <th className="num">Écart</th>
                </tr>
              </thead>
              <tbody>
                {fiche.lignes.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.designation}</b>
                      <div className="t-sub">
                        {l.unite}
                        {l.client ? ` · ${l.client}` : ""}
                      </div>
                    </td>
                    <td className="num">{formatQuantite(l.quantiteACharger, l.symbole)}</td>
                    <td className="num">{formatQuantite(l.quantiteRecue, l.symbole)}</td>
                    <td className={`num ${l.prelevementQuantite > 0 ? "" : "vide"}`}>
                      {l.prelevementQuantite > 0
                        ? formatQuantite(l.prelevementQuantite, l.symbole)
                        : "—"}
                    </td>
                    <td className="num">{formatQuantite(l.quantiteLivree, l.symbole)}</td>
                    <td className={`num ${l.ecart == null ? "vide" : l.ecart.manquant > 0 ? "neg" : "pos"}`}>
                      {l.ecart == null
                        ? "—"
                        : l.ecart.manquant > 0
                          ? `−${formatQuantite(l.ecart.manquant, l.symbole)}`
                          : "conforme"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel mb-5">
            <p className="vide-msg">
              Aucune marchandise déclarée sur cette mission.
            </p>
          </div>
        )}

        {/* ---------- Prélèvements de douane ---------- */}
        {/* Ce que les postes ont retenu, déclaré par le chauffeur en route.
            Le gérant doit pouvoir le relire et le corriger : une déclaration
            erronée fausse l'écart de livraison, donc l'alerte de vol. */}
        {fiche.lignes.some((l) => l.prelevements.length > 0) ? (
          <>
            <div className="head-row">
              <h3>
                Prélèvements de douane{" "}
                {fiche.prelevementGnf > 0 ? (
                  <span className="sec-sub">— {formatGnf(fiche.prelevementGnf)} réclamés</span>
                ) : null}
              </h3>
            </div>

            <div className="card overflow-x-auto mb-5">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Marchandise</th>
                    <th className="num">Quantité</th>
                    <th>Poste</th>
                    <th>Motif</th>
                    <th>Reçu</th>
                    <th className="num">Contrepartie</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {fiche.lignes.flatMap((l) =>
                    l.prelevements.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <b>{l.designation}</b>
                          <div className="t-sub">{formatDate(new Date(p.date))}</div>
                        </td>
                        <td className="num">{formatQuantite(p.quantite, l.symbole)}</td>
                        <td>
                          {p.lieu}
                          <div className="t-sub">{LIBELLE_PAYS[p.pays] ?? p.pays}</div>
                        </td>
                        <td className="muted">{p.motif ?? "—"}</td>
                        <td className="mono">{p.reference ?? "—"}</td>
                        <td className={`num ${p.montantGnf ? "" : "vide"}`}>
                          {p.montantGnf ? formatNombre(p.montantGnf) : "—"}
                        </td>
                        <td className="actions-cell">
                          <SiPeut droit="voyages.ecrire">
                            <form action={supprimerPrelevement.bind(null, p.id)}>
                              <button type="submit" className="btn ghost sm">
                                Supprimer
                              </button>
                            </form>
                          </SiPeut>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {/* Manquants inexpliqués, article par article : un total serait faux
            dès que les unités diffèrent. */}
        {fiche.lignesEnEcart.map((l) => (
          <div key={l.id} className="flag mb-3">
            Écart de livraison sur <b>{l.designation}</b> :{" "}
            {formatQuantite(l.ecart!.manquant, l.symbole)} manquants sur{" "}
            {formatQuantite(Math.max((l.quantiteRecue ?? 0) - l.prelevementQuantite, 0), l.symbole)}{" "}
            ({formatDecimal(l.ecart!.pct)} %)
            {l.prelevementQuantite > 0
              ? `, après déduction de ${formatQuantite(l.prelevementQuantite, l.symbole)} prélevés en douane`
              : ""}
            .
          </div>
        ))}

        {/* ---------- Tronçons ---------- */}
        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Le carburant est le <b>niveau restant dans le réservoir</b>. Quand on{" "}
            <b>rajoute du carburant en route</b> (colonne Plein), la conso en tient compte :
            restant départ + pleins − restant arrivée.
          </span>
        </div>

        <div className="head-row">
          <h3>
            Étapes du trajet <span className="sec-sub">— {fiche.troncons.length} tronçon
            {fiche.troncons.length > 1 ? "s" : ""}</span>
          </h3>
          <SiPeut droit="voyages.ecrire">
            <DialogueEtape
              voyageId={voyage.id}
              ravitaillements={ravitaillements}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Ajouter une étape
                </button>
              }
            />
          </SiPeut>
        </div>

        {fiche.troncons.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Étape</th>
                  <th className="num">Km dép.</th>
                  <th className="num">Km arr.</th>
                  <th className="num">Dist.</th>
                  <th className="num">Réservoir dép.</th>
                  <th className="num">Plein</th>
                  <th className="num">Réservoir arr.</th>
                  <th className="num">Conso</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fiche.troncons.map((troncon) => (
                  <LigneTroncon
                    key={troncon.etape.id}
                    troncon={troncon}
                    voyageId={voyage.id}
                    ravitaillements={ravitaillements}
                    dejaRattaches={dejaRattaches}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucune étape saisie. Ajoute les tronçons pour suivre la distance réelle et la
              consommation.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Info({ libelle, valeur, mono }: { libelle: string; valeur: string; mono?: boolean }) {
  return (
    <div>
      {libelle}
      <b className={`mt-0.5 block text-[13px] text-[var(--ink)] ${mono ? "mono" : ""}`}>{valeur}</b>
    </div>
  );
}

function LigneTroncon({
  troncon,
  voyageId,
  ravitaillements,
  dejaRattaches,
}: {
  troncon: TronconVue;
  voyageId: string;
  ravitaillements: RavitaillementOption[];
  dejaRattaches: Set<string>;
}) {
  const { etape } = troncon;
  const propres = new Set(etape.ravitaillements.map((r) => r.id));

  return (
    <tr>
      <td className="t-title">
        {etape.villeDepart} → {etape.villeArrivee}
        <div className="t-sub">
          {[LIBELLE_TYPE_ETAPE[etape.type], etape.motif].filter(Boolean).join(" · ")}
        </div>
      </td>
      <Num valeur={etape.kmDepart} />
      <Num valeur={etape.kmArrivee} />
      <Num valeur={troncon.distance} />
      <Num valeur={etape.carburantRestantDepart != null ? n(etape.carburantRestantDepart) : null} unite=" L" />
      <td className={`num ${troncon.pleinsL > 0 ? "" : "vide"}`}>
        {troncon.pleinsL > 0 ? (
          <span className="text-[var(--accent-ink)]">+{formatNombre(troncon.pleinsL)} L</span>
        ) : (
          "—"
        )}
      </td>
      <Num valeur={etape.carburantRestantArrivee != null ? n(etape.carburantRestantArrivee) : null} unite=" L" />
      <td className={`num ${troncon.litresPer100km != null ? "" : "vide"}`}>
        {troncon.litresPer100km != null ? `${formatDecimal(troncon.litresPer100km)} L/100` : "—"}
      </td>
      <td>
        <span className={`badge ${troncon.termine ? "b-idle" : "b-go"}`}>
          {troncon.termine ? "Terminée" : <><span className="led" />En cours</>}
        </span>
      </td>
      <td>
        <ActionsEtape
          voyageId={voyageId}
          etape={{
            id: etape.id,
            type: etape.type,
            villeDepart: etape.villeDepart,
            villeArrivee: etape.villeArrivee,
            paysDepart: etape.paysDepart,
            paysArrivee: etape.paysArrivee,
            kmDepart: etape.kmDepart,
            kmArrivee: etape.kmArrivee,
            carburantRestantDepart:
              etape.carburantRestantDepart != null ? n(etape.carburantRestantDepart) : null,
            carburantRestantArrivee:
              etape.carburantRestantArrivee != null ? n(etape.carburantRestantArrivee) : null,
            motif: etape.motif,
            departLe: etape.departLe ? etape.departLe.toISOString().slice(0, 10) : null,
            arriveeLe: etape.arriveeLe ? etape.arriveeLe.toISOString().slice(0, 10) : null,
            ravitaillements: [...propres],
          }}
          // Un plein rattaché à un autre tronçon ne doit pas être proposé ici.
          ravitaillements={ravitaillements.map((r) => ({
            ...r,
            prisAilleurs: dejaRattaches.has(r.id) && !propres.has(r.id),
          }))}
        />
      </td>
    </tr>
  );
}

function Num({ valeur, unite = "" }: { valeur: number | null | undefined; unite?: string }) {
  return (
    <td className={`num ${valeur != null ? "" : "vide"}`}>
      {valeur != null ? `${formatNombre(valeur)}${unite}` : "—"}
    </td>
  );
}
