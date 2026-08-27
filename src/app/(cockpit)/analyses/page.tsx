import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import {
  AnneauCouts,
  BarresCorridors,
  BarresMargeCamion,
  BarresRecetteCouts,
  CourbeMarge,
} from "@/components/graphiques";
import { IconeAnalyses, IconeAlerteTriangle, IconeHorloge } from "@/components/icones";
import { analyses } from "@/lib/donnees/analyses";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { prisma } from "@/lib/prisma";
import { formatDecimal, formatNombre, n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analyses" };

export default async function AnalysesPage() {
  const [session, vue, parametres, fil] = await Promise.all([
    sessionRequise(),
    analyses(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const seuilCarburant = 45;
  const aDesDonnees = vue.camions.some((c) => c.recetteGnf > 0 || c.couts > 0);

  return (
    <>
      <BarreHaut
        titre="Analyses"
        sousTitre={`Indicateurs de flotte — ${vue.periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {!aDesDonnees ? (
          <div className="card panel">
            <p className="vide-msg">
              Aucun mouvement sur {vue.periode.libelle} — les indicateurs apparaîtront dès les
              premiers voyages.
            </p>
          </div>
        ) : (
          <>
            <div className="grid-kpi">
              <div className="card kpi">
                <div className="lab">Coût par km (flotte)</div>
                <div className="val">
                  {formatNombre(vue.coutKm)}
                  <span className="unit">GNF/km</span>
                </div>
                <div className="delta flat">
                  recette ≈ {formatNombre(vue.recetteKm)} GNF/km · variable{" "}
                  {formatNombre(vue.coutVariableKm)}
                </div>
              </div>

              <div className={`card kpi ${vue.tauxUtilisationPct < 50 ? "negbar" : "posbar"}`}>
                <div className="lab">Taux d&apos;utilisation</div>
                <div className="val">
                  {formatDecimal(vue.tauxUtilisationPct)}
                  <span className="unit">%</span>
                </div>
                <div className="delta flat">
                  {vue.joursRoulage} j roulés / {vue.joursDisponibles} j-camion
                </div>
              </div>

              <div className={`card kpi ${vue.tauxAVidePct > 0 ? "warnbar" : ""}`}>
                <div className="lab">Trajets à vide</div>
                <div className="val">
                  {formatDecimal(vue.tauxAVidePct)}
                  <span className="unit">% des km</span>
                </div>
                <div className={`delta ${vue.tauxAVidePct > 0 ? "down" : "up"}`}>
                  {vue.tauxAVidePct > 0 ? "à réduire — chercher du fret retour" : "aucun km à vide"}
                </div>
              </div>

              <div className={`card kpi ${vue.ratioCarburantPct > seuilCarburant ? "negbar" : ""}`}>
                <div className="lab">Carburant / recette</div>
                <div className="val">
                  {formatDecimal(vue.ratioCarburantPct)}
                  <span className="unit">%</span>
                </div>
                <div className={`delta ${vue.ratioCarburantPct > seuilCarburant ? "down" : "flat"}`}>
                  vigilance au-delà de {seuilCarburant} %
                </div>
              </div>
            </div>

            <div className="charts">
              <CourbeMarge points={vue.serie} />
              <BarresRecetteCouts camions={vue.camions} />
              <BarresMargeCamion camions={vue.camions} />
              <AnneauCouts postes={vue.postes} total={vue.coutsTotalGnf} />
              <BarresCorridors corridors={vue.corridors} />
            </div>

            <LectureDesChiffres vue={vue} seuilCarburant={seuilCarburant} />
          </>
        )}
      </div>
    </>
  );
}

/**
 * Lecture commentée : les constats sont dérivés des chiffres réels, pas écrits
 * d'avance. Rien ne s'affiche si rien ne le justifie.
 */
function LectureDesChiffres({
  vue,
  seuilCarburant,
}: {
  vue: Awaited<ReturnType<typeof analyses>>;
  seuilCarburant: number;
}) {
  const constats: { icone: React.ReactNode; classe: string; titre: string; detail: string }[] = [];

  const rentables = vue.corridors.filter((c) => c.margeGnf > 0);
  if (rentables.length >= 2) {
    const [premier, second] = rentables;
    constats.push({
      icone: <IconeAnalyses />,
      classe: "accent",
      titre: `${premier.libelle} porte la marge`,
      detail: `Ce corridor dégage ${formatNombre(premier.margeGnf)} GNF contre ${formatNombre(second.margeGnf)} GNF pour ${second.libelle} — y concentrer les camions disponibles.`,
    });
  }

  if (vue.tauxAVidePct > 0) {
    const aVide = vue.corridors.find((c) => c.libelle === "Trajets à vide");
    constats.push({
      icone: <IconeHorloge />,
      classe: "warn",
      titre: `${formatDecimal(vue.tauxAVidePct)} % de km à vide`,
      detail: aVide
        ? `Ces trajets coûtent environ ${formatNombre(Math.abs(aVide.margeGnf))} GNF sans recette. Chercher du fret retour réduirait directement ce poste.`
        : "Chercher du fret retour réduirait directement ce poste.",
    });
  }

  const deficitaires = vue.camions.filter((c) => c.margeExploitation < 0);
  for (const camion of deficitaires) {
    constats.push({
      icone: <IconeAlerteTriangle />,
      classe: "neg",
      titre: `${camion.camion.nom} pèse sur la flotte`,
      detail: `Marge d'exploitation de ${formatNombre(camion.margeExploitation)} GNF ce mois${
        camion.recetteGnf === 0 ? " — aucune recette sur la période." : "."
      }`,
    });
  }

  if (vue.ratioCarburantPct > seuilCarburant) {
    constats.push({
      icone: <IconeHorloge />,
      classe: "warn",
      titre: "Le carburant pèse trop dans la recette",
      detail: `${formatDecimal(vue.ratioCarburantPct)} % de la recette part en gasoil, au-dessus du seuil de vigilance de ${seuilCarburant} %.`,
    });
  }

  if (constats.length === 0) return null;

  return (
    <div className="card panel">
      <h3>Ce que ces chiffres disent</h3>
      {constats.map((constat) => (
        <div key={constat.titre} className="row">
          <div className={`ic ${constat.classe}`}>{constat.icone}</div>
          <div className="corps">
            <div className="t">{constat.titre}</div>
            <div className="s">{constat.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
