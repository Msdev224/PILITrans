import { basculerUnite, supprimerUnite } from "@/actions/unites";
import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconePlus } from "@/components/icones";
import { DialogueUnite } from "@/components/parametres/dialogue-unite";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { listeUnites } from "@/lib/donnees/unites";
import { prisma } from "@/lib/prisma";
import { formatDecimal, n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unités — PILITrans" };

export default async function UnitesPage() {
  const [session, unites, parametres, fil] = await Promise.all([
    sessionRequise(),
    listeUnites(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  const actives = unites.filter((u) => u.actif).length;

  return (
    <>
      <BarreHaut
        titre="Unités de mesure"
        sousTitre={`${actives} unité${actives > 1 ? "s" : ""} proposée${actives > 1 ? "s" : ""} à la saisie sur ${unites.length}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="head-row">
          <h3>Unités</h3>
          <DialogueUnite
            declencheur={
              <button type="button" className="btn-add">
                <IconePlus />
                Ajouter une unité
              </button>
            }
          />
        </div>

        <p className="note-methode">
          Chaque marchandise d&apos;un voyage porte son unité : tonnes, sacs, cartons, mètres
          cubes, têtes. Ajoutez ici celles dont votre exploitation a besoin. L&apos;équivalent en
          tonnes est facultatif — il ne sert qu&apos;à totaliser un chargement en tonnage, ce qui
          n&apos;a pas de sens pour tout.
        </p>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Unité</th>
                <th>Symbole</th>
                <th className="num">Équivalent tonnes</th>
                <th className="num">Utilisations</th>
                <th>État</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {unites.map((u) => (
                <tr key={u.id} className={u.actif ? undefined : "ligne-inactive"}>
                  <td>
                    <b>{u.nom}</b>
                  </td>
                  <td className="mono">{u.symbole}</td>
                  <td className={`num ${u.facteurTonne == null ? "vide" : ""}`}>
                    {u.facteurTonne != null ? formatDecimal(u.facteurTonne, 3) : "—"}
                  </td>
                  <td className="num">{u.nbUtilisations}</td>
                  <td>
                    <span className={u.actif ? "badge b-go" : "badge b-idle"}>
                      {u.actif ? "Proposée" : "Retirée"}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <DialogueUnite
                      unite={{
                        id: u.id,
                        nom: u.nom,
                        symbole: u.symbole,
                        facteurTonne: u.facteurTonne,
                        ordre: u.ordre,
                      }}
                      declencheur={
                        <button type="button" className="btn ghost sm">
                          Modifier
                        </button>
                      }
                    />
                    <form action={basculerUnite.bind(null, u.id)}>
                      <button type="submit" className="btn ghost sm">
                        {u.actif ? "Retirer" : "Remettre"}
                      </button>
                    </form>
                    {/* La suppression n'est offerte que si rien ne s'en sert :
                        effacer une unité employée rendrait illisibles les
                        quantités déjà enregistrées. */}
                    {u.nbUtilisations === 0 ? (
                      <form action={supprimerUnite.bind(null, u.id)}>
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
          Une unité déjà utilisée ne peut pas être supprimée, seulement retirée des listes :
          les voyages passés doivent rester lisibles.
        </p>
      </div>
    </>
  );
}
