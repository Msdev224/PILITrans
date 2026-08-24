import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { ActionsChauffeur } from "@/components/equipe/actions-chauffeur";
import { DialogueCaisse } from "@/components/equipe/dialogue-caisse";
import { HistoriqueCaisse } from "@/components/equipe/historique-caisse";
import { DialogueChauffeur, type ChauffeurEditable } from "@/components/equipe/dialogue-chauffeur";
import { IconeInfo, IconePlus, IconeDepense } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { vueChauffeurs, type LigneChauffeur } from "@/lib/donnees/equipe";
import { moisCourant } from "@/lib/periode";
import { indicatifsPays } from "@/lib/donnees/pays";
import { moyensActifs } from "@/lib/donnees/moyens-paiement";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNombre, LIBELLE_MODE_REMUNERATION, n } from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chauffeurs — PILITrans" };

export default async function ChauffeursPage() {
  const periode = moisCourant();
  const [session, lignes, parametres, fil, indicatifs, moyens] = await Promise.all([
    sessionRequise(),
    vueChauffeurs(periode),
    prisma.parametres.findFirst(),
    filAlertes(),
    indicatifsPays(),
    moyensActifs(),
  ]);

  const actifs = lignes.filter((l) => l.chauffeur.actif).length;

  const tauxReferenceXof = parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null;

  return (
    <>
      <BarreHaut
        titre="Chauffeurs"
        sousTitre={`${actifs} chauffeur${actifs > 1 ? "s" : ""} actif${actifs > 1 ? "s" : ""} · ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={tauxReferenceXof}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            La rémunération est <b>variable</b> : forfait par voyage, commission sur recette, au
            kilomètre, fixe ou mixte. La paie réelle d&apos;un voyage prime sur l&apos;estimation.
          </span>
        </div>

        <div className="head-row">
          <h3>Chauffeurs</h3>
          <SiPeut droit="equipe.ecrire">
            <DialogueChauffeur
              indicatifs={indicatifs}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Ajouter un chauffeur
                </button>
              }
            />
          </SiPeut>
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Chauffeur</th>
                <th>Rémunération</th>
                <th>Permis</th>
                <th className="num">Voyages</th>
                <th className="num">Paie du mois</th>
                <th className="num">Caisse</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <LigneTableau
                    key={ligne.chauffeur.id}
                    ligne={ligne}
                    indicatifs={indicatifs}
                    moyens={moyens}
                    tauxReferenceXof={tauxReferenceXof}
                  />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function LigneTableau({
  ligne,
  indicatifs,
  moyens,
  tauxReferenceXof,
}: {
  ligne: LigneChauffeur;
  indicatifs: { code: string; libelle: string; longueur: number | null }[];
  moyens: { id: string; nom: string }[];
  tauxReferenceXof: number | null;
}) {
  const { chauffeur } = ligne;
  const taux = chauffeur.tauxRemuneration != null ? n(chauffeur.tauxRemuneration) : null;
  const commission = ["COMMISSION", "MIXTE"].includes(chauffeur.modeRemuneration);

  // Permis : rouge s'il est expiré, orange dans les 30 jours.
  const permisCritique = ligne.joursPermis != null && ligne.joursPermis <= 0;
  const permisProche = ligne.joursPermis != null && ligne.joursPermis > 0 && ligne.joursPermis <= 30;

  return (
    <tr className={chauffeur.actif ? undefined : "opacity-60"}>
      <td>
        {/* Vers ses missions : la fiche chauffeur résume, la liste détaille. */}
        <Link href={`/voyages?q=${encodeURIComponent(chauffeur.nom)}`} className="t-title link">
          {chauffeur.nom}
        </Link>
        <div className="t-sub">
          {chauffeur.telephone ?? "—"}
          {ligne.enMission ? " · en mission" : ""}
          {!chauffeur.actif ? " · inactif" : ""}
        </div>
      </td>

      <td>
        {LIBELLE_MODE_REMUNERATION[chauffeur.modeRemuneration]}
        {taux != null ? (
          <div className="t-sub mono">
            {commission ? `${taux} %` : `${formatNombre(taux)} GNF`}
          </div>
        ) : null}
      </td>

      <td>
        {chauffeur.permisExpire ? (
          <>
            <span
              className={
                permisCritique
                  ? "font-semibold text-[var(--neg)]"
                  : permisProche
                    ? "font-semibold text-[var(--warn)]"
                    : undefined
              }
            >
              {formatDate(chauffeur.permisExpire)}
            </span>
            <div className="t-sub">
              {chauffeur.categoriePermis ?? "—"}
              {permisCritique ? " · expiré" : permisProche ? ` · dans ${ligne.joursPermis} j` : ""}
            </div>
          </>
        ) : (
          <span className="text-[var(--muted-2)]">—</span>
        )}
      </td>

      <td className="num">
        {ligne.nbVoyagesMois}
        <div className="t-sub">{ligne.nbVoyages} au total</div>
      </td>

      <td className={`num ${ligne.remunerationMoisGnf > 0 ? "" : "vide"}`}>
        {ligne.remunerationMoisGnf > 0 ? formatNombre(ligne.remunerationMoisGnf) : "—"}
      </td>

      {/* Un solde non nul est de l'argent à justifier. */}
      <td className={`num ${ligne.consolideGnf > 0 ? "neg" : "vide"}`}>
        {ligne.consolideGnf !== 0 || ligne.soldeXof !== 0 ? formatNombre(ligne.soldeGnf) : "0"}
        {ligne.soldeXof !== 0 ? (
          <div className="t-sub text-[var(--intl)]">+ {formatNombre(ligne.soldeXof)} CFA</div>
        ) : null}
        {/* Le solde seul ne dit pas d'où il vient : l'historique permet de le
            relire et de corriger une saisie erronée. */}
        <SiPeut droit="depenses.ecrire">
          <HistoriqueCaisse nom={ligne.chauffeur.nom} mouvements={ligne.mouvements} />
        </SiPeut>
      </td>

      <td>
        <div className="acts">
          {/* Avance, remboursement : sans cela la caisse ne pouvait que descendre. */}
          <DialogueCaisse
            chauffeurId={ligne.chauffeur.id}
            nom={ligne.chauffeur.nom}
            soldeGnf={ligne.soldeGnf}
            soldeXof={ligne.soldeXof}
            tauxReferenceXof={tauxReferenceXof}
            missions={ligne.missionsEnCours}
            moyens={moyens}
            declencheur={
              <button type="button" title="Mouvement de caisse (avance, remboursement)">
                <IconeDepense />
              </button>
            }
          />
        </div>
        <ActionsChauffeur
          chauffeur={aplatir(ligne)}
          indicatifs={indicatifs}
          aRoule={ligne.nbVoyages > 0}
        />
      </td>
    </tr>
  );
}

function aplatir(ligne: LigneChauffeur): ChauffeurEditable {
  const { chauffeur } = ligne;
  return {
    id: chauffeur.id,
    nom: chauffeur.nom,
    telephone: chauffeur.telephone,
    photo: chauffeur.photo,
    numeroPermis: chauffeur.numeroPermis,
    categoriePermis: chauffeur.categoriePermis,
    permisExpire: chauffeur.permisExpire ? chauffeur.permisExpire.toISOString().slice(0, 10) : null,
    modeRemuneration: chauffeur.modeRemuneration,
    tauxRemuneration: chauffeur.tauxRemuneration != null ? n(chauffeur.tauxRemuneration) : null,
    actif: chauffeur.actif,
  };
}
