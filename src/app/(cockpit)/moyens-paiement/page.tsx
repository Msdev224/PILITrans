import { basculerMoyen, supprimerMoyen } from "@/actions/moyens-paiement";
import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconePlus } from "@/components/icones";
import { DialogueMoyen } from "@/components/parametres/dialogue-moyen";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { tousLesMoyens } from "@/lib/donnees/moyens-paiement";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moyens de paiement — PILITrans" };

export default async function MoyensPaiementPage() {
  const [session, moyens, parametres, fil] = await Promise.all([
    sessionRequise(),
    tousLesMoyens(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const actifs = moyens.filter((m) => m.actif).length;

  return (
    <>
      <BarreHaut
        titre="Moyens de paiement"
        sousTitre={`${actifs} moyen${actifs > 1 ? "s" : ""} proposé${actifs > 1 ? "s" : ""} à la saisie sur ${moyens.length}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="head-row">
          <h3>Moyens de paiement</h3>
          <DialogueMoyen
            declencheur={
              <button type="button" className="btn-add">
                <IconePlus />
                Ajouter un moyen
              </button>
            }
          />
        </div>

        <p className="note-methode">
          Chaque règlement, chaque avance et chaque dépense indique par où l&apos;argent a
          circulé. Ajoutez ici les moyens que vous utilisez réellement — Wave, MTN Money, une
          banque précise — plutôt que de tout ranger sous « Autre » : une opération qu&apos;on ne
          peut pas qualifier devient introuvable au moment de la rapprocher d&apos;un relevé.
        </p>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Moyen</th>
                <th className="mono">Code</th>
                <th className="num">Règlements</th>
                <th className="num">Caisse</th>
                <th className="num">Dépenses</th>
                <th>État</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {moyens.map((m) => {
                const utilise = m._count.paiements + m._count.mouvements + m._count.depenses;
                return (
                  <tr key={m.id} className={m.actif ? undefined : "ligne-inactive"}>
                    <td>
                      <b>{m.nom}</b>
                    </td>
                    <td className="mono t-sub">{m.code}</td>
                    <td className="num">{m._count.paiements}</td>
                    <td className="num">{m._count.mouvements}</td>
                    <td className="num">{m._count.depenses}</td>
                    <td>
                      <span className={m.actif ? "badge b-go" : "badge b-idle"}>
                        {m.actif ? "Proposé" : "Retiré"}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <DialogueMoyen
                        moyen={{ id: m.id, nom: m.nom, ordre: m.ordre }}
                        declencheur={
                          <button type="button" className="btn ghost sm">
                            Modifier
                          </button>
                        }
                      />
                      <form action={basculerMoyen.bind(null, m.id)}>
                        <button type="submit" className="btn ghost sm">
                          {m.actif ? "Retirer" : "Remettre"}
                        </button>
                      </form>
                      {/* Supprimer n'est offert que si rien ne s'en sert : effacer
                          un moyen employé priverait des sommes réelles de leur
                          provenance. */}
                      {utilise === 0 ? (
                        <form action={supprimerMoyen.bind(null, m.id)}>
                          <button type="submit" className="btn ghost sm">
                            Supprimer
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="note-bas">
          Un moyen déjà utilisé ne se supprime pas, il se retire des listes : les règlements
          passés doivent garder leur provenance. Le code, lui, ne change jamais — renommer
          « Orange money » en « Orange Money » n&apos;affecte aucune écriture.
        </p>
      </div>
    </>
  );
}
