import type { Metadata } from "next";

import { textesAccueil } from "@/lib/donnees/accueil";

import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion — PILITrans" };

// Les textes viennent des Paramètres : la page doit être rendue à la demande.
export const dynamic = "force-dynamic";

export default async function ConnexionPage() {
  const t = await textesAccueil();

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
          <span className="dot" />
          <div>
            <h1>{t.raisonSociale}</h1>
            <span>{t.surtitre.includes("·") ? t.surtitre.split("·").pop()?.trim() : t.surtitre}</span>
          </div>
        </div>

        <h2>Connexion</h2>
        <p className="sub">{t.sousTitre}</p>

        <FormulaireConnexion />

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
