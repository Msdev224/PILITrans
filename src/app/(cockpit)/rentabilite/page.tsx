import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { rentabiliteFlotte } from "@/lib/donnees/camions";
import { moisCourant } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import {
  formatDecimal,
  formatGnf,
  formatMois,
  formatNombre,
  formatSigne,
  n,
} from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rentabilité par véhicule — PILITrans" };

export default async function RentabilitePage() {
  const periode = moisCourant();
  const [session, lignes, parametres, fil] = await Promise.all([
    sessionRequise(),
    rentabiliteFlotte(periode),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const totalRecette = lignes.reduce((t, l) => t + l.pnl.recetteGnf, 0);
  const totalMarge = lignes.reduce((t, l) => t + l.pnl.margeExploitation, 0);
  const totalInvesti = lignes.reduce((t, l) => t + (l.capital.coutAcquisition ?? 0), 0);
  const totalReste = lignes.reduce((t, l) => t + l.capital.resteGnf, 0);
  const rembourses = lignes.filter((l) => l.capital.rembourse && l.capital.coutAcquisition).length;

  return (
    <>
      <BarreHaut
        titre="Rentabilité par véhicule"
        sousTitre={`Ce que rapporte chaque camion — ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {lignes.length === 0 ? (
          <div className="card panel">
            <p className="muted">
              Aucun véhicule actif : la rentabilité apparaîtra dès qu&apos;un camion sera
              enregistré.
            </p>
          </div>
        ) : (
          <>
            {/* ---------- Résultat du mois : exploitation seule ---------- */}
            <div className="head-row">
              <h3>
                Résultat d&apos;exploitation <span className="sec-sub">— {periode.libelle}</span>
              </h3>
            </div>

            <p className="note-methode">
              Le résultat du mois compte les charges réellement engagées : carburant,
              rémunération, réparations, entretien et frais de route. Le prix d&apos;achat du
              véhicule n&apos;y figure pas — il est suivi plus bas, comme un capital à
              rembourser.
            </p>

            <div className="card overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Véhicule</th>
                    <th className="num">Voyages</th>
                    <th className="num">Km</th>
                    <th className="num">Recette</th>
                    <th className="num">Charges</th>
                    <th className="num">Marge d&apos;exploitation</th>
                    <th className="num">Marge / km</th>
                    <th className="num">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map(({ pnl, partMargePct }) => {
                    // Les charges affichées excluent l'amortissement : le tableau
                    // doit se lire ligne à ligne sans retrancher mentalement l'achat.
                    const charges = pnl.recetteGnf - pnl.margeExploitation;
                    return (
                      <tr key={pnl.camion.id}>
                        <td>
                          <Link href={`/camions/${pnl.camion.id}`} className="lien-fiche">
                            <b>{pnl.camion.nom}</b>
                          </Link>
                          <div className="t-sub">{pnl.camion.immatTracteur}</div>
                        </td>
                        <td className="num">{pnl.nbVoyages}</td>
                        <td className="num">{pnl.km > 0 ? formatNombre(pnl.km) : "—"}</td>
                        <td className="num">{formatNombre(pnl.recetteGnf)}</td>
                        <td className="num">{formatNombre(charges)}</td>
                        <td className={`num ${pnl.margeExploitation >= 0 ? "pos" : "neg"}`}>
                          {formatSigne(pnl.margeExploitation)}
                        </td>
                        <td className={`num ${pnl.margeKm >= 0 ? "pos" : "neg"}`}>
                          {pnl.km > 0 ? formatSigne(pnl.margeKm) : "—"}
                        </td>
                        <td className="num">
                          {partMargePct > 0 ? (
                            <span className="part-barre" title={`${partMargePct} % de la marge`}>
                              <span style={{ width: `${partMargePct}%` }} />
                              <b>{partMargePct} %</b>
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td>Flotte</td>
                    <td className="num">{lignes.reduce((t, l) => t + l.pnl.nbVoyages, 0)}</td>
                    <td className="num">{formatNombre(lignes.reduce((t, l) => t + l.pnl.km, 0))}</td>
                    <td className="num">{formatNombre(totalRecette)}</td>
                    <td className="num">{formatNombre(totalRecette - totalMarge)}</td>
                    <td className={`num ${totalMarge >= 0 ? "pos" : "neg"}`}>
                      {formatSigne(totalMarge)}
                    </td>
                    <td className="num" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ---------- Investissement : suivi séparé ---------- */}
            <div className="head-row mt-6">
              <h3>Récupération de l&apos;investissement</h3>
            </div>

            <p className="note-methode">
              L&apos;achat d&apos;un camion est engagé une fois. Plutôt que de l&apos;étaler en
              charge mensuelle — ce qui pénaliserait un véhicule récent et flatterait un
              véhicule déjà payé, à travail égal — il est suivi ici comme un capital que la
              marge d&apos;exploitation rembourse mois après mois.
            </p>

            <div className="card overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Véhicule</th>
                    <th className="num">Investi</th>
                    <th className="num">Récupéré</th>
                    <th className="num">Reste</th>
                    <th>Avancement</th>
                    <th className="num">Marge moyenne / mois actif</th>
                    <th>Remboursement</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map(({ pnl, capital }) => (
                    <tr key={pnl.camion.id}>
                      <td>
                        <Link href={`/camions/${pnl.camion.id}`} className="lien-fiche">
                          <b>{pnl.camion.nom}</b>
                        </Link>
                      </td>
                      <td className="num">
                        {capital.coutAcquisition !== null
                          ? formatNombre(capital.coutAcquisition)
                          : "—"}
                      </td>
                      <td className="num">
                        {capital.coutAcquisition !== null ? formatNombre(capital.cumuleGnf) : "—"}
                      </td>
                      <td className="num">
                        {capital.coutAcquisition !== null ? formatNombre(capital.resteGnf) : "—"}
                      </td>
                      <td>
                        {capital.coutAcquisition !== null ? (
                          <span className="jauge" title={`${capital.avancementPct} % remboursé`}>
                            <span
                              className={capital.rembourse ? "rempli ok" : "rempli"}
                              style={{ width: `${capital.avancementPct}%` }}
                            />
                            <b>{capital.avancementPct} %</b>
                          </span>
                        ) : (
                          <span className="muted">Coût d&apos;acquisition non renseigné</span>
                        )}
                      </td>
                      <td className={`num ${capital.moyenneMensuelleGnf >= 0 ? "pos" : "neg"}`}>
                        {capital.coutAcquisition !== null
                          ? formatSigne(capital.moyenneMensuelleGnf)
                          : "—"}
                      </td>
                      <td>
                        {capital.coutAcquisition === null ? (
                          <span className="muted">—</span>
                        ) : capital.rembourse ? (
                          <span className="badge b-go">Remboursé</span>
                        ) : capital.horizonDepasse ? (
                          <span className="badge b-warn" title="Projection au-delà de 10 ans">
                            Au-delà de 10 ans
                          </span>
                        ) : capital.moisRestants === null ? (
                          // Annoncer une date à partir d'une marge nulle ou négative
                          // reviendrait à inventer une prévision.
                          <span className="badge b-down">
                            Non remboursé au rythme actuel
                          </span>
                        ) : (
                          <span>
                            <b className="mono">{capital.moisRestants}</b> mois
                            {capital.dateRemboursement ? (
                              <span className="t-sub"> · vers {formatMois(capital.dateRemboursement)}</span>
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="recap-invest">
              <div>
                Capital engagé
                <b className="mono">{formatGnf(totalInvesti)}</b>
              </div>
              <div>
                Reste à récupérer
                <b className="mono">{formatGnf(totalReste)}</b>
              </div>
              <div>
                Véhicules remboursés
                <b className="mono">
                  {rembourses}/{lignes.filter((l) => l.capital.coutAcquisition !== null).length}
                </b>
              </div>
              <div>
                Marge d&apos;exploitation du mois
                <b className={`mono ${totalMarge >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}>
                  {formatSigne(totalMarge)} GNF
                </b>
              </div>
            </div>

            <p className="note-bas">
              La marge moyenne se calcule sur les mois où le véhicule a réellement travaillé :
              les mois antérieurs à la mise en service de l&apos;application n&apos;ont pas de
              données et fausseraient la moyenne. Les véhicules sans coût d&apos;acquisition
              renseigné n&apos;apparaissent pas dans ce suivi — complétez leur fiche pour les y
              faire entrer. Taux de marge de la flotte :{" "}
              {totalRecette > 0 ? `${formatDecimal((totalMarge / totalRecette) * 100)} %` : "—"}.
            </p>
          </>
        )}
      </div>
    </>
  );
}
