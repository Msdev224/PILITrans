"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { seDeconnecter } from "@/actions/auth";
import { RailRepli } from "@/components/rail-repli";
import {
  IconeAnalyses,
  IconeCalendrier,
  IconeCamion,
  IconeChauffeur,
  IconeCle,
  IconeClients,
  IconeCloche,
  IconeDeconnexion,
  IconeDepense,
  IconeDossier,
  IconeFacture,
  IconeParametres,
  IconeTableauDeBord,
  IconeTriangle,
  IconeVoyages,
} from "@/components/icones";
import type { MarqueEntreprise } from "@/lib/donnees/accueil";
import { peut, type Permission } from "@/lib/permissions";
import { formatMillions } from "@/lib/utils";

interface Entree {
  libelle: string;
  href?: string;
  icone: ReactNode;
  compteur?: number;
  /** Droit requis pour voir l'entrée. Absent = visible par tout compte connecté. */
  droit?: Permission;
  /** Milestone auquel l'écran est prévu — affiché tant qu'il n'est pas construit. */
  bientot?: string;
}

interface Groupe {
  categorie: string;
  entrees: Entree[];
}

export interface ResumeRail {
  total: number;
  enRoute: number;
  immobilises: number;
  encours: number;
}

export function Rail({
  nbAlertes,
  resume,
  role,
  marque,
  replie,
}: {
  nbAlertes: number;
  resume: ResumeRail;
  role: Role;
  marque: MarqueEntreprise;
  /** Préférence de repli, lue côté serveur pour éviter un clignotement. */
  replie: boolean;
}) {
  const chemin = usePathname();

  const groupes: Groupe[] = [
    {
      categorie: "Pilotage",
      entrees: [
        { libelle: "Tableau de bord", href: "/", icone: <IconeTableauDeBord />, droit: "analyses.lire" },
        { libelle: "Analyses", href: "/analyses", icone: <IconeAnalyses />, droit: "analyses.lire" },
        { libelle: "Exploitation", href: "/exploitation", icone: <IconeAnalyses />, droit: "analyses.lire" },
        { libelle: "Rentabilité", href: "/rentabilite", icone: <IconeCamion />, droit: "analyses.lire" },
        { libelle: "Classements", href: "/classements", icone: <IconeAnalyses />, droit: "analyses.lire" },
        { libelle: "Rapport", href: "/rapport", icone: <IconeDossier />, droit: "analyses.lire" },
        { libelle: "Alertes", href: "/alertes", icone: <IconeCloche />, compteur: nbAlertes, droit: "analyses.lire" },
        { libelle: "Historique", href: "/historique", icone: <IconeDossier />, droit: "analyses.lire" },
      ],
    },
    {
      categorie: "Exploitation",
      entrees: [
        { libelle: "Voyages", href: "/voyages", icone: <IconeVoyages />, droit: "voyages.lire" },
        { libelle: "Dossiers", href: "/dossiers", icone: <IconeDossier />, droit: "flotte.lire" },
        { libelle: "Dépenses", href: "/depenses", icone: <IconeDepense />, droit: "depenses.lire" },
        { libelle: "Caisse", href: "/caisse", icone: <IconeCle />, droit: "depenses.lire" },
        { libelle: "Trésorerie", href: "/tresorerie", icone: <IconeDepense />, droit: "depenses.lire" },
      ],
    },
    {
      categorie: "Commercial",
      entrees: [
        { libelle: "Clients", href: "/clients", icone: <IconeClients />, droit: "clients.lire" },
        { libelle: "Factures", href: "/factures", icone: <IconeFacture />, droit: "facturation.lire" },
        { libelle: "Réclamations", href: "/reclamations", icone: <IconeTriangle />, droit: "clients.lire" },
      ],
    },
    {
      categorie: "Flotte",
      entrees: [
        { libelle: "Camions", href: "/camions", icone: <IconeCamion />, droit: "flotte.lire" },
        { libelle: "Réparations", href: "/reparations", icone: <IconeCle />, droit: "flotte.lire" },
        { libelle: "Échéances", href: "/echeances", icone: <IconeCalendrier />, droit: "flotte.lire" },
      ],
    },
    {
      categorie: "Équipe",
      entrees: [
        { libelle: "Chauffeurs", href: "/chauffeurs", icone: <IconeChauffeur />, droit: "equipe.lire" },
        /*
         * L'espace chauffeur n'est plus proposé ici.
         *
         * C'est l'écran d'un chauffeur sur son propre téléphone, pas un écran
         * d'administration : un gérant qui l'ouvrait tombait sur « aucune fiche
         * chauffeur rattachée à ce compte ». Le chauffeur y arrive directement
         * à la connexion, et n'a de toute façon pas ce rail.
         */
      ],
    },
    {
      categorie: "Configuration",
      entrees: [
        { libelle: "Comptes", href: "/utilisateurs", icone: <IconeClients />, droit: "equipe.ecrire" },
        { libelle: "Unités", href: "/unites", icone: <IconeDossier />, droit: "parametres.ecrire" },
        { libelle: "Moyens de paiement", href: "/moyens-paiement", icone: <IconeDepense />, droit: "parametres.ecrire" },
        { libelle: "Pays", href: "/pays", icone: <IconeVoyages />, droit: "parametres.ecrire" },
        { libelle: "Paramètres", href: "/parametres", icone: <IconeParametres />, droit: "parametres.lire" },
      ],
    },
  ];

  // Le menu ne montre que ce que le compte a le droit d'ouvrir. Une catégorie
  // vidée de ses entrées disparaît avec son intitulé, plutôt que de laisser un
  // titre orphelin.
  const visibles = groupes
    .map((groupe) => ({
      ...groupe,
      entrees: groupe.entrees.filter((e) => !e.droit || peut(role, e.droit)),
    }))
    .filter((groupe) => groupe.entrees.length > 0);

  const estActif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));

  return (
    <aside className="rail">
      {/* Le logo porte déjà le nom de l'exploitation : l'écrire à côté le
          répétait, sur deux lignes, en poussant l'accroche sur trois. Quand un
          logo existe, il tient seul — et l'icône carrée prend le relais dès que
          le rail se réduit, un logo allongé n'étant plus lisible à 30 px. */}
      <div className="brand" title={`${marque.raisonSociale} — ${marque.accroche}`}>
        <div className="dot" />
        {marque.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={marque.logoUrl} alt={marque.raisonSociale} className="rail-logo" />
        ) : null}
        {marque.iconeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={marque.iconeUrl} alt="" aria-hidden className="rail-icone" />
        ) : null}
        <div className="rail-texte">
          <h1>{marque.raisonSociale}</h1>
          <span>{marque.accroche}</span>
        </div>
      </div>

      <nav className="nav">
        {visibles.map((groupe) => (
          <div key={groupe.categorie} className="contents">
            <div className="nav-cat">{groupe.categorie}</div>
            {groupe.entrees.map((entree) =>
              entree.href ? (
                <Link
                  key={entree.libelle}
                  href={entree.href}
                  className={estActif(entree.href) ? "on" : undefined}
                  title={entree.libelle}
                >
                  {entree.icone}
                  <span className="nav-libelle">{entree.libelle}</span>
                  {entree.compteur ? <span className="ncount">{entree.compteur}</span> : null}
                </Link>
              ) : (
                <span
                  key={entree.libelle}
                  className="nav-inactif"
                  title={`${entree.libelle} — écran prévu au milestone ${entree.bientot?.replace("M", "")}`}
                >
                  {entree.icone}
                  <span className="nav-libelle">{entree.libelle}</span>
                  <span className="bientot">{entree.bientot}</span>
                </span>
              ),
            )}
          </div>
        ))}
      </nav>

      <div className="rail-foot">
        <RailRepli replieInitial={replie} />
        <div className="rail-stat rail-texte">
          Parc : <b>{resume.enRoute}/{resume.total} en route</b>
          {resume.immobilises > 0 ? (
            <>
              {" · "}
              <b>{resume.immobilises} immobilisé{resume.immobilises > 1 ? "s" : ""}</b>
            </>
          ) : null}
          <br />
          Créances : <b>{formatMillions(resume.encours)} M GNF</b>
        </div>
        <form action={seDeconnecter}>
          <button type="submit" className="logout" title="Déconnexion">
            <IconeDeconnexion width={16} height={16} />
            <span className="nav-libelle">Déconnexion</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
