import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { DialogueUtilisateur } from "@/components/equipe/dialogue-utilisateur";
import { IconePlus } from "@/components/icones";
import { basculerActivation } from "@/actions/utilisateurs";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { chauffeursSansCompte, listeUtilisateurs } from "@/lib/donnees/utilisateurs";
import { DOMAINES, LIBELLE_ROLE, ROLES_COCKPIT, peut } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatTelephone } from "@/lib/telephone";
import { formatDate, n } from "@/lib/utils";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comptes — PILITrans" };

const LIBELLE_DOMAINE: Record<string, string> = {
  voyages: "Voyages",
  flotte: "Parc",
  depenses: "Dépenses",
  facturation: "Factures",
  clients: "Clients",
  equipe: "Équipe",
  analyses: "Analyses",
  parametres: "Paramètres",
};

export default async function UtilisateursPage() {
  const [session, comptes, chauffeurs, parametres, fil] = await Promise.all([
    sessionRequise(),
    listeUtilisateurs(),
    chauffeursSansCompte(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const actifs = comptes.filter((c) => c.actif).length;

  return (
    <>
      <BarreHaut
        titre="Comptes"
        sousTitre={`${actifs} compte${actifs > 1 ? "s" : ""} actif${actifs > 1 ? "s" : ""} sur ${comptes.length}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="head-row">
          <h3>Comptes et accès</h3>
          <DialogueUtilisateur
            chauffeurs={chauffeurs}
            declencheur={
              <button type="button" className="btn-add">
                <IconePlus />
                Créer un compte
              </button>
            }
          />
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Rôle</th>
                <th>Rattachement</th>
                <th>Créé le</th>
                <th>État</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => {
                const soi = c.id === session.user.id;
                return (
                  <tr key={c.id} className={c.actif ? undefined : "ligne-inactive"}>
                    <td>
                      <b>{c.nom}</b>
                      {soi ? <span className="tag-soi">vous</span> : null}
                      {!c.motDePasseDefini ? (
                        <span className="tag-alerte" title="Ce compte ne peut pas se connecter">
                          sans mot de passe
                        </span>
                      ) : null}
                    </td>
                    <td className="mono">{formatTelephone(c.telephone)}</td>
                    <td>{LIBELLE_ROLE[c.role as Role]}</td>
                    <td className="muted">{c.chauffeurNom ?? "—"}</td>
                    <td className="muted">{formatDate(c.creeLe)}</td>
                    <td>
                      <span className={c.actif ? "badge b-go" : "badge b-idle"}>
                        {c.actif ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <DialogueUtilisateur
                        utilisateur={{
                          id: c.id,
                          nom: c.nom,
                          telephone: c.telephone,
                          email: c.email,
                          role: c.role,
                          actif: c.actif,
                          chauffeurId: c.chauffeurId,
                        }}
                        chauffeurs={chauffeurs}
                        declencheur={
                          <button type="button" className="btn ghost sm">
                            Modifier
                          </button>
                        }
                      />
                      {/* Désactivation plutôt que suppression : l'historique de
                          saisie doit rester rattaché à son auteur. */}
                      <form action={basculerActivation.bind(null, c.id)}>
                        <button type="submit" className="btn ghost sm">
                          {c.actif ? "Désactiver" : "Réactiver"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Le tableau des droits est affiché plutôt que documenté ailleurs :
            attribuer un rôle sans voir ce qu'il ouvre est la meilleure façon
            de donner trop d'accès sans s'en rendre compte. */}
        <div className="head-row mt-6">
          <h3>Ce que chaque rôle peut faire</h3>
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl tbl-droits">
            <thead>
              <tr>
                <th>Domaine</th>
                {ROLES_COCKPIT.map((r) => (
                  <th key={r}>{LIBELLE_ROLE[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOMAINES.map((domaine) => (
                <tr key={domaine}>
                  <td>{LIBELLE_DOMAINE[domaine]}</td>
                  {ROLES_COCKPIT.map((r) => {
                    const ecrit = peut(r, `${domaine}.ecrire`);
                    const lit = peut(r, `${domaine}.lire`);
                    return (
                      <td key={r} className="cell-droit">
                        {ecrit ? (
                          <span className="badge b-go">Modifier</span>
                        ) : lit ? (
                          <span className="badge b-intl">Consulter</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="note-bas">
          Le chauffeur n&apos;apparaît pas dans ce tableau : il n&apos;accède pas au cockpit,
          seulement à son espace mobile et uniquement aux missions qui lui sont attribuées.
        </p>
      </div>
    </>
  );
}
