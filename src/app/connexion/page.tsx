import type { Metadata } from "next";

import { accroche, textesAccueil } from "@/lib/donnees/accueil";
import { urlLogo } from "@/lib/images";
import { indicatifsPays } from "@/lib/donnees/pays";

import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion" };

// Les textes viennent des Paramètres : la page doit être rendue à la demande.
export const dynamic = "force-dynamic";

export default async function ConnexionPage() {
  const [t, indicatifs] = await Promise.all([textesAccueil(), indicatifsPays()]);

  return (
    <div className="login">
      <div className="login-art">
        <div className="eyebrow">{t.surtitre}</div>
        <h1>{t.titre}</h1>
        <p>{t.texte}</p>
        <div className="vit">
          <span className="led" />
          {t.mention}
        </div>
      </div>

      <div className="login-panel">
        <div className="lg-brand">
          {t.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlLogo(t.logoUrl, 160) ?? t.logoUrl} alt={t.raisonSociale} className="lg-logo" />
          ) : (
            <span className="dot" />
          )}
          <div>
            <h1>{t.raisonSociale}</h1>
            <span>{accroche(t.surtitre)}</span>
          </div>
        </div>

        <h2>Connexion</h2>
        <p className="sub">{t.sousTitre}</p>

        <FormulaireConnexion indicatifs={indicatifs} />

        {/* Les identifiants de démonstration ne s'affichent que si les
            Paramètres l'autorisent : sur une page ouverte à tous, les publier
            en production reviendrait à laisser la porte déverrouillée. */}
        {t.afficherDemo ? (
          <div className="lg-hint">
            Données de démonstration : <b>+224 620 00 00 00</b> (gérant) ou{" "}
            <b>+224 620 22 22 22</b> (chauffeur)
            <br />
            mot de passe <b>pilitrans</b>
          </div>
        ) : null}
      </div>
    </div>
  );
}
