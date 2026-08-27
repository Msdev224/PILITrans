import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { classements } from "@/lib/donnees/classements";
import { moisCourant } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDecimal, formatNombre, formatSigne, n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classements" };

export default async function ClassementsPage() {
  const periode = moisCourant();
  const [session, vue, parametres, fil] = await Promise.all([
    sessionRequise(),
    classements(periode),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const pct = (v: number | null) => (v === null ? "—" : `${formatDecimal(v)} %`);
  const deficitaires = vue.trajets.filter((t) => t.margeReelleGnf < 0 && t.recetteGnf > 0);

  return (
    <>
      <BarreHaut
        titre="Classements"
        sousTitre={`Où l'argent se gagne et se perd — ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {/* ---------- Camions ---------- */}
        <div className="head-row">
          <h3>
            Camions <span className="sec-sub">— du plus au moins rentable</span>
          </h3>
        </div>

        {vue.camions.length > 0 ? (
          <div className="card overflow-x-auto mb-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Camion</th>
                  <th className="num">Missions</th>
                  <th className="num">Recette</th>
                  <th className="num">Charges</th>
                  <th className="num">Résultat</th>
                  <th className="num">Marge</th>
                  <th className="num">Revenu/km</th>
                  <th className="num">Coût/km</th>
                  <th className="num">À vide</th>
                </tr>
              </thead>
              <tbody>
                {vue.camions.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/camions/${c.id}`} className="lien-fiche">
                        <b>{c.nom}</b>
                      </Link>
                    </td>
                    <td className="num">{c.nbVoyages}</td>
                    <td className="num">{formatNombre(c.recetteGnf)}</td>
                    <td className="num">{formatNombre(c.chargesGnf)}</td>
                    <td className={`num ${c.recetteManquante ? "vide" : c.resultatGnf >= 0 ? "pos" : "neg"}`}>
                      {c.recetteManquante ? "à renseigner" : formatSigne(c.resultatGnf)}
                    </td>
                    <td className="num">{c.recetteManquante ? "—" : pct(c.margePct)}</td>
                    <td className="num muted">{c.km > 0 ? formatNombre(c.revenuKmGnf) : "—"}</td>
                    <td className="num muted">{c.km > 0 ? formatNombre(c.coutKmGnf) : "—"}</td>
                    <td className={`num ${c.tauxAVidePct > 30 ? "neg" : "muted"}`}>
                      {c.km > 0 ? `${formatDecimal(c.tauxAVidePct)} %` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel mb-5">
            <p className="vide-msg">Aucun camion actif sur la période.</p>
          </div>
        )}

        {/* ---------- Trajets déficitaires ---------- */}
        {deficitaires.length > 0 ? (
          <>
            <div className="head-row">
              <h3>
                Trajets déficitaires{" "}
                <span className="sec-sub">— quote-part du camion comprise</span>
              </h3>
            </div>
            <div className="card overflow-x-auto mb-5">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Trajet</th>
                    <th>Camion</th>
                    <th>Date</th>
                    <th className="num">Recette</th>
                    <th className="num">Coûts directs</th>
                    <th className="num">Quote-part camion</th>
                    <th className="num">Marge réelle</th>
                  </tr>
                </thead>
                <tbody>
                  {deficitaires.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/voyages/${t.id}`} className="lien-fiche">
                          <b>{t.trajet}</b>
                        </Link>
                        <div className="t-sub">{t.reference}</div>
                      </td>
                      <td className="muted">{t.camion}</td>
                      <td className="muted">{formatDate(t.dateDepart)}</td>
                      <td className="num">{formatNombre(t.recetteGnf)}</td>
                      <td className="num">{formatNombre(t.coutsDirectsGnf)}</td>
                      <td className="num muted">{formatNombre(t.quotePartVehiculeGnf)}</td>
                      <td className="num neg">{formatSigne(t.margeReelleGnf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {/* ---------- Clients ---------- */}
        <div className="head-row">
          <h3>
            Clients <span className="sec-sub">— contribution au résultat</span>
          </h3>
        </div>

        {vue.clients.length > 0 ? (
          <div className="card overflow-x-auto mb-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="num">Missions</th>
                  <th className="num">Chiffre d&apos;affaires</th>
                  <th className="num">Coûts</th>
                  <th className="num">Résultat</th>
                  <th className="num">Marge</th>
                  <th className="num">Revenu/km</th>
                </tr>
              </thead>
              <tbody>
                {vue.clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.id}`} className="lien-fiche">
                        <b>{c.nom}</b>
                      </Link>
                    </td>
                    <td className="num">{c.nbMissions}</td>
                    <td className="num">{formatNombre(c.chiffreAffairesGnf)}</td>
                    <td className="num">{formatNombre(c.coutsGnf)}</td>
                    <td className={`num ${c.resultatGnf >= 0 ? "pos" : "neg"}`}>
                      {formatSigne(c.resultatGnf)}
                    </td>
                    <td className="num">{pct(c.margePct)}</td>
                    <td className="num muted">{c.km > 0 ? formatNombre(c.revenuKmGnf) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel mb-5">
            <p className="vide-msg">Aucune mission rattachée à un client sur la période.</p>
          </div>
        )}

        {/* ---------- Chauffeurs ---------- */}
        <div className="head-row">
          <h3>Chauffeurs</h3>
        </div>

        {vue.chauffeurs.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Chauffeur</th>
                  <th className="num">Missions</th>
                  <th className="num">Km</th>
                  <th className="num">Recette générée</th>
                  <th className="num">Rémunération</th>
                  <th className="num">Écarts de livraison</th>
                </tr>
              </thead>
              <tbody>
                {vue.chauffeurs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.nom}</b>
                    </td>
                    <td className="num">{c.nbVoyages}</td>
                    <td className="num">{formatNombre(c.km)}</td>
                    <td className="num">{formatNombre(c.recetteGeneree)}</td>
                    <td className="num muted">{formatNombre(c.remunerationGnf)}</td>
                    <td className={`num ${c.nbEcarts > 0 ? "neg" : "muted"}`}>
                      {c.nbEcarts > 0 ? c.nbEcarts : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">Aucune mission sur la période.</p>
          </div>
        )}

        <p className="note-bas">
          Les chauffeurs sont décrits par leurs composantes, jamais par une note. Un écart de
          livraison se constate et se discute ; un score agrégé ne se discute pas, il se subit.
          La quote-part camion est répartie au prorata des kilomètres réellement parcourus :
          la somme des quotes-parts égale exactement ce que le camion a coûté.
        </p>
      </div>
    </>
  );
}
