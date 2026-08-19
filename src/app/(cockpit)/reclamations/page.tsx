import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconeInfo, IconePlus } from "@/components/icones";
import { ActionsReclamation } from "@/components/reclamations/actions-reclamation";
import {
  DialogueReclamation,
  type OptionVoyageReclamation,
  type ReclamationEditable,
} from "@/components/reclamations/dialogue-reclamation";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import {
  estFiltreReclamation,
  FILTRES_RECLAMATION,
  vueReclamations,
  type FiltreReclamation,
  type LigneReclamation,
} from "@/lib/donnees/reclamations";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDecimal, formatNombre, n } from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réclamations — PILITrans" };

const LIBELLE_TYPE: Record<string, string> = {
  QUANTITE: "Quantité",
  QUALITE: "Qualité",
  RETARD: "Retard",
  RUPTURE_FROID: "Chaîne du froid",
  AUTRE: "Autre",
};

const BADGE_STATUT: Record<string, { classe: string; libelle: string }> = {
  OUVERTE: { classe: "b-down", libelle: "Ouverte" },
  EN_COURS: { classe: "b-warn", libelle: "En cours" },
  RESOLUE: { classe: "b-go", libelle: "Résolue" },
  REJETEE: { classe: "b-idle", libelle: "Rejetée" },
};

interface Props {
  searchParams: Promise<{ filtre?: string }>;
}

