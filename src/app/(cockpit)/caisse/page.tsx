import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { tresorerie } from "@/lib/donnees/tresorerie";
import { prisma } from "@/lib/prisma";
import { formatDate, formatGnf, formatNombre, formatSigne, n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caisse" };

export default async function CaissePage() {
  const [session, tresor, parametres, fil] = await Promise.all([
    sessionRequise(),
    tresorerie(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  return (
    <>
      <BarreHaut
        titre="Caisse"
        sousTitre="Trésorerie de l'entreprise"
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="kpis mb-5">
          <div className="card kpi">
            <div className="lab">Solde en caisse</div>
            <div className={`val ${tresor.soldeGnf < 0 ? "text-[var(--neg)]" : ""}`}>
              {formatNombre(tresor.soldeGnf)}
              <span className="unit">GNF</span>
            </div>
            <div className="delta flat">
              {tresor.dateSoldeInitial
                ? `Depuis le solde du ${formatDate(tresor.dateSoldeInitial)}`
                : "Solde d'ouverture non renseigné"}
            </div>
          </div>

          <div className="card kpi">
            <div className="lab">Entrées</div>
            <div className="val">{formatNombre(tresor.entreesGnf)}<span className="unit">GNF</span></div>
            <div className="delta flat">Règlements clients et reliquats rendus</div>
          </div>

          <div className="card kpi warnbar">
            <div className="lab">Sorties</div>
            <div className="val">{formatNombre(tresor.sortiesGnf)}<span className="unit">GNF</span></div>
            <div className="delta flat">
              {tresor.fraisGnf > 0
                ? `dont ${formatNombre(tresor.fraisGnf)} de frais d'envoi`
                : "Dépenses et avances"}
            </div>
          </div>

          <div className="card kpi">
            <div className="lab">Détenu par les chauffeurs</div>
            <div className="val">
              {formatNombre(tresor.detenuParChauffeursGnf)}
              <span className="unit">GNF</span>
            </div>
            <div className="delta flat">Sorti de caisse, pas encore justifié</div>
          </div>
        </div>

        {/* La règle qui évite le double comptage mérite d'être écrite : sans
            elle, le gérant chercherait pourquoi une dépense n'apparaît pas. */}
        <p className="note-methode">
          L&apos;argent remis à un chauffeur sort de la caisse au moment où on le lui donne.
          Quand il le dépense ensuite, rien ne ressort une seconde fois : la dépense est déjà
          financée. Seules les dépenses réglées directement par l&apos;entreprise figurent
          ci-dessous.
          {tresor.soldeInitialGnf !== 0 ? (
            <> Solde d&apos;ouverture : <b>{formatGnf(tresor.soldeInitialGnf)}</b>.</>
          ) : (
            <> Renseignez le solde d&apos;ouverture dans Paramètres si vous aviez déjà de
            l&apos;argent en caisse.</>
          )}
        </p>

        <div className="head-row">
          <h3>
            Mouvements <span className="sec-sub">— {tresor.lignes.length}</span>
          </h3>
        </div>

        {tresor.lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opération</th>
                  <th>Moyen</th>
                  <th>Référence</th>
                  <th className="num">Montant</th>
                  <th className="num">Solde</th>
                </tr>
              </thead>
              <tbody>
                {tresor.lignes.map((l) => (
                  <tr key={l.id}>
                    <td className="muted">{formatDate(l.date)}</td>
                    <td>
                      <b>{l.libelle}</b>
                      {l.detail ? <div className="t-sub">{l.detail}</div> : null}
                    </td>
                    <td className="muted">{l.moyen}</td>
                    <td className="mono muted">{l.reference ?? "—"}</td>
                    <td className={`num ${l.sens === "ENTREE" ? "pos" : "neg"}`}>
                      {formatSigne(l.sens === "ENTREE" ? l.montantGnf : -l.montantGnf)}
                    </td>
                    <td className={`num ${l.soldeApresGnf < 0 ? "neg" : ""}`}>
                      {formatNombre(l.soldeApresGnf)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucun mouvement. La caisse se remplit des règlements clients et se vide des
              dépenses et des avances.
            </p>
          </div>
        )}

        <p className="note-bas">
          Un solde négatif signifie que les sorties dépassent ce que la caisse contenait :
          vérifiez le solde d&apos;ouverture dans Paramètres avant d&apos;y voir une erreur.
        </p>
      </div>
    </>
  );
}
