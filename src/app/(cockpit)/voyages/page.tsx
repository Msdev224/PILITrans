import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconeFacture, IconeInfo, IconeLoupe, IconePlus } from "@/components/icones";
import {
  DialogueFacture,
  type OptionClient,
  type OptionVoyageFacturable,
} from "@/components/factures/dialogue-facture";
import { ActionsVoyage } from "@/components/voyages/actions-voyage";
import {
  DialogueVoyage,
  type OptionCamion,
  type OptionUnite,
  type OptionChauffeur,
  type VoyageEditable,
} from "@/components/voyages/dialogue-voyage";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import {
  estFiltreVoyage,
  FILTRES,
  vueVoyages,
  type FiltreVoyage,
  type LigneVoyage,
} from "@/lib/donnees/voyages";
import { moisCourant } from "@/lib/periode";
import { paysActifs } from "@/lib/donnees/pays";
import { unitesActives } from "@/lib/donnees/unites";
import { prisma } from "@/lib/prisma";
import {
  formatDecimal,
  formatMillions,
  formatNombre,
  formatSigne,
  LIBELLE_STATUT_VOYAGE,
  n,
} from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Voyages — PILITrans" };

// Codes pays courts pour le badge « INTL · SN ».

const BADGE_STATUT: Record<string, string> = {
  PLANIFIE: "b-idle",
  EN_ATTENTE_CHARGEMENT: "b-idle",
  EN_COURS: "b-warn",
  ARRIVE_DESTINATION: "b-warn",
  EN_DECHARGEMENT: "b-warn",
  TERMINE: "b-go",
};

interface Props {
  searchParams: Promise<{ filtre?: string; q?: string }>;
}

