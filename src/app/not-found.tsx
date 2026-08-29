import Link from "next/link";

import { marqueEntreprise } from "@/lib/donnees/accueil";
import { NOM_APPLICATION } from "@/lib/marque";

export const metadata = { title: "Page introuvable" };

/**
 * Page affichée quand une adresse ne correspond à rien.
 *
 * Next servait la sienne : « 404 — This page could not be found », en anglais,
 * sans marque ni issue. Or c'est le seul écran que voit un gérant qui s'est
 * trompé de lien, ou dont un signet pointe sur une facture supprimée. Elle doit
 * dire ce qui s'est passé et où aller.
 *
 * Elle ne demande **pas** de session : une adresse fausse se rencontre aussi
 * avant de se connecter, et exiger un compte pour lire un message d'erreur
 * enfermerait le visiteur dans une redirection.
 */
export default async function PageIntrouvable() {
  // La base peut être injoignable au moment même où l'on affiche une erreur :
  // on ne va pas en produire une seconde pour un nom d'entreprise.
  const raison = await marqueEntreprise()
    .then((m) => m.raisonSociale)
    .catch(() => NOM_APPLICATION);

  return (
    <main className="err-page">
      <div className="err-carte">
        <div className="err-code">404</div>
        <h1>Cette page n&apos;existe pas</h1>
        <p>
          L&apos;adresse demandée ne correspond à rien chez {raison}. Elle a pu être supprimée —
          une facture, une mission — ou le lien est incomplet.
        </p>
        <div className="err-actions">
          <Link href="/" className="err-btn">
            Retour au tableau de bord
          </Link>
          <Link href="/voyages" className="err-lien">
            Voir les voyages
          </Link>
        </div>
      </div>
    </main>
  );
}
