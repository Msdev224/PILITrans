import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import {
  IconeAlerteTriangle,
  IconeCamion,
  IconeChauffeur,
  IconeCloche,
  IconeFacture,
  IconeHorloge,
  IconeNeige,
} from "@/components/icones";
import {
  alertes as construireAlertes,
  compterParSeverite,
  estFiltreAlerte,
  filtrerAlertes,
  FILTRES_ALERTE,
  type AlerteVue,
  type FiltreAlerte,
} from "@/lib/donnees/alertes";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alertes — PILITrans" };

const CLASSE_SEVERITE: Record<string, string> = {
  URGENT: "crit",
  ATTENTION: "warn",
  INFO: "info",
};

const BADGE_SEVERITE: Record<string, { classe: string; libelle: string }> = {
  URGENT: { classe: "b-down", libelle: "Urgent" },
  ATTENTION: { classe: "b-warn", libelle: "À vérifier" },
  INFO: { classe: "b-idle", libelle: "Info" },
};

const ICONE: Record<string, React.ReactNode> = {
  ECHEANCE_DOC: <IconeAlerteTriangle strokeWidth={2} />,
  CARTE_BRUNE: <IconeAlerteTriangle strokeWidth={2} />,
  ENTRETIEN_DU: <IconeHorloge strokeWidth={2} />,
  RUPTURE_FROID: <IconeNeige strokeWidth={2} />,
  CONSO_ANORMALE: <IconeHorloge strokeWidth={2} />,
  CAISSE: <IconeChauffeur strokeWidth={2} />,
  IMMOBILISATION: <IconeCamion strokeWidth={2} />,
  AUTRE: <IconeFacture strokeWidth={2} />,
};

interface Props {
  searchParams: Promise<{ filtre?: string }>;
}

export default async function AlertesPage({ searchParams }: Props) {
  const params = await searchParams;
  const filtre: FiltreAlerte = estFiltreAlerte(params.filtre) ? params.filtre : "toutes";

  const [session, fil, parametres] = await Promise.all([
    sessionRequise(),
    construireAlertes(),
    prisma.parametres.findFirst(),
  ]);

  const compteur = compterParSeverite(fil);
  const affichees = filtrerAlertes(fil, filtre);

  const lienFiltre = (cle: FiltreAlerte) => (cle === "toutes" ? "/alertes" : `/alertes?filtre=${cle}`);

  return (
    <>
      <BarreHaut
        titre="Alertes"
        sousTitre={
          compteur.total === 0
            ? "Rien à signaler"
            : `${compteur.total} alerte${compteur.total > 1 ? "s" : ""} · ${compteur.urgent} urgente${compteur.urgent > 1 ? "s" : ""}`
        }
        nbAlertesUrgentes={compteur.urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="al-sum">
          <span className="al-scount crit">
            <b>{compteur.urgent}</b> urgente{compteur.urgent > 1 ? "s" : ""}
          </span>
          <span className="al-scount warn">
            <b>{compteur.attention}</b> à surveiller
          </span>
          <span className="al-scount info">
            <b>{compteur.info}</b> info
          </span>
        </div>

        <div className="al-filters">
          {FILTRES_ALERTE.map((f) => (
            <Link key={f.cle} href={lienFiltre(f.cle)} className={`chip-f${f.cle === filtre ? " on" : ""}`}>
              {f.libelle}
            </Link>
          ))}
        </div>

        {affichees.length > 0 ? (
          <div className="alerts">
            {affichees.map((alerte) => (
              <Alerte key={alerte.id} alerte={alerte} />
            ))}
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              {compteur.total === 0
                ? "Rien à signaler — tous les indicateurs sont dans les clous."
                : "Aucune alerte dans cette catégorie."}{" "}
              {compteur.total > 0 ? (
                <Link href="/alertes" className="link">
                  Tout afficher
                </Link>
              ) : null}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Alerte({ alerte }: { alerte: AlerteVue }) {
  const badge = BADGE_SEVERITE[alerte.severite];

  return (
    <div className={`alert ${CLASSE_SEVERITE[alerte.severite]}`}>
      <div className="al-ic">{ICONE[alerte.type] ?? <IconeCloche strokeWidth={2} />}</div>

      <div className="al-main">
        <div className="al-title">{alerte.titre}</div>
        {alerte.detail ? <div className="al-sub">{alerte.detail}</div> : null}
        {alerte.meta.length > 0 ? (
          <div className="al-meta">
            {alerte.meta.map((m, i) => (
              <span key={`${alerte.id}-${i}`} className="contents">
                {i > 0 ? <span className="mdot" /> : null}
                <span>{m}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="al-end">
        <span className={`badge ${badge.classe}`}>{badge.libelle}</span>
        {/* Chaque alerte mène à l'écran où elle se traite. */}
        {alerte.lien ? (
          <Link href={alerte.lien} className="al-act">
            {alerte.action ?? "Ouvrir"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
