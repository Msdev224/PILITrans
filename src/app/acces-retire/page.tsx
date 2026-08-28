import { seDeconnecter } from "@/actions/auth";
import { marqueEntreprise } from "@/lib/donnees/accueil";

export const metadata = { title: "Session close" };

/**
 * Fin de parcours d'une session qui n'a plus cours.
 *
 * Cette page n'appelle **pas** `sessionRequise()` : c'est précisément elle qui
 * y renvoie. La seule action proposée efface le jeton, sans quoi le visiteur
 * resterait « connecté » sans pouvoir rien ouvrir.
 *
 * Deux motifs, deux messages : une session expirée n'est pas un accès retiré,
 * et confondre les deux inquiéterait inutilement un chauffeur qui n'a rien
 * fait de mal.
 */
export default async function AccesRetirePage({
  searchParams,
}: {
  searchParams: Promise<{ motif?: string }>;
}) {
  const [marque, { motif }] = await Promise.all([marqueEntreprise(), searchParams]);
  const expiree = motif === "expiree";

  return (
    <main className="ar-page">
      <div className="ar-carte">
        <h1>{expiree ? "Session expirée" : "Votre accès a été retiré"}</h1>
        <p>
          {expiree ? (
            <>
              Par sécurité, une connexion ne reste ouverte qu&apos;un temps limité. Reconnecte-toi
              avec ton numéro et ton mot de passe — rien n&apos;est perdu, tes saisies sont
              enregistrées.
            </>
          ) : (
            <>
              Ce compte n&apos;est plus actif chez {marque.raisonSociale}. Si vous pensez
              qu&apos;il s&apos;agit d&apos;une erreur, contactez le gérant — lui seul peut le
              réactiver.
            </>
          )}
        </p>
        <form action={seDeconnecter}>
          <button type="submit" className="ar-btn">
            {expiree ? "Se reconnecter" : "Fermer la session"}
          </button>
        </form>
      </div>
    </main>
  );
}
