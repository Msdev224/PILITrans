import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { CarteCamion } from "@/components/carte-camion";
import { BarresRecetteCouts, CourbeMarge } from "@/components/graphiques";
import {
  IconeAlerteTriangle,
  IconeChauffeur,
  IconeCloche,
  IconeFacture,
  IconeHorloge,
} from "@/components/icones";
import type { AlerteVue } from "@/lib/donnees/alertes";
import { serieMensuelle } from "@/lib/donnees/camions";
import { tableauDeBord } from "@/lib/donnees/tableau-de-bord";
import {
  formatDecimal,
  formatGnf,
  formatMillions,
  formatMillionsSigne,
  formatNombre,
} from "@/lib/utils";

// Les chiffres viennent de la base : pas de mise en cache statique.
export const dynamic = "force-dynamic";

export default async function TableauDeBordPage() {
  const [session, donnees, serie] = await Promise.all([sessionRequise(), tableauDeBord(), serieMensuelle(6)]);

  const { periode, camions, contexteCamions, parc, creances, alertes, compteurAlertes, caisses } = donnees;
  const aDesDonnees = camions.some((c) => c.recetteGnf > 0 || c.couts > 0);

  return (
    <>
      <BarreHaut
        titre="Tableau de bord"
        sousTitre={`Vue d'ensemble — ${periode.libelle} · ${session.user.role === "GERANT" ? "gérant" : "chauffeur"}`}
        nbAlertesUrgentes={compteurAlertes.urgent}
        tauxReferenceXof={donnees.tauxReferenceXof}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {/* ---------- Indicateurs ---------- */}
        <div className="grid-kpi">
          <div className="card kpi posbar">
            <div className="lab">Recette du mois</div>
            <div className="val">
              {formatMillions(donnees.recetteGnf)}
              <span className="unit">M GNF</span>
            </div>
            <Delta valeur={donnees.variationRecettePct} suffixe="vs mois dernier" />
          </div>

          <div className="card kpi">
            <div className="lab">Marge d&apos;exploitation du mois</div>
            <div className="val">
              {formatMillionsSigne(donnees.margeExploitationGnf)}
              <span className="unit">M GNF</span>
            </div>
            {/* Le prix d'achat des camions n'entre pas dans ce chiffre : il est
                suivi comme capital à rembourser, sur l'écran Rentabilité. */}
            <div className="delta flat">
              Recette moins charges du mois · hors prix d&apos;achat
            </div>
          </div>

          <div className="card kpi warnbar">
            <div className="lab">Créances à recevoir</div>
            <div className="val">
              {formatMillions(creances.encours)}
              <span className="unit">M GNF</span>
            </div>
            <div className={`delta ${creances.enRetard > 0 ? "down" : "flat"}`}>
              {creances.enRetard > 0
                ? `dont ${formatMillions(creances.enRetard)} M en retard`
                : "aucun retard de paiement"}
            </div>
          </div>

          <div className={`card kpi ${parc.immobilises > 0 ? "negbar" : "posbar"}`}>
            <div className="lab">Camions</div>
            <div className="val">
              {parc.enRoute}
              <span className="unit">/{parc.total} en route</span>
            </div>
            <div className={`delta ${parc.immobilises > 0 ? "down" : "up"}`}>
              {parc.immobilises > 0
                ? `${parc.immobilises} immobilisé${parc.immobilises > 1 ? "s" : ""}`
                : `${parc.disponibles} disponible${parc.disponibles > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>

        {/* ---------- Trésorerie & carburant ---------- */}
        <div className="fin-strip">
          <div className="fin">
            <div className="l">Encaissé (factures réglées)</div>
            <div className="v">{formatGnf(creances.encaisse)}</div>
            <div className="s">Somme des règlements enregistrés</div>
          </div>
          <div className={`fin${creances.enRetard > 0 ? " retard" : ""}`}>
            <div className="l">Créances en retard</div>
            <div className="v">{formatGnf(creances.enRetard)}</div>
            <div className="s">Échéance dépassée, non réglée</div>
          </div>
          <div className="fin">
            <div className="l">Carburant / recette</div>
            <div className="v">{formatDecimal(donnees.ratioCarburantPct)} %</div>
            <div className="s">
              {formatGnf(donnees.carburantGnf)} de gasoil · vigilance au-delà de 45 %
            </div>
          </div>
        </div>

        {/* ---------- Graphiques ---------- */}
        {aDesDonnees ? (
          <div className="charts">
            <CourbeMarge points={serie} />
            <BarresRecetteCouts camions={camions} />
          </div>
        ) : null}

        {/* ---------- Flotte + panneaux latéraux ---------- */}
        <div className="cols">
          <div>
            <p className="eyebrow">Rentabilité par camion — {periode.libelle}</p>
            {camions.length > 0 ? (
              <div className="fleet">
                {camions.map((pnl) => {
                  const contexte = contexteCamions[pnl.camion.id];
                  return (
                    <CarteCamion
                      key={pnl.camion.id}
                      pnl={pnl}
                      temperature={contexte?.temperature}
                      destination={contexte?.destination}
                      statutVoyage={contexte?.statutVoyage}
                      signal={contexte?.signal}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="card panel">
                <p className="vide-msg">Aucun camion actif dans le parc.</p>
              </div>
            )}
          </div>

          <div>
            <div className="card panel">
              <div className="head-row !mb-3">
                <h3>Alertes</h3>
                <span className="sec-sub">
                  {compteurAlertes.urgent} urgente{compteurAlertes.urgent > 1 ? "s" : ""} ·{" "}
                  {compteurAlertes.total} au total
                </span>
              </div>
              {alertes.length > 0 ? (
                alertes.slice(0, 5).map((alerte) => <LigneAlerte key={alerte.id} alerte={alerte} />)
              ) : (
                <p className="vide-msg">Rien à signaler — tous les indicateurs sont dans les clous.</p>
              )}
            </div>

            <div className="card panel">
              <h3>Caisse chauffeurs</h3>
              {caisses.length > 0 ? (
                caisses.map((caisse) => (
                  <div key={caisse.chauffeurId} className="row">
                    <div className="ic accent">
                      <IconeChauffeur />
                    </div>
                    <div className="corps">
                      <div className="t">{caisse.nom}</div>
                      <div className="s">{caisse.situation}</div>
                    </div>
                    <div className="end">
                      <div className="cash">
                        {formatNombre(caisse.soldeGnf)} <span className="text-[var(--muted-2)]">GNF</span>
                      </div>
                      {caisse.soldeXof !== 0 ? (
                        <div className="cash cfa">+ {formatNombre(caisse.soldeXof)} CFA</div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="vide-msg">
                  Aucune avance en cours : toutes les caisses chauffeurs sont soldées.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Delta({ valeur, suffixe }: { valeur: number | null; suffixe: string }) {
  if (valeur === null) return <div className="delta flat">pas de référence {suffixe}</div>;
  const sens = valeur > 0 ? "up" : valeur < 0 ? "down" : "flat";
  const fleche = valeur > 0 ? "▲" : valeur < 0 ? "▼" : "—";
  return (
    <div className={`delta ${sens}`}>
      {fleche} {valeur > 0 ? "+" : ""}
      {valeur} % {suffixe}
    </div>
  );
}

const ICONE_ALERTE: Record<string, React.ReactNode> = {
  ECHEANCE_DOC: <IconeAlerteTriangle />,
  CARTE_BRUNE: <IconeAlerteTriangle />,
  ENTRETIEN_DU: <IconeHorloge />,
  RUPTURE_FROID: <IconeAlerteTriangle />,
  CONSO_ANORMALE: <IconeHorloge />,
  CAISSE: <IconeChauffeur />,
  IMMOBILISATION: <IconeAlerteTriangle />,
  AUTRE: <IconeFacture />,
};

const CLASSE_ICONE: Record<string, string> = { URGENT: "neg", ATTENTION: "warn", INFO: "accent" };
const BADGE_SEVERITE: Record<string, { classe: string; libelle: string }> = {
  URGENT: { classe: "b-down", libelle: "Urgent" },
  ATTENTION: { classe: "b-warn", libelle: "À vérifier" },
  INFO: { classe: "b-idle", libelle: "Info" },
};

function LigneAlerte({ alerte }: { alerte: AlerteVue }) {
  const badge = BADGE_SEVERITE[alerte.severite];
  return (
    <div className="row">
      <div className={`ic ${CLASSE_ICONE[alerte.severite]}`}>
        {ICONE_ALERTE[alerte.type] ?? <IconeCloche />}
      </div>
      <div className="corps">
        <div className="t">{alerte.titre}</div>
        {alerte.detail ? <div className="s">{alerte.detail}</div> : null}
      </div>
      <div className="end">
        <span className={`badge ${badge.classe}`}>{badge.libelle}</span>
      </div>
    </div>
  );
}
