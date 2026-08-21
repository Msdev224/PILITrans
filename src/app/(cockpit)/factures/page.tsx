import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { ActionsFacture } from "@/components/factures/actions-facture";
import {
  DialogueFacture,
  type FactureEditable,
  type OptionClient,
  type OptionVoyageFacturable,
} from "@/components/factures/dialogue-facture";
import { IconeLoupe, IconePlus } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import {
  estFiltreFacture,
  FILTRES_FACTURE,
  vueFactures,
  type FiltreFacture,
  type LigneFacture,
} from "@/lib/donnees/factures";
import { moisCourant } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { formatDateCourte, formatGnf, formatNombre, n } from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Factures — PILITrans" };

const BADGE_STATUT: Record<string, string> = {
  EMISE: "b-idle",
  PARTIELLE: "b-warn",
  PAYEE: "b-go",
  EN_RETARD: "b-down",
};

const LIBELLE_STATUT: Record<string, string> = {
  EMISE: "Émise",
  PARTIELLE: "Partielle",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
};

interface Props {
  searchParams: Promise<{ filtre?: string; q?: string }>;
}

export default async function FacturesPage({ searchParams }: Props) {
  const params = await searchParams;
  const filtre: FiltreFacture = estFiltreFacture(params.filtre) ? params.filtre : "toutes";
  const recherche = params.q ?? "";
  const periode = moisCourant();

  const [session, vue, parametres, fil, clients, voyages] = await Promise.all([
    sessionRequise(),
    vueFactures(periode, { filtre, recherche }),
    prisma.parametres.findFirst(),
    filAlertes(),
    prisma.client.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }),
    prisma.voyage.findMany({
      where: { statut: { not: "ANNULE" } },
      select: {
        id: true,
        reference: true,
        villeDepart: true,
        villeArrivee: true,
        clientId: true,
        client: { select: { nom: true } },
        lignes: {
          orderBy: { ordre: "asc" },
          select: { designation: true, quantiteACharger: true, unite: { select: { symbole: true } } },
        },
        recette: true,
        devise: true,
        recetteGnf: true,
        _count: { select: { factures: true } },
      },
      orderBy: { dateDepart: "desc" },
    }),
  ]);

  const tauxReferenceXof = parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null;
  const delaiPaiementJours = parametres?.delaiPaiementJours ?? 14;

  const optionsClients: OptionClient[] = clients;
  const optionsVoyages: OptionVoyageFacturable[] = voyages.map((v) => ({
    id: v.id,
    libelle: `${v.villeDepart} → ${v.villeArrivee} (${v.reference})`,
    client: v.client?.nom ?? null,
    // Le client de la facture se présélectionne depuis celui du voyage.
    clientId: v.clientId,
    // La désignation portée sur la facture reprend le chargement réel.
    marchandise:
      v.lignes.map((l) => l.designation).join(", ") || null,
    recette: n(v.recette),
    devise: v.devise,
    recetteGnf: n(v.recetteGnf),
    dejaFacture: v._count.factures > 0,
  }));

  const lienFiltre = (cle: FiltreFacture) => {
    const p = new URLSearchParams();
    if (cle !== "toutes") p.set("filtre", cle);
    if (recherche) p.set("q", recherche);
    const suffixe = p.toString();
    return suffixe ? `/factures?${suffixe}` : "/factures";
  };

  return (
    <>
      <BarreHaut
        titre="Factures & créances"
        sousTitre={`${vue.total} facture${vue.total > 1 ? "s" : ""} · ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={tauxReferenceXof}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="searchbar">
          <form className="seek" action="/factures">
            <IconeLoupe strokeWidth={2} />
            <input
              type="search"
              name="q"
              defaultValue={recherche}
              placeholder="Rechercher une facture ou un client…"
              aria-label="Rechercher une facture"
            />
            {filtre !== "toutes" ? <input type="hidden" name="filtre" value={filtre} /> : null}
          </form>
          <div className="chips">
            {FILTRES_FACTURE.map((f) => (
              <Link key={f.cle} href={lienFiltre(f.cle)} className={`chip-f${f.cle === filtre ? " on" : ""}`}>
                {f.libelle}
              </Link>
            ))}
          </div>
        </div>

        <div className="head-row">
          <h3>Factures &amp; créances</h3>
          <SiPeut droit="facturation.ecrire">
            <DialogueFacture
              clients={optionsClients}
              voyages={optionsVoyages}
              delaiPaiementJours={delaiPaiementJours}
              tauxReferenceXof={tauxReferenceXof}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Nouvelle facture
                </button>
              }
            />
          </SiPeut>
        </div>

        <div className="fin-strip">
          <div className="fin">
            <div className="l">Encours à recevoir</div>
            <div className="v">{formatGnf(vue.stats.encoursGnf)}</div>
            <div className="s">
              {vue.stats.nbOuvertes} facture{vue.stats.nbOuvertes > 1 ? "s" : ""} ouverte
              {vue.stats.nbOuvertes > 1 ? "s" : ""}
            </div>
          </div>
          <div className={`fin${vue.stats.enRetardGnf > 0 ? " retard" : ""}`}>
            <div className="l">En retard</div>
            <div className="v">{formatGnf(vue.stats.enRetardGnf)}</div>
            <div className="s">
              {vue.stats.nbEnRetard} facture{vue.stats.nbEnRetard > 1 ? "s" : ""} échue
              {vue.stats.nbEnRetard > 1 ? "s" : ""}
            </div>
          </div>
          <div className="fin">
            <div className="l">Encaissé ce mois</div>
            <div className="v">{formatGnf(vue.stats.encaisseMoisGnf)}</div>
            <div className="s">
              {vue.stats.nbPayeesMois} facture{vue.stats.nbPayeesMois > 1 ? "s" : ""} réglée
              {vue.stats.nbPayeesMois > 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {vue.lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Voyage</th>
                  <th className="num">Montant</th>
                  <th>Échéance</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vue.lignes.map((ligne) => (
                  <LigneTableau
                    key={ligne.facture.id}
                    ligne={ligne}
                    clients={optionsClients}
                    voyages={optionsVoyages}
                    delaiPaiementJours={delaiPaiementJours}
                    tauxReferenceXof={tauxReferenceXof}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucune facture ne correspond{recherche ? ` à « ${recherche} »` : " à ce filtre"}.{" "}
              <Link href="/factures" className="link">
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
  clients,
  voyages,
  delaiPaiementJours,
  tauxReferenceXof,
}: {
  ligne: LigneFacture;
  clients: OptionClient[];
  voyages: OptionVoyageFacturable[];
  delaiPaiementJours: number;
  tauxReferenceXof: number | null;
}) {
  const { facture } = ligne;
  const enRetard = ligne.joursRetard > 0;

  return (
    <tr>
      <td className="mono">{facture.numero}</td>
      <td>
        <Link href={`/clients?q=${encodeURIComponent(facture.client.nom)}`} className="link">
          {facture.client.nom}
        </Link>
      </td>
      <td className="t-sub">
        {facture.voyage ? (
          <Link href={`/voyages/${facture.voyage.id}`} className="link">
            {facture.voyage.villeDepart} → {facture.voyage.villeArrivee}
          </Link>
        ) : (
          <span className="text-[var(--muted-2)]">hors voyage</span>
        )}
      </td>

      <td className="num">
        {formatNombre(ligne.montantGnf)}
        {ligne.payeGnf > 0 && ligne.resteGnf > 0 ? (
          <div className="t-sub">reste {formatNombre(ligne.resteGnf)}</div>
        ) : null}
      </td>

      <td className={enRetard ? "font-semibold text-[var(--neg)]" : undefined}>
        {facture.echeance ? formatDateCourte(facture.echeance) : "—"}
        {enRetard ? <div className="t-sub text-[var(--neg)]">retard {ligne.joursRetard} j</div> : null}
      </td>

      <td>
        <span className={`badge ${BADGE_STATUT[facture.statut] ?? "b-idle"}`}>
          {facture.statut === "PAYEE" ? <span className="led" /> : null}
          {LIBELLE_STATUT[facture.statut] ?? facture.statut}
        </span>
        {/* Pénalité théorique au taux propre à la facture. */}
        {ligne.penaliteGnf ? (
          <div className="t-sub text-[var(--neg)]">pénalité ~{formatNombre(ligne.penaliteGnf)}</div>
        ) : null}
      </td>

      <td>
        <ActionsFacture
          facture={aplatir(ligne)}
          echue={facture.statut === "EN_RETARD"}
          numero={facture.numero}
          client={facture.client.nom}
          montantGnf={ligne.montantGnf}
          payeGnf={ligne.payeGnf}
          resteGnf={ligne.resteGnf}
          versements={ligne.versements}
          clients={clients}
          voyages={voyages}
          delaiPaiementJours={delaiPaiementJours}
          tauxReferenceXof={tauxReferenceXof}
        />
      </td>
    </tr>
  );
}

/** Les Decimal de Prisma ne traversent pas la frontière serveur → client. */
function aplatir(ligne: LigneFacture): FactureEditable {
  const { facture } = ligne;
  return {
    id: facture.id,
    numero: facture.numero,
    clientId: facture.clientId,
    voyageId: facture.voyageId,
    montant: n(facture.montant),
    devise: facture.devise,
    montantGnf: ligne.montantGnf,
    echeance: facture.echeance ? facture.echeance.toISOString().slice(0, 10) : null,
    marchandiseAssuree: facture.marchandiseAssuree,
    tauxPenaliteRetard: facture.tauxPenaliteRetard != null ? n(facture.tauxPenaliteRetard) : null,
    afficherEquivalentCfa: facture.afficherEquivalentCfa,
  };
}
