import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { pnlFlotte } from "@/lib/donnees/camions";
import { vueClients } from "@/lib/donnees/clients";
import { ecrituresSansCompte, soldesParCompte } from "@/lib/donnees/comptes-tresorerie";
import { resultatExploitation } from "@/lib/donnees/exploitation";
import { prisma } from "@/lib/prisma";
import {
  LIBELLE_TYPE_COMPTE,
  LIBELLE_TYPE_DEPENSE,
  formatDate,
  formatDecimal,
  formatNombre,
  formatSigne,
  n,
} from "@/lib/utils";
import { LIBELLE_TYPE_PERIODE, periodeDeType, type TypePeriode } from "@/lib/periode";
import { NOM_APPLICATION } from "@/lib/marque";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rapport" };

const TYPES: TypePeriode[] = ["MOIS", "TRIMESTRE", "SEMESTRE", "ANNEE"];

interface Props {
  searchParams: Promise<{ periode?: string }>;
}

export default async function RapportPage({ searchParams }: Props) {
  const { periode: demandee } = await searchParams;
  const type: TypePeriode = TYPES.includes(demandee as TypePeriode)
    ? (demandee as TypePeriode)
    : "MOIS";
  const periode = periodeDeType(type);

  const [session, resultat, camions, clients, soldes, orphelines, parametres, fil, nonFacturees] =
    await Promise.all([
      sessionRequise(),
      resultatExploitation(periode),
      pnlFlotte(periode),
      vueClients(),
      soldesParCompte(),
      ecrituresSansCompte(),
      prisma.parametres.findFirst(),
      filAlertes(),
      prisma.voyage.count({
        where: {
          statut: "TERMINE",
          factures: { none: {} },
          dateDepart: { gte: periode.debut, lt: periode.fin },
        },
      }),
    ]);

  const tresorerie = soldes.filter((s) => s.actif);
  const totalTresorerie = tresorerie.reduce((t, s) => t + s.soldeGnf, 0);
  const encours = clients.reduce((t, c) => t + c.encoursGnf, 0);
  const enRetard = clients.reduce((t, c) => t + c.enRetardGnf, 0);
  const actifs = camions.filter((c) => c.nbVoyages > 0 || c.couts > 0);

  return (
    <>
      <BarreHaut
        titre="Rapport"
        sousTitre={`Situation complète — ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {/* ---------- Choix de la période ---------- */}
        <div className="searchbar no-print">
          <div className="chips">
            {TYPES.map((t) => (
              <Link
                key={t}
                href={`/rapport?periode=${t}`}
                className={`chip-f ${t === type ? "on" : ""}`}
              >
                {LIBELLE_TYPE_PERIODE[t]}
              </Link>
            ))}
          </div>
          <BoutonImprimer libelle="Imprimer le rapport" />
        </div>

        {/* ---------- En-tête du document ---------- */}
        <div className="rapport-tete">
          <div>
            <h2>{parametres?.raisonSociale ?? NOM_APPLICATION}</h2>
            <p className="t-sub">
              Rapport d&apos;exploitation · {periode.libelle} · établi le {formatDate(new Date())}
            </p>
          </div>
        </div>

        {/* ---------- 1. Résultat ---------- */}
        <h3 className="rapport-titre">1 · Résultat d&apos;exploitation</h3>
        <div className="card overflow-x-auto mb-5">
          <table className="tbl">
            <tbody>
              <tr>
                <td>Chiffre d&apos;affaires</td>
                <td className="num">
                  <b>{formatNombre(resultat.chiffreAffairesGnf)}</b>
                </td>
              </tr>
              <tr>
                <td>Charges directes <span className="t-sub">— carburant, péages, per diem</span></td>
                <td className="num text-[var(--neg)]">
                  {resultat.chargesDirectesGnf > 0 ? `−${formatNombre(resultat.chargesDirectesGnf)}` : "0"}
                </td>
              </tr>
              <tr>
                <td>Charges de véhicule <span className="t-sub">— réparations, entretiens, pièces</span></td>
                <td className="num text-[var(--neg)]">
                  {resultat.chargesVehiculeGnf > 0 ? `−${formatNombre(resultat.chargesVehiculeGnf)}` : "0"}
                </td>
              </tr>
              <tr>
                <td>Charges de structure <span className="t-sub">— loyer, salaires, électricité</span></td>
                <td className="num text-[var(--neg)]">
                  {resultat.chargesStructureGnf > 0 ? `−${formatNombre(resultat.chargesStructureGnf)}` : "0"}
                </td>
              </tr>
              <tr className="ligne-total">
                <td>
                  <b>Résultat d&apos;exploitation</b>
                </td>
                <td className={`num ${resultat.resultatGnf >= 0 ? "text-[var(--pos)]" : "neg"}`}>
                  <b>{formatSigne(resultat.resultatGnf)} GNF</b>
                  {resultat.margePct != null ? (
                    <div className="t-sub">{formatDecimal(resultat.margePct)} % du chiffre d&apos;affaires</div>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ---------- 2. Où est l'argent ---------- */}
        <h3 className="rapport-titre">2 · Trésorerie au {formatDate(new Date())}</h3>
        <div className="card overflow-x-auto mb-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Emplacement</th>
                <th>Nature</th>
                <th className="num">Solde</th>
              </tr>
            </thead>
            <tbody>
              {tresorerie.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.nom}
                    {s.detenteur ? <div className="t-sub">Détenu par {s.detenteur}</div> : null}
                  </td>
                  <td className="t-sub">{LIBELLE_TYPE_COMPTE[s.type] ?? s.type}</td>
                  <td className={`num ${s.soldeGnf < 0 ? "neg" : ""}`}>{formatNombre(s.soldeGnf)}</td>
                </tr>
              ))}
              <tr className="ligne-total">
                <td colSpan={2}>
                  <b>Total détenu</b>
                </td>
                <td className="num">
                  <b>{formatNombre(totalTresorerie)} GNF</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {orphelines.nb > 0 ? (
          <p className="note-bas mb-5">
            {orphelines.nb > 1
              ? `${orphelines.nb} écritures ne précisent pas leur emplacement et n'entrent donc pas dans ce total.`
              : "Une écriture ne précise pas son emplacement et n'entre donc pas dans ce total."}
          </p>
        ) : null}

        {/* ---------- 3. Par véhicule ---------- */}
        <h3 className="rapport-titre">3 · Rentabilité par véhicule</h3>
        <div className="card overflow-x-auto mb-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Véhicule</th>
                <th className="num">Voyages</th>
                <th className="num">Recette</th>
                <th className="num">Charges</th>
                <th className="num">Marge</th>
              </tr>
            </thead>
            <tbody>
              {actifs.map((c) => (
                <tr key={c.camion.id}>
                  <td>
                    <b>{c.camion.nom}</b>
                  </td>
                  <td className="num">{c.nbVoyages}</td>
                  <td className="num">{formatNombre(c.recetteGnf)}</td>
                  <td className="num">{formatNombre(c.couts)}</td>
                  <td className={`num ${c.margeExploitation >= 0 ? "text-[var(--pos)]" : "neg"}`}>
                    <b>{formatSigne(c.margeExploitation)}</b>
                  </td>
                </tr>
              ))}
              {actifs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="vide-msg">
                    Aucun véhicule n&apos;a roulé sur la période.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* ---------- 4. Ce que doivent les clients ---------- */}
        <h3 className="rapport-titre">4 · Créances</h3>
        <div className="card overflow-x-auto mb-5">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th className="num">Encours</th>
                <th className="num">Dont en retard</th>
              </tr>
            </thead>
            <tbody>
              {clients
                .filter((c) => c.encoursGnf > 0)
                .map((c) => (
                  <tr key={c.client.id}>
                    <td>{c.client.nom}</td>
                    <td className="num">{formatNombre(c.encoursGnf)}</td>
                    <td className={`num ${c.enRetardGnf > 0 ? "neg" : "vide"}`}>
                      {c.enRetardGnf > 0 ? formatNombre(c.enRetardGnf) : "—"}
                    </td>
                  </tr>
                ))}
              <tr className="ligne-total">
                <td>
                  <b>Total à recevoir</b>
                </td>
                <td className="num">
                  <b>{formatNombre(encours)}</b>
                </td>
                <td className={`num ${enRetard > 0 ? "neg" : ""}`}>
                  <b>{formatNombre(enRetard)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ---------- 5. Activité ---------- */}
        <h3 className="rapport-titre">5 · Activité</h3>
        <div className="card panel mb-5">
          <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <div>
              Missions
              <b className="mono mt-0.5 block text-[13px]">{resultat.nbVoyages}</b>
            </div>
            <div>
              Kilomètres
              <b className="mono mt-0.5 block text-[13px]">{formatNombre(resultat.km)}</b>
            </div>
            <div>
              Part à vide
              <b className="mono mt-0.5 block text-[13px]">{formatDecimal(resultat.tauxAVidePct)} %</b>
            </div>
            <div>
              Missions non facturées
              <b className={`mono mt-0.5 block text-[13px] ${nonFacturees > 0 ? "text-[var(--neg)]" : ""}`}>
                {nonFacturees}
              </b>
            </div>
          </div>
        </div>

        {/* ---------- 6. Détail des charges ---------- */}
        <h3 className="rapport-titre">6 · Détail des charges</h3>
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Poste</th>
                <th className="num">Montant</th>
                <th className="num">Part</th>
              </tr>
            </thead>
            <tbody>
              {resultat.postes.map((p) => (
                <tr key={`${p.categorie}-${p.type}`}>
                  <td>{LIBELLE_TYPE_DEPENSE[p.type] ?? p.type}</td>
                  <td className="num">{formatNombre(p.montantGnf)}</td>
                  <td className="num t-sub">
                    {resultat.chargesTotalesGnf > 0
                      ? `${formatDecimal((p.montantGnf / resultat.chargesTotalesGnf) * 100)} %`
                      : "—"}
                  </td>
                </tr>
              ))}
              <tr className="ligne-total">
                <td>
                  <b>Total des charges</b>
                </td>
                <td className="num">
                  <b>{formatNombre(resultat.chargesTotalesGnf)}</b>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <p className="note-bas">
          Le prix d&apos;achat des véhicules ne figure pas dans les charges : il est engagé une
          fois et suivi séparément, comme un capital que la marge rembourse. Les charges de
          structure ne sont pas réparties par camion — la rentabilité par véhicule les ignore
          donc, et c&apos;est le résultat d&apos;exploitation ci-dessus qui dit si l&apos;entreprise
          gagne de l&apos;argent.
        </p>
      </div>
    </>
  );
}
