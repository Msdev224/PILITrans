import { basculerPays, supprimerPays } from "@/actions/pays";
import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconePlus } from "@/components/icones";
import { DialoguePays } from "@/components/parametres/dialogue-pays";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { listePays } from "@/lib/donnees/pays";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pays" };

export default async function PaysPage() {
  const [session, pays, parametres, fil] = await Promise.all([
    sessionRequise(),
    listePays(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const actifs = pays.filter((p) => p.actif).length;

  return (
    <>
      <BarreHaut
        titre="Pays desservis"
        sousTitre={`${actifs} pays proposé${actifs > 1 ? "s" : ""} à la saisie sur ${pays.length}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="head-row">
          <h3>Pays</h3>
          <DialoguePays
            declencheur={
              <button type="button" className="btn-add">
                <IconePlus />
                Ajouter un pays
              </button>
            }
          />
        </div>

        <p className="note-methode">
          Ouvrir un corridor n&apos;exige plus de redéployer l&apos;application. Chaque pays porte
          son indicatif téléphonique : en ajouter un rend du même coup ses numéros saisissables
          sur les fiches client et chauffeur. Le premier de la liste sert de valeur par défaut
          à la création d&apos;un voyage.
        </p>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pays</th>
                <th>Code</th>
                <th>Indicatif</th>
                <th className="num">Longueur</th>
                <th className="num">Utilisations</th>
                <th>État</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id} className={p.actif ? undefined : "ligne-inactive"}>
                  <td>
                    <b>{p.nom}</b>
                  </td>
                  <td className="mono">{p.code}</td>
                  <td className="mono">{p.indicatif}</td>
                  <td className={`num ${p.longueurTelephone == null ? "vide" : ""}`}>
                    {p.longueurTelephone ?? "—"}
                  </td>
                  <td className="num">{p.nbUtilisations}</td>
                  <td>
                    <span className={p.actif ? "badge b-go" : "badge b-idle"}>
                      {p.actif ? "Proposé" : "Retiré"}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <DialoguePays
                      pays={{
                        id: p.id,
                        nom: p.nom,
                        code: p.code,
                        indicatif: p.indicatif,
                        longueurTelephone: p.longueurTelephone,
                        ordre: p.ordre,
                      }}
                      declencheur={
                        <button type="button" className="btn ghost sm">
                          Modifier
                        </button>
                      }
                    />
                    <form action={basculerPays.bind(null, p.id)}>
                      <button type="submit" className="btn ghost sm">
                        {p.actif ? "Retirer" : "Remettre"}
                      </button>
                    </form>
                    {/* Un corridor déjà emprunté ne se supprime pas : les
                        voyages passés doivent rester lisibles. */}
                    {p.nbUtilisations === 0 ? (
                      <form action={supprimerPays.bind(null, p.id)}>
                        <button type="submit" className="btn ghost sm">
                          Supprimer
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="note-bas">
          Un pays déjà emprunté ne peut être que retiré des listes, pas supprimé.
        </p>
      </div>
    </>
  );
}
