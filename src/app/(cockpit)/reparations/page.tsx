import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconeInfo } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import {
  estFiltreReparation,
  FILTRES_REPARATION,
  vueReparations,
  type FiltreReparation,
  type LigneReparation,
} from "@/lib/donnees/flotte";
import { moisCourant } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  formatNombre,
  LIBELLE_CATEGORIE_REPARATION,
  LIBELLE_STATUT_REPARATION,
  n,
} from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réparations — PILITrans" };

const BADGE: Record<string, string> = {
  A_FAIRE: "b-idle",
  EN_COURS: "b-warn",
  TERMINEE: "b-go",
};

interface Props {
  searchParams: Promise<{ filtre?: string }>;
}

export default async function ReparationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filtre: FiltreReparation = estFiltreReparation(params.filtre) ? params.filtre : "toutes";
  const periode = moisCourant();

  const [session, vue, parametres, fil] = await Promise.all([
    sessionRequise(),
    vueReparations(periode, { filtre }),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const lienFiltre = (cle: FiltreReparation) =>
    cle === "toutes" ? "/reparations" : `/reparations?filtre=${cle}`;

  return (
    <>
      <BarreHaut
        titre="Réparations"
        sousTitre={`${vue.total} intervention${vue.total > 1 ? "s" : ""} · ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="searchbar">
          <div className="chips">
            {FILTRES_REPARATION.map((f) => (
              <Link key={f.cle} href={lienFiltre(f.cle)} className={`chip-f${f.cle === filtre ? " on" : ""}`}>
                {f.libelle}
              </Link>
            ))}
          </div>
        </div>

        <div className="vstats">
          <div className="vstat">
            <div className="vs-lab">À faire</div>
            <div className={`vs-val${vue.stats.aFaire > 0 ? " warn" : ""}`}>{vue.stats.aFaire}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">En cours</div>
            <div className="vs-val">{vue.stats.enCours}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Coût du mois</div>
            <div className="vs-val">
              {formatNombre(vue.stats.coutMoisGnf)} <span>GNF</span>
            </div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Jours d&apos;immobilisation</div>
            <div className={`vs-val${vue.stats.joursImmobilisation > 0 ? " warn" : ""}`}>
              {vue.stats.joursImmobilisation} <span>j</span>
            </div>
          </div>
        </div>

        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Vue d&apos;ensemble du parc. La <b>saisie</b> d&apos;une réparation se fait depuis la fiche
            du camion concerné, où elle s&apos;impute au compte de résultat.
          </span>
        </div>

        {vue.lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Camion</th>
                  <th>Intervention</th>
                  <th>Garage</th>
                  <th className="num">Coût</th>
                  <th className="num">Immobilisation</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {vue.lignes.map((ligne) => (
                  <Ligne key={ligne.reparation.id} ligne={ligne} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucune réparation dans ce filtre.{" "}
              <Link href="/reparations" className="link">
                Tout afficher
              </Link>
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Ligne({ ligne }: { ligne: LigneReparation }) {
  const { reparation } = ligne;
  const immobiliseEncore = reparation.immobiliseDu != null && reparation.immobiliseAu == null;

  return (
    <tr>
      <td>
        <Link href={`/camions/${reparation.camionId}`} className="plate clair link">
          {reparation.camion.nom}
        </Link>
      </td>

      <td>
        <span className="t-title">{reparation.description}</span>
        <div className="t-sub">
          {LIBELLE_CATEGORIE_REPARATION[reparation.categorie] ?? reparation.categorie}
          {reparation.immobiliseDu ? ` · depuis le ${formatDate(reparation.immobiliseDu)}` : ""}
        </div>
      </td>

      <td className={reparation.garage ? undefined : "text-[var(--muted-2)]"}>
        {reparation.garage ?? "—"}
      </td>

      <td className={`num ${ligne.coutGnf > 0 ? "" : "vide"}`}>
        {ligne.coutGnf > 0 ? formatNombre(ligne.coutGnf) : "—"}
      </td>

      {/* Une immobilisation en cours coûte chaque jour : elle se lit en rouge. */}
      <td className={`num ${immobiliseEncore ? "neg" : ligne.joursImmobilise != null ? "" : "vide"}`}>
        {ligne.joursImmobilise != null ? `${ligne.joursImmobilise} j` : "—"}
      </td>

      <td>
        <span className={`badge ${BADGE[reparation.statut] ?? "b-idle"}`}>
          {LIBELLE_STATUT_REPARATION[reparation.statut]}
        </span>
      </td>
    </tr>
  );
}
