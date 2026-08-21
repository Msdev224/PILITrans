import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { ActionsDepense } from "@/components/depenses/actions-depense";
import {
  DialogueDepense,
  type DepenseEditable,
  type OptionCamionSimple,
  type OptionVoyage,
} from "@/components/depenses/dialogue-depense";
import { IconeInfo, IconeLoupe, IconePlus } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import {
  estFiltreDepense,
  FILTRES_DEPENSE,
  vueDepenses,
  type FiltreDepense,
  type LigneDepense,
} from "@/lib/donnees/depenses";
import { moisCourant } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import {
  formatDecimal,
  formatMillions,
  formatNombre,
  LIBELLE_TYPE_DEPENSE,
  n,
} from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dépenses — PILITrans" };

interface Props {
  searchParams: Promise<{ filtre?: string; q?: string }>;
}

export default async function DepensesPage({ searchParams }: Props) {
  const params = await searchParams;
  const filtre: FiltreDepense = estFiltreDepense(params.filtre) ? params.filtre : "toutes";
  const recherche = params.q ?? "";
  const periode = moisCourant();

  const [session, vue, parametres, fil, voyages, camions, chauffeurs] = await Promise.all([
    sessionRequise(),
    vueDepenses(periode, { filtre, recherche }),
    prisma.parametres.findFirst(),
    filAlertes(),
    prisma.voyage.findMany({
      where: { statut: { not: "ANNULE" } },
      select: { id: true, reference: true, villeDepart: true, villeArrivee: true },
      orderBy: { dateDepart: "desc" },
    }),
    prisma.camion.findMany({
      where: { actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    // Pour imputer une dépense à la caisse d'un chauffeur en une seule saisie.
    prisma.chauffeur.findMany({
      where: { actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  const tauxReferenceXof = parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null;
  const optionsVoyages: OptionVoyage[] = voyages.map((v) => ({
    id: v.id,
    libelle: `${v.villeDepart} → ${v.villeArrivee} (${v.reference})`,
  }));
  const optionsCamions: OptionCamionSimple[] = camions;

  const lienFiltre = (cle: FiltreDepense) => {
    const p = new URLSearchParams();
    if (cle !== "toutes") p.set("filtre", cle);
    if (recherche) p.set("q", recherche);
    const suffixe = p.toString();
    return suffixe ? `/depenses?${suffixe}` : "/depenses";
  };

  return (
    <>
      <BarreHaut
        titre="Dépenses"
        sousTitre={`${vue.total} dépense${vue.total > 1 ? "s" : ""} enregistrée${vue.total > 1 ? "s" : ""} · ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={tauxReferenceXof}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="searchbar">
          <form className="seek" action="/depenses">
            <IconeLoupe strokeWidth={2} />
            <input
              type="search"
              name="q"
              defaultValue={recherche}
              placeholder="Rechercher une dépense…"
              aria-label="Rechercher une dépense"
            />
            {filtre !== "toutes" ? <input type="hidden" name="filtre" value={filtre} /> : null}
          </form>
          <div className="chips">
            {FILTRES_DEPENSE.map((f) => (
              <Link key={f.cle} href={lienFiltre(f.cle)} className={`chip-f${f.cle === filtre ? " on" : ""}`}>
                {f.libelle}
              </Link>
            ))}
          </div>
        </div>

        <div className="vstats">
          <div className="vstat">
            <div className="vs-lab">Total du mois</div>
            <div className="vs-val">
              {formatMillions(vue.stats.totalMoisGnf)} <span>M GNF</span>
            </div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Dont carburant</div>
            <div className="vs-val">
              {formatMillions(vue.stats.gasoilMoisGnf)} <span>M GNF</span>
            </div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Litres du mois</div>
            <div className="vs-val">
              {formatNombre(vue.stats.litresMois)} <span>L</span>
            </div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Payé en devise</div>
            <div className="vs-val">
              {formatMillions(vue.stats.partDeviseGnf)} <span>M GNF</span>
            </div>
          </div>
        </div>

        <div className="head-row">
          <h3>Dépenses</h3>
          <SiPeut droit="depenses.ecrire">
            <DialogueDepense
              voyages={optionsVoyages}
              camions={optionsCamions}
              chauffeurs={chauffeurs}
              tauxReferenceXof={tauxReferenceXof}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Nouvelle dépense
                </button>
              }
            />
          </SiPeut>
        </div>

        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Le gasoil se saisit en <b>litres</b> — c&apos;est ce qui rend la consommation calculable.
            L&apos;<b>internet</b> est un forfait dont le prix dépend de la <b>localisation</b> du camion.
          </span>
        </div>

        {vue.lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Rattachement</th>
                  <th className="num">Litres</th>
                  <th className="num">Montant</th>
                  <th className="num">Taux</th>
                  <th className="num">Équiv. GNF</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vue.lignes.map((ligne) => (
                  <LigneTableau
                    key={ligne.depense.id}
                    ligne={ligne}
                    voyages={optionsVoyages}
                    camions={optionsCamions}
                    tauxReferenceXof={tauxReferenceXof}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucune dépense ne correspond{recherche ? ` à « ${recherche} »` : " à ce filtre"}.{" "}
              <Link href="/depenses" className="link">
                Tout afficher
              </Link>
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function LigneTableau({
  ligne,
  voyages,
  camions,
  tauxReferenceXof,
}: {
  ligne: LigneDepense;
  voyages: OptionVoyage[];
  camions: OptionCamionSimple[];
  tauxReferenceXof: number | null;
}) {
  const { depense } = ligne;
  const voyage = depense.voyage;
  const camion = voyage?.camion ?? depense.camion;

  return (
    <tr>
      <td>
        <span className="t-title">{LIBELLE_TYPE_DEPENSE[depense.type] ?? depense.type}</span>
        {depense.description ? <div className="t-sub">{depense.description}</div> : null}
      </td>

      <td>
        {voyage ? (
          <Link href={`/voyages/${voyage.id}`} className="link">
            {voyage.villeDepart} → {voyage.villeArrivee}
          </Link>
        ) : (
          <span className="text-[var(--muted-2)]">hors voyage</span>
        )}
        {camion ? <div className="t-sub">{camion.nom}</div> : null}
      </td>

      <td className={`num ${ligne.litres ? "" : "vide"}`}>
        {ligne.litres ? `${formatNombre(ligne.litres)} L` : "—"}
      </td>

      <td className="num">
        <span className={depense.devise === "XOF" ? "text-[var(--intl)]" : undefined}>
          {formatNombre(n(depense.montant))} {depense.devise === "XOF" ? "CFA" : "GNF"}
        </span>
      </td>

      {/* Le taux se relit depuis les montants figés, il n'est pas stocké. */}
      <td className={`num ${ligne.tauxApplique != null ? "" : "vide"}`}>
        {ligne.tauxApplique != null ? `× ${formatDecimal(ligne.tauxApplique, 2)}` : "—"}
      </td>

      <td className="num">{formatNombre(ligne.montantGnf)}</td>

      <td>
        <ActionsDepense
          depense={aplatir(ligne)}
          voyages={voyages}
          camions={camions}
          tauxReferenceXof={tauxReferenceXof}
        />
      </td>
    </tr>
  );
}

/** Les Decimal de Prisma ne traversent pas la frontière serveur → client. */
function aplatir(ligne: LigneDepense): DepenseEditable {
  const { depense } = ligne;
  return {
    id: depense.id,
    type: depense.type,
    montant: n(depense.montant),
    devise: depense.devise,
    montantGnf: ligne.montantGnf,
    litres: ligne.litres,
    releveCompteur: depense.releveCompteur,
    description: depense.description,
    moyen: depense.moyen,
    reference: depense.reference,
    date: depense.date.toISOString().slice(0, 10),
    voyageId: depense.voyageId,
    camionId: depense.camionId,
  };
}