export default async function VoyagesPage({ searchParams }: Props) {
  const params = await searchParams;
  const filtre: FiltreVoyage = estFiltreVoyage(params.filtre) ? params.filtre : "tous";
  const recherche = params.q ?? "";
  const periode = moisCourant();

  const [session, vue, parametres, fil, camions, chauffeurs, unites, pays, clients] = await Promise.all([
    sessionRequise(),
    vueVoyages(periode, { filtre, recherche }),
    prisma.parametres.findFirst(),
    filAlertes(),
    prisma.camion.findMany({
      where: { actif: true },
      select: { id: true, nom: true, immatTracteur: true, photo: true },
      orderBy: { nom: "asc" },
    }),
    prisma.chauffeur.findMany({
      where: { actif: true },
      select: { id: true, nom: true, telephone: true, photo: true },
      orderBy: { nom: "asc" },
    }),
    unitesActives(),
    paysActifs(),
    prisma.client.findMany({
      select: { id: true, nom: true, ville: true, telephone: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  const tauxReferenceXof = parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null;
  const delaiPaiementJours = parametres?.delaiPaiementJours ?? 14;

  // Voyages facturables, pour le raccourci « Facturer ce voyage ».
  const voyagesFacturables: OptionVoyageFacturable[] = vue.lignes.map((l) => ({
    id: l.voyage.id,
    libelle: `${l.voyage.villeDepart} → ${l.voyage.villeArrivee} (${l.voyage.reference})`,
    client: l.voyage.client?.nom ?? null,
    clientId: l.voyage.clientId,
    marchandise: l.chargement === "—" ? null : l.chargement,
    recette: n(l.voyage.recette),
    devise: l.voyage.devise,
    recetteGnf: l.recetteGnf,
    dejaFacture: l.facture,
  }));

  const lienFiltre = (cle: FiltreVoyage) => {
    const p = new URLSearchParams();
    if (cle !== "tous") p.set("filtre", cle);
    if (recherche) p.set("q", recherche);
    const suffixe = p.toString();
    return suffixe ? `/voyages?${suffixe}` : "/voyages";
  };

  return (
    <>
      <BarreHaut
        titre="Voyages"
        sousTitre={`${vue.total} mission${vue.total > 1 ? "s" : ""} enregistrée${vue.total > 1 ? "s" : ""} · ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={tauxReferenceXof}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {/* Recherche + filtres : de simples liens, l'état vit dans l'URL. */}
        <div className="searchbar">
          <form className="seek" action="/voyages">
            <IconeLoupe strokeWidth={2} />
            <input
              type="search"
              name="q"
              defaultValue={recherche}
              placeholder="Rechercher un voyage, un client, un camion…"
              aria-label="Rechercher un voyage"
            />
            {filtre !== "tous" ? <input type="hidden" name="filtre" value={filtre} /> : null}
          </form>
          <div className="chips">
            {FILTRES.map((f) => (
              <Link
                key={f.cle}
                href={lienFiltre(f.cle)}
                className={`chip-f${f.cle === filtre ? " on" : ""}`}
              >
                {f.libelle}
              </Link>
            ))}
          </div>
        </div>

        <div className="vstats">
          <div className="vstat">
            <div className="vs-lab">Missions en cours</div>
            <div className="vs-val">{vue.stats.enCours}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Terminées ce mois</div>
            <div className="vs-val">{vue.stats.terminesMois}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Recette du mois</div>
            <div className="vs-val pos">
              {formatMillions(vue.stats.recetteMoisGnf)} <span>M GNF</span>
            </div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Km à vide</div>
            <div className={`vs-val${vue.stats.tauxAVidePct > 0 ? " warn" : ""}`}>
              {formatDecimal(vue.stats.tauxAVidePct)} <span>%</span>
            </div>
          </div>
        </div>

        <div className="head-row">
          <h3>Voyages</h3>
          <SiPeut droit="voyages.ecrire">
            <DialogueVoyage
              camions={camions}
              chauffeurs={chauffeurs}
              unites={unites}
              pays={pays}
              clients={clients}
              tauxReferenceXof={tauxReferenceXof}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Nouveau voyage
                </button>
              }
            />
          </SiPeut>
        </div>

        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Un voyage peut partir <b>à vide</b> (repositionnement), ou aller chercher la marchandise et{" "}
            <b>attendre plusieurs jours avant le chargement</b> — l&apos;attente est suivie et chiffrée.
          </span>
        </div>

        {vue.lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl voy-table">
              <thead>
                <tr>
                  <th>Trajet</th>
                  <th>Type</th>
                  <th>Client</th>
                  <th>Camion</th>
                  <th className="num">Recette</th>
                  <th className="num">Marge</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vue.lignes.map((ligne) => (
                  <LigneTableau
                    key={ligne.voyage.id}
                    unites={unites}
                    pays={pays}
                    ligne={ligne}
                    camions={camions}
                    chauffeurs={chauffeurs}
                    tauxReferenceXof={tauxReferenceXof}
                    clients={clients}
                    voyagesFacturables={voyagesFacturables}
                    delaiPaiementJours={delaiPaiementJours}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucun voyage ne correspond{recherche ? ` à « ${recherche} »` : " à ce filtre"}.{" "}
              <Link href="/voyages" className="link">
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
  camions,
  unites,
  pays,
  clients,
  chauffeurs,
  tauxReferenceXof,
  voyagesFacturables,
  delaiPaiementJours,
}: {
  ligne: LigneVoyage;
  camions: OptionCamion[];
  unites: OptionUnite[];
  pays: { id: string; nom: string }[];
  /** Même forme pour les deux dialogues : { id, nom }. */
  clients: OptionClient[];
  chauffeurs: OptionChauffeur[];
  tauxReferenceXof: number | null;
  voyagesFacturables: OptionVoyageFacturable[];
  delaiPaiementJours: number;
}) {
  const { voyage } = ligne;
  const enAttente = voyage.statut === "EN_ATTENTE_CHARGEMENT" || voyage.statut === "PLANIFIE";
  const classeEtat = ligne.termine ? "st-done" : enAttente ? "st-wait" : ligne.enRoute ? "st-active" : "st-wait";
  // La marge n'a de sens qu'une fois la recette connue.
  const margeConnue = ligne.recetteGnf > 0 || ligne.termine;


  return (
    <tr className={classeEtat}>
      <td className="t-title">
        <Link href={`/voyages/${voyage.id}`} className="link">
          {voyage.villeDepart} → {voyage.villeArrivee}
        </Link>
        <div className="t-sub">
          {[
            ligne.chargement === "—" ? null : ligne.chargement,
            voyage.nbRotations > 1 ? `${voyage.nbRotations} rotations` : null,
            voyage.reference,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </td>

      <td>
        <div className="flex flex-wrap gap-1">
          {ligne.international ? (
            <span className="badge b-intl">INTL · {voyage.paysArrivee?.code ?? "?"}</span>
          ) : (
            <span className="badge b-dom">DOM</span>
          )}
          {voyage.aVide ? <span className="badge b-vide">À VIDE</span> : null}
          {voyage.statut === "EN_ATTENTE_CHARGEMENT" && ligne.joursAttente > 0 ? (
            <span className="badge b-warn">Attente charg. · {ligne.joursAttente} j</span>
          ) : null}
        </div>
      </td>

      <td>
        {voyage.client ? (
          <Link href={`/clients/${voyage.clientId}`} className="link">
            {voyage.client.nom}
          </Link>
        ) : (
          <span className="text-[var(--muted-2)]">—</span>
        )}
      </td>

      <td>
        <Link href={`/camions/${voyage.camionId}`} className="link">
          {voyage.camion.nom}
        </Link>
        <div className="t-sub">{voyage.chauffeur.nom}</div>
      </td>

      <td className={`num ${ligne.recetteGnf > 0 ? "" : "vide"}`}>
        {ligne.recetteGnf > 0 ? formatNombre(ligne.recetteGnf) : ligne.termine ? "0" : "—"}
      </td>

      <td className={`num ${margeConnue ? (ligne.margeGnf >= 0 ? "pos" : "neg") : "vide"}`}>
        {margeConnue ? formatSigne(ligne.margeGnf) : ligne.enRoute ? "en cours" : "à venir"}
      </td>

      <td>
        <div className="flex flex-wrap gap-1">
          <span className={`badge ${BADGE_STATUT[voyage.statut] ?? "b-idle"}`}>
            {LIBELLE_STATUT_VOYAGE[voyage.statut]}
          </span>
          {ligne.facture ? <span className="badge b-idle">Facturée</span> : null}
        </div>
      </td>

      <td>
        <div className="flex items-center justify-end gap-1.5">
          {/* CLAUDE.md : la facture se crée DEPUIS un voyage. */}
          {!ligne.facture && ligne.recetteGnf > 0 ? (
            <DialogueFacture
              clients={clients}
              voyages={voyagesFacturables}
              delaiPaiementJours={delaiPaiementJours}
              tauxReferenceXof={tauxReferenceXof}
              voyageImpose={voyage.id}
              declencheur={
                <button
                  type="button"
                  title="Facturer ce voyage"
                  className="grid h-[29px] w-[29px] place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--muted-2)] hover:text-[var(--ink)]"
                >
                  <IconeFacture width={14} height={14} />
                </button>
              }
            />
          ) : null}
          <ActionsVoyage
            voyage={aplatir(ligne)}
          camions={camions}
          chauffeurs={chauffeurs}
          unites={unites}
          pays={pays}
          clients={clients}
          tauxReferenceXof={tauxReferenceXof}
            aDesEcritures={ligne.postes.length > 0 || ligne.facture}
          />
        </div>
      </td>
    </tr>
  );
}

/** Les Decimal de Prisma ne traversent pas la frontière serveur → client. */
function aplatir(ligne: LigneVoyage): VoyageEditable {
  const { voyage } = ligne;
  return {
    id: voyage.id,
    reference: voyage.reference,
    camionId: voyage.camionId,
    chauffeurId: voyage.chauffeurId,
    paysDepartId: voyage.paysDepartId,
    villeDepart: voyage.villeDepart,
    paysArriveeId: voyage.paysArriveeId,
    villeArrivee: voyage.villeArrivee,
    clientId: voyage.clientId,
    vaChercher: voyage.vaChercher,
    marchandises: ligne.marchandises.map((m) => ({
      id: m.id,
      designation: m.designation,
      uniteId: m.uniteId,
      quantiteACharger: m.quantiteACharger,
      clientId: m.clientId,
    })),
    distanceKm: voyage.distanceKm,
    dateDepart: voyage.dateDepart.toISOString().slice(0, 10),
    aVide: voyage.aVide,
    recette: n(voyage.recette),
    devise: voyage.devise,
    recetteGnf: ligne.recetteGnf,
    nbRotations: voyage.nbRotations,
    tarifRotation: voyage.tarifRotation != null ? n(voyage.tarifRotation) : null,
    statut: voyage.statut,
  };
}