export default async function ReclamationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filtre: FiltreReclamation = estFiltreReclamation(params.filtre) ? params.filtre : "toutes";

  const [session, vue, parametres, fil, clients, voyages, factures] = await Promise.all([
    sessionRequise(),
    vueReclamations({ filtre }),
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
        lignes: {
          orderBy: { ordre: "asc" },
          select: {
            id: true,
            designation: true,
            quantiteLivree: true,
            unite: { select: { symbole: true } },
          },
        },
      },
      orderBy: { dateDepart: "desc" },
    }),
    prisma.facture.findMany({
      select: { id: true, numero: true, client: { select: { nom: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Une entrée par marchandise : c'est le niveau auquel une quantité se conteste.
  const optionsVoyages: OptionVoyageReclamation[] = voyages.flatMap((v) =>
    v.lignes.map((l) => ({
      id: l.id,
      voyageId: v.id,
      libelle: `${v.villeDepart} → ${v.villeArrivee} (${v.reference}) — ${l.designation}`,
      symbole: l.unite.symbole,
      livree: l.quantiteLivree != null ? n(l.quantiteLivree) : null,
    })),
  );
  const optionsFactures = factures.map((f) => ({ id: f.id, libelle: `${f.numero} — ${f.client.nom}` }));

  const lienFiltre = (cle: FiltreReclamation) =>
    cle === "toutes" ? "/reclamations" : `/reclamations?filtre=${cle}`;

  return (
    <>
      <BarreHaut
        titre="Réclamations"
        sousTitre={`${vue.total} réclamation${vue.total > 1 ? "s" : ""} · ${vue.stats.ouvertes} ouverte${vue.stats.ouvertes > 1 ? "s" : ""}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="searchbar">
          <div className="chips">
            {FILTRES_RECLAMATION.map((f) => (
              <Link key={f.cle} href={lienFiltre(f.cle)} className={`chip-f${f.cle === filtre ? " on" : ""}`}>
                {f.libelle}
              </Link>
            ))}
          </div>
        </div>

        <div className="vstats">
          <div className="vstat">
            <div className="vs-lab">Ouvertes</div>
            <div className={`vs-val${vue.stats.ouvertes > 0 ? " warn" : ""}`}>{vue.stats.ouvertes}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">En cours de traitement</div>
            <div className="vs-val">{vue.stats.enCours}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Tonnes contestées</div>
            <div className="vs-val">
              {formatDecimal(vue.stats.tonnesContestees)} <span>t</span>
            </div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Avoirs accordés</div>
            <div className="vs-val">
              {formatNombre(vue.stats.avoirsAccordesGnf)} <span>GNF</span>
            </div>
          </div>
        </div>

        <div className="head-row">
          <h3>Réclamations</h3>
          <SiPeut droit="clients.ecrire">
            <DialogueReclamation
              clients={clients}
              voyages={optionsVoyages}
              factures={optionsFactures}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Nouvelle réclamation
                </button>
              }
            />
          </SiPeut>
        </div>

        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Le client peut <b>contester la quantité reçue</b>. L&apos;écran recoupe sa déclaration avec la{" "}
            <b>quantité livrée</b> saisie par le chauffeur — la résolution se fait par avoir, remise ou
            rejet motivé.
          </span>
        </div>

        {vue.lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client / voyage</th>
                  <th>Nature</th>
                  <th className="num">Livré</th>
                  <th className="num">Reconnu</th>
                  <th className="num">Écart</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vue.lignes.map((ligne) => (
                  <LigneTableau
                    key={ligne.reclamation.id}
                    ligne={ligne}
                    clients={clients}
                    voyages={optionsVoyages}
                    factures={optionsFactures}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              {vue.total === 0 ? "Aucune réclamation enregistrée." : "Aucune réclamation dans ce filtre."}{" "}
              {vue.total > 0 ? (
                <Link href="/reclamations" className="link">
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

function LigneTableau({
  ligne,
  clients,
  voyages,
  factures,
}: {
  ligne: LigneReclamation;
  clients: { id: string; nom: string }[];
  voyages: OptionVoyageReclamation[];
  factures: { id: string; libelle: string }[];
}) {
  const { reclamation } = ligne;
  const badge = BADGE_STATUT[reclamation.statut];
  const contestee =
    reclamation.quantiteContestee != null ? n(reclamation.quantiteContestee) : null;

  return (
    <tr>
      <td>
        <span className="t-title">{reclamation.client.nom}</span>
        <div className="t-sub">
          {reclamation.voyage ? (
            <Link href={`/voyages/${reclamation.voyage.id}`} className="link">
              {reclamation.voyage.villeDepart} → {reclamation.voyage.villeArrivee}
            </Link>
          ) : (
            "hors voyage"
          )}
          {" · "}
          {formatDate(reclamation.dateOuverture)}
        </div>
      </td>

      <td>
        {LIBELLE_TYPE[reclamation.type] ?? reclamation.type}
        <div className="t-sub max-w-[280px]">{reclamation.description}</div>
      </td>

      <td className={`num ${ligne.livree != null ? "" : "vide"}`}>
        {ligne.livree != null ? `${formatDecimal(ligne.livree)} t` : "—"}
      </td>

      <td className={`num ${contestee != null ? "" : "vide"}`}>
        {contestee != null ? `${formatDecimal(contestee)} t` : "—"}
      </td>

      {/* Écart entre le déclaré et le reconnu : le cœur du litige. */}
      <td
        className={`num ${
          ligne.ecartConteste == null ? "vide" : ligne.ecartConteste > 0 ? "neg" : "pos"
        }`}
      >
        {ligne.ecartConteste != null ? `${formatDecimal(ligne.ecartConteste)} t` : "—"}
        {ligne.perteMission ? (
          <div className="t-sub">perte mission {formatDecimal(ligne.perteMission)} t</div>
        ) : null}
      </td>

      <td>
        <span className={`badge ${badge.classe}`}>{badge.libelle}</span>
        {ligne.avoirGnf ? (
          <div className="t-sub">avoir {formatNombre(ligne.avoirGnf)}</div>
        ) : null}
      </td>

      <td>
        <ActionsReclamation
          reclamation={aplatir(ligne)}
          clients={clients}
          voyages={voyages}
          factures={factures}
        />
      </td>
    </tr>
  );
}

function aplatir(ligne: LigneReclamation): ReclamationEditable {
  const { reclamation } = ligne;
  return {
    id: reclamation.id,
    clientId: reclamation.clientId,
    voyageId: reclamation.voyageId,
    ligneId: reclamation.ligneId,
    factureId: reclamation.factureId,
    type: reclamation.type,
    description: reclamation.description,
    quantiteContestee:
      reclamation.quantiteContestee != null ? n(reclamation.quantiteContestee) : null,
    statut: reclamation.statut,
    resolution: reclamation.resolution,
    montantAvoirGnf: ligne.avoirGnf,
  };
}
