import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { ActionsEcheance } from "@/components/flotte/actions-echeance";
import { DialogueEcheance } from "@/components/flotte/dialogue-echeance";
import { IconeInfo, IconePlus } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { vueEcheances, type LigneEcheance } from "@/lib/donnees/equipe";
import { prisma } from "@/lib/prisma";
import { formatDate, LIBELLE_TYPE_ECHEANCE, n } from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Échéances" };

export default async function EcheancesPage() {
  const [session, echeances, parametres, fil, camions] = await Promise.all([
    sessionRequise(),
    vueEcheances(),
    prisma.parametres.findFirst(),
    filAlertes(),
    prisma.camion.findMany({ where: { actif: true }, select: { id: true, nom: true }, orderBy: { nom: "asc" } }),
  ]);

  const rappelDefaut = parametres?.rappelEcheanceJours ?? 30;
  const aSignaler = echeances.filter((e) => e.aSignaler);
  const expirees = echeances.filter((e) => e.joursRestants < 0);

  return (
    <>
      <BarreHaut
        titre="Échéances"
        sousTitre={`${echeances.length} document${echeances.length > 1 ? "s" : ""} suivi${echeances.length > 1 ? "s" : ""} · ${aSignaler.length} à traiter`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="vstats">
          <div className="vstat">
            <div className="vs-lab">Documents suivis</div>
            <div className="vs-val">{echeances.length}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">À renouveler</div>
            <div className={`vs-val${aSignaler.length > 0 ? " warn" : ""}`}>{aSignaler.length}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Expirés</div>
            <div className={`vs-val${expirees.length > 0 ? " warn" : ""}`}>{expirees.length}</div>
          </div>
        </div>

        <div className="head-row">
          <h3>Échéances documentaires</h3>
          <SiPeut droit="flotte.ecrire">
            <DialogueEcheance
              camions={camions}
              rappelDefaut={rappelDefaut}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Ajouter une échéance
                </button>
              }
            />
          </SiPeut>
        </div>

        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Assurance, visite technique, carte brune CEDEAO… Chaque document déclenche une alerte à
            l&apos;approche de son expiration. La <b>carte brune est bloquante</b> pour tout départ
            international.
          </span>
        </div>

        {echeances.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Camion</th>
                  <th>Document</th>
                  <th>Expiration</th>
                  <th className="num">Reste</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {echeances.map((e) => (
                  <Ligne key={e.id} echeance={e} camions={camions} rappelDefaut={rappelDefaut} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucun document suivi. Ajoute les assurances et cartes brunes pour être alerté avant
              qu&apos;elles n&apos;expirent.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Ligne({
  echeance,
  camions,
  rappelDefaut,
}: {
  echeance: LigneEcheance;
  camions: { id: string; nom: string }[];
  rappelDefaut: number;
}) {
  const expiree = echeance.joursRestants < 0;
  const urgente = echeance.joursRestants >= 0 && echeance.joursRestants <= 7;

  return (
    <tr>
      <td>
        <Link href={`/camions/${echeance.camionId}`} className="plate clair link">
          {echeance.camionNom}
        </Link>
      </td>

      <td className="t-title">{LIBELLE_TYPE_ECHEANCE[echeance.type] ?? echeance.type}</td>

      <td className={expiree ? "font-semibold text-[var(--neg)]" : undefined}>
        {formatDate(echeance.dateExpiration)}
      </td>

      {/* Le compte à rebours se lit d'un coup d'œil. */}
      <td className={`num ${expiree ? "neg" : urgente ? "neg" : ""}`}>
        {expiree ? `−${-echeance.joursRestants} j` : `${echeance.joursRestants} j`}
      </td>

      <td>
        {expiree ? (
          <span className="badge b-down">Expiré</span>
        ) : urgente ? (
          <span className="badge b-down">Urgent</span>
        ) : echeance.aSignaler ? (
          <span className="badge b-warn">À renouveler</span>
        ) : (
          <span className="badge b-go">
            <span className="led" />
            Valide
          </span>
        )}
      </td>

      <td>
        <ActionsEcheance
          echeance={{
            id: echeance.id,
            camionId: echeance.camionId,
            type: echeance.type,
            numero: echeance.numero,
            organisme: echeance.organisme,
            dateDebut: echeance.dateDebut ? echeance.dateDebut.toISOString().slice(0, 10) : null,
            montantGnf: echeance.montantGnf != null ? n(echeance.montantGnf) : null,
            dateExpiration: echeance.dateExpiration.toISOString().slice(0, 10),
            rappelJours: echeance.rappelJours,
          }}
          camions={camions}
          rappelDefaut={rappelDefaut}
        />
      </td>
    </tr>
  );
}
