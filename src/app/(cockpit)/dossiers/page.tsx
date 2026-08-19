import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconeDossier, IconeInfo } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { vueDossiers, type DossierVoyage, type Piece } from "@/lib/donnees/dossiers";
import { prisma } from "@/lib/prisma";
import { formatDateCourte, n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dossiers — PILITrans" };

const FILTRES = [
  { cle: "tous", libelle: "Tous" },
  { cle: "incomplets", libelle: "À compléter" },
  { cle: "complets", libelle: "Complets" },
  { cle: "internationaux", libelle: "Internationaux" },
] as const;

type Filtre = (typeof FILTRES)[number]["cle"];

const CLASSE_PIECE: Record<string, string> = {
  fourni: "ok",
  expire: "warn",
  manquant: "miss",
  "sans-objet": "hs",
};

const BADGE_PIECE: Record<string, { classe: string; libelle: string }> = {
  fourni: { classe: "b-go", libelle: "Fourni" },
  expire: { classe: "b-warn", libelle: "À vérifier" },
  manquant: { classe: "b-down", libelle: "Manquant" },
  "sans-objet": { classe: "b-idle", libelle: "Sans objet" },
};

interface Props {
  searchParams: Promise<{ filtre?: string }>;
}

export default async function DossiersPage({ searchParams }: Props) {
  const params = await searchParams;
  const filtre: Filtre = FILTRES.some((f) => f.cle === params.filtre)
    ? (params.filtre as Filtre)
    : "tous";

  const [session, dossiers, parametres, fil] = await Promise.all([
    sessionRequise(),
    vueDossiers(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const affiches = dossiers.filter((d) => {
    if (filtre === "incomplets") return d.completPct < 100;
    if (filtre === "complets") return d.completPct === 100;
    if (filtre === "internationaux") return d.international;
    return true;
  });

  const incomplets = dossiers.filter((d) => d.completPct < 100).length;

  return (
    <>
      <BarreHaut
        titre="Dossiers"
        sousTitre={`${dossiers.length} dossier${dossiers.length > 1 ? "s" : ""} · ${incomplets} à compléter`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Le dossier regroupe ce qu&apos;un voyage doit produire — facture, preuve de chaîne du
            froid, carte brune à l&apos;international, quantités réconciliées. La complétude est{" "}
            <b>déduite des données saisies</b> ; le téléversement de pièces PDF demanderait un
            modèle de stockage, qui n&apos;existe pas encore.
          </span>
        </div>

        <div className="searchbar">
          <div className="chips">
            {FILTRES.map((f) => (
              <Link
                key={f.cle}
                href={f.cle === "tous" ? "/dossiers" : `/dossiers?filtre=${f.cle}`}
                className={`chip-f${f.cle === filtre ? " on" : ""}`}
              >
                {f.libelle}
              </Link>
            ))}
          </div>
        </div>

        {affiches.length > 0 ? (
          affiches.map((dossier) => <Dossier key={dossier.voyageId} dossier={dossier} />)
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucun dossier dans ce filtre.{" "}
              <Link href="/dossiers" className="link">
                Tout afficher
              </Link>
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Dossier({ dossier }: { dossier: DossierVoyage }) {
  const complet = dossier.completPct === 100;

  return (
    <div className="card panel doss-card">
      <div className="doss-head">
        <h3>
          <Link href={`/voyages/${dossier.voyageId}`} className="link">
            {dossier.trajet}
          </Link>
          <span className={`badge ${dossier.international ? "b-intl" : "b-dom"} ml-1.5`}>
            {dossier.international ? "INTL" : "DOM"}
          </span>
        </h3>
        <span className="chip">
          <span className="k">{dossier.camionNom}</span>
          <span className="v">{formatDateCourte(dossier.dateDepart)}</span>
        </span>
      </div>

      <div className="doss-prog">
        <div className="jauge flex-1">
          <i className={complet ? "full" : undefined} style={{ width: `${dossier.completPct}%` }} />
        </div>
        <div className="doss-metatxt">
          {/* Un trajet à vide sur un porteur national n'exige aucune pièce :
              « Complet · 0 / 0 » induirait en erreur. */}
          {dossier.exigibles === 0 ? (
            <b className="g">Rien d&apos;exigible</b>
          ) : complet ? (
            <>
              <b className="g">Complet</b> · {dossier.fournis} / {dossier.exigibles} pièces
            </>
          ) : (
            <>
              {dossier.fournis} / {dossier.exigibles} pièces
              {dossier.manquants > 0 ? (
                <>
                  {" · "}
                  <b className="n">{dossier.manquants} manquante{dossier.manquants > 1 ? "s" : ""}</b>
                </>
              ) : null}
              {dossier.expirent > 0 ? (
                <>
                  {" · "}
                  <b className="w">{dossier.expirent} à vérifier</b>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div>
        {dossier.pieces.map((piece) => (
          <LignePiece key={piece.libelle} piece={piece} />
        ))}
      </div>
    </div>
  );
}

function LignePiece({ piece }: { piece: Piece }) {
  const badge = BADGE_PIECE[piece.etat];

  return (
    <div className={`doc ${CLASSE_PIECE[piece.etat]}`}>
      <div className="doc-ic">
        <IconeDossier strokeWidth={2} />
      </div>
      <div className="doc-main">
        <div className="doc-t">{piece.libelle}</div>
        <div className="doc-s">{piece.detail}</div>
      </div>
      <div className="doc-end">
        <span className={`badge ${badge.classe}`}>{badge.libelle}</span>
        {/* Une pièce manquante mène à l'écran où la produire. */}
        {piece.lien && piece.etat !== "fourni" && piece.etat !== "sans-objet" ? (
          <Link href={piece.lien} className="doc-act">
            Compléter
          </Link>
        ) : null}
      </div>
    </div>
  );
}
