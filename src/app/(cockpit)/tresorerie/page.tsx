import { basculerCompte, supprimerOperation } from "@/actions/tresorerie";
import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconePlus } from "@/components/icones";
import { SiPeut } from "@/components/si-peut";
import { DialogueCompte } from "@/components/tresorerie/dialogue-compte";
import { DialogueOperation } from "@/components/tresorerie/dialogue-operation";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import {
  comptesActifs,
  ecrituresSansCompte,
  soldesParCompte,
} from "@/lib/donnees/comptes-tresorerie";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  formatNombre,
  LIBELLE_MOTIF_TRESORERIE,
  LIBELLE_TYPE_COMPTE,
  n,
} from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trésorerie" };

export default async function TresoreriePage() {
  const [session, soldes, orphelines, comptes, operations, parametres, fil] = await Promise.all([
    sessionRequise(),
    soldesParCompte(),
    ecrituresSansCompte(),
    comptesActifs(),
    prisma.operationTresorerie.findMany({
      orderBy: { date: "desc" },
      take: 40,
      include: {
        compte: { select: { nom: true } },
        vers: { select: { nom: true } },
      },
    }),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const tauxReferenceXof = parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null;
  const actifs = soldes.filter((s) => s.actif);
  const total = actifs.reduce((t, s) => t + s.soldeGnf, 0);

  // Regroupement par nature : c'est la première question qu'on se pose.
  const parType = actifs.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + s.soldeGnf;
    return acc;
  }, {});

  return (
    <>
      <BarreHaut
        titre="Trésorerie"
        sousTitre="Où se trouve l'argent, emplacement par emplacement"
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={tauxReferenceXof}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {/* ---------- Répartition ---------- */}
        <div className="kpis mb-5">
          <div className="card kpi">
            <div className="lab">Trésorerie totale</div>
            <div className="val">
              {formatNombre(total)}
              <span className="unit">GNF</span>
            </div>
            <div className="delta flat">
              {actifs.length} emplacement{actifs.length > 1 ? "s" : ""}
            </div>
          </div>
          {(["CAISSE", "BANQUE", "MOBILE_MONEY", "CHAUFFEUR"] as const).map((t) => (
            <div key={t} className="card kpi">
              <div className="lab">{LIBELLE_TYPE_COMPTE[t]}</div>
              <div className="val">
                {formatNombre(parType[t] ?? 0)}
                <span className="unit">GNF</span>
              </div>
              <div className="delta flat">
                {actifs.filter((s) => s.type === t).length} compte
                {actifs.filter((s) => s.type === t).length > 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>

        {/* ---------- Écritures sans emplacement ----------
            Tant qu'il en reste, le total ci-dessus ne reconstitue pas la
            trésorerie réelle. Le dire vaut mieux qu'un total rassurant. */}
        {orphelines.nb > 0 ? (
          <div className="card panel mb-5 bandeau-attention">
            <h3>{orphelines.nb} écriture{orphelines.nb > 1 ? "s" : ""} sans emplacement</h3>
            <p className="text-[12.5px] text-[var(--muted)]">
              Ces sommes existent mais on ne sait pas où elles sont passées. Le total ci-dessus ne
              les compte donc pas — les attribuer au hasard donnerait des soldes faux.
              Renseignez leur compte à la modification.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-xs">
              <span>
                Règlements : <b className="mono">{formatNombre(orphelines.reglementsGnf)} GNF</b>
              </span>
              <span>
                Dépenses : <b className="mono">{formatNombre(orphelines.depensesGnf)} GNF</b>
              </span>
              <span>
                Caisse chauffeurs : <b className="mono">{formatNombre(orphelines.caisseGnf)} GNF</b>
              </span>
            </div>
          </div>
        ) : null}

        {/* ---------- Comptes ---------- */}
        <div className="head-row">
          <h3>Emplacements</h3>
          <SiPeut droit="depenses.ecrire">
            <div className="flex gap-2">
              <DialogueOperation
                comptes={comptes}
                tauxReferenceXof={tauxReferenceXof}
                declencheur={
                  <button type="button" className="btn ghost sm">
                    Dépôt, retrait, transfert…
                  </button>
                }
              />
              <DialogueCompte
                declencheur={
                  <button type="button" className="btn-add">
                    <IconePlus />
                    Ouvrir un compte
                  </button>
                }
              />
            </div>
          </SiPeut>
        </div>

        <div className="card overflow-x-auto mb-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Emplacement</th>
                <th>Type</th>
                <th className="num">Ouverture</th>
                <th className="num">Entrées</th>
                <th className="num">Sorties</th>
                <th className="num">Solde</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {soldes.map((s) => (
                <tr key={s.id} className={s.actif ? undefined : "ligne-inactive"}>
                  <td>
                    <b>{s.nom}</b>
                    {s.reference ? <div className="t-sub mono">{s.reference}</div> : null}
                    {s.detenteur ? <div className="t-sub">Détenu par {s.detenteur}</div> : null}
                  </td>
                  <td className="t-sub">{LIBELLE_TYPE_COMPTE[s.type] ?? s.type}</td>
                  <td className="num">{formatNombre(s.soldeInitialGnf)}</td>
                  <td className="num text-[var(--pos)]">{formatNombre(s.entreesGnf)}</td>
                  <td className="num text-[var(--neg)]">{formatNombre(s.sortiesGnf)}</td>
                  <td className={`num ${s.soldeGnf < 0 ? "neg" : ""}`}>
                    <b>{formatNombre(s.soldeGnf)}</b>
                  </td>
                  <td className="actions-cell">
                    <SiPeut droit="depenses.ecrire">
                      <DialogueCompte
                        compte={{
                          id: s.id,
                          nom: s.nom,
                          type: s.type,
                          reference: s.reference,
                          devise: s.devise,
                          soldeInitialGnf: s.soldeInitialGnf,
                          ordre: 100,
                          estChauffeur: s.type === "CHAUFFEUR",
                        }}
                        declencheur={
                          <button type="button" className="btn ghost sm">
                            Modifier
                          </button>
                        }
                      />
                      {/* Un compte chauffeur suit sa fiche : il ne se ferme pas
                          à la main, sinon son argent n'aurait plus d'endroit. */}
                      {s.type !== "CHAUFFEUR" ? (
                        <form action={basculerCompte.bind(null, s.id)}>
                          <button type="submit" className="btn ghost sm">
                            {s.actif ? "Fermer" : "Rouvrir"}
                          </button>
                        </form>
                      ) : null}
                    </SiPeut>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ---------- Mouvements financiers ---------- */}
        <div className="head-row">
          <h3>
            Dépôts, retraits et transferts{" "}
            <span className="sec-sub">— {operations.length} dernier{operations.length > 1 ? "s" : ""}</span>
          </h3>
        </div>

        {operations.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Nature</th>
                  <th>Trajet de l&apos;argent</th>
                  <th className="num">Montant</th>
                  <th className="num">Frais</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {operations.map((o) => (
                  <tr key={o.id}>
                    <td>{formatDate(o.date)}</td>
                    <td>
                      <b>{LIBELLE_MOTIF_TRESORERIE[o.motif] ?? o.motif}</b>
                      {o.libelle ? <div className="t-sub">{o.libelle}</div> : null}
                    </td>
                    <td>
                      {o.compte.nom}
                      {o.vers ? <span className="text-[var(--muted-2)]"> → {o.vers.nom}</span> : null}
                      {o.reference ? <div className="t-sub mono">{o.reference}</div> : null}
                    </td>
                    <td className="num">
                      {formatNombre(n(o.montantGnf))}
                      {o.devise !== "GNF" ? (
                        <div className="t-sub">{formatNombre(n(o.montant))} CFA</div>
                      ) : null}
                    </td>
                    <td className="num">{o.fraisGnf ? formatNombre(n(o.fraisGnf)) : "—"}</td>
                    <td className="actions-cell">
                      <SiPeut droit="depenses.ecrire">
                        <form action={supprimerOperation.bind(null, o.id)}>
                          <button type="submit" className="btn ghost sm">
                            Supprimer
                          </button>
                        </form>
                      </SiPeut>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucun dépôt ni transfert enregistré. Utilisez le bouton ci-dessus dès que de
              l&apos;argent passe d&apos;un emplacement à un autre.
            </p>
          </div>
        )}

        <p className="note-bas">
          Un règlement client, une dépense ou une avance portent déjà leur emplacement : ils
          n&apos;ont pas à être ressaisis ici. Cet écran ne sert qu&apos;aux mouvements purement
          financiers — déposer les espèces à la banque, retirer pour payer un garage, constater un
          écart après comptage.
        </p>
      </div>
    </>
  );
}
