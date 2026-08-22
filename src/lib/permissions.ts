import type { Role } from "@prisma/client";

/**
 * Droits d'accès.
 *
 * Le contrôle se fait par **permission**, jamais par rôle : les écrans et les
 * Server Actions demandent « qui peut écrire une facture », pas « est-ce le
 * gérant ». Ajouter un rôle revient alors à ajouter une ligne dans la matrice
 * ci-dessous, sans toucher au reste de l'application.
 *
 * Les domaines suivent les groupes du rail de navigation, pour qu'un droit
 * accordé se traduise visiblement par une entrée de menu.
 */
export const DOMAINES = [
  "voyages", // missions, étapes, chargement/livraison, prélèvements
  "flotte", // camions, réparations, entretiens, échéances, dossiers
  "depenses", // dépenses d'exploitation et caisse
  "facturation", // factures, paiements, créances
  "clients", // clients et réclamations
  "equipe", // chauffeurs et comptes utilisateurs
  "analyses", // tableau de bord, analyses, alertes
  "parametres", // paramètres de l'entreprise, SMS
] as const;

export type Domaine = (typeof DOMAINES)[number];
export type Permission = `${Domaine}.lire` | `${Domaine}.ecrire`;

/** Niveau accordé sur un domaine. */
type Niveau = "aucun" | "lecture" | "ecriture";

const TOUT: Record<Domaine, Niveau> = {
  voyages: "ecriture",
  flotte: "ecriture",
  depenses: "ecriture",
  facturation: "ecriture",
  clients: "ecriture",
  equipe: "ecriture",
  analyses: "ecriture",
  parametres: "ecriture",
};

const RIEN: Record<Domaine, Niveau> = {
  voyages: "aucun",
  flotte: "aucun",
  depenses: "aucun",
  facturation: "aucun",
  clients: "aucun",
  equipe: "aucun",
  analyses: "aucun",
  parametres: "aucun",
};

/**
 * Matrice rôle → niveau par domaine.
 *
 * Les frontières suivent la séparation réelle des tâches dans une petite
 * exploitation : celui qui affecte les camions n'est pas celui qui encaisse.
 * C'est aussi ce qui limite les dégâts d'un téléphone perdu ou d'un compte
 * partagé.
 */
export const MATRICE: Record<Role, Record<Domaine, Niveau>> = {
  // Propriétaire / exploitant : accès complet, seul à toucher aux paramètres
  // et aux comptes.
  GERANT: TOUT,

  // Chef d'exploitation : organise les missions et le parc, engage les frais
  // de route. Ne facture pas et ne voit pas les comptes utilisateurs en
  // écriture — la séparation entre celui qui déclare une course et celui qui
  // l'encaisse est la protection de base contre l'erreur comme contre la fraude.
  EXPLOITANT: {
    ...RIEN,
    voyages: "ecriture",
    flotte: "ecriture",
    depenses: "ecriture",
    equipe: "lecture",
    clients: "lecture",
    facturation: "lecture",
    analyses: "lecture",
  },

  // Comptable : facturation, encaissements, créances, dépenses. Consulte les
  // voyages puisqu'une facture s'y rattache, mais ne les modifie pas.
  COMPTABLE: {
    ...RIEN,
    facturation: "ecriture",
    clients: "ecriture",
    depenses: "ecriture",
    voyages: "lecture",
    flotte: "lecture",
    equipe: "lecture",
    analyses: "lecture",
  },

  // Lecture seule : associé, bailleur, comptable externe. Voit l'exploitation
  // sans pouvoir rien changer.
  LECTEUR: {
    voyages: "lecture",
    flotte: "lecture",
    depenses: "lecture",
    facturation: "lecture",
    clients: "lecture",
    equipe: "lecture",
    analyses: "lecture",
    parametres: "aucun",
  },

  // Chauffeur : rien dans le cockpit. Son espace mobile est régi séparément,
  // par appartenance de la mission (voir `src/actions/chauffeur.ts`).
  CHAUFFEUR: RIEN,
};

export const LIBELLE_ROLE: Record<Role, string> = {
  GERANT: "Gérant",
  EXPLOITANT: "Chef d'exploitation",
  COMPTABLE: "Comptable",
  LECTEUR: "Lecture seule",
  CHAUFFEUR: "Chauffeur",
};

export const DESCRIPTION_ROLE: Record<Role, string> = {
  GERANT: "Accès complet, y compris les paramètres et les comptes.",
  EXPLOITANT: "Voyages, parc et frais de route. Ne facture pas.",
  COMPTABLE: "Factures, encaissements, clients et dépenses.",
  LECTEUR: "Consulte tout, ne modifie rien.",
  CHAUFFEUR: "Espace mobile uniquement : ses missions.",
};

/** Rôles attribuables depuis l'écran des comptes. */
export const ROLES_COCKPIT: Role[] = ["GERANT", "EXPLOITANT", "COMPTABLE", "LECTEUR"];

function niveau(role: Role, domaine: Domaine): Niveau {
  return MATRICE[role][domaine];
}

/** `true` si le rôle détient la permission demandée. L'écriture implique la lecture. */
export function peut(role: Role, permission: Permission): boolean {
  const [domaine, action] = permission.split(".") as [Domaine, "lire" | "ecrire"];
  const n = niveau(role, domaine);
  return action === "lire" ? n !== "aucun" : n === "ecriture";
}

/** `true` si le rôle voit au moins un écran du domaine. */
export function voitDomaine(role: Role, domaine: Domaine): boolean {
  return niveau(role, domaine) !== "aucun";
}

/** Première page utile après connexion, selon ce que le rôle a le droit de voir. */
export function pageAccueil(role: Role): string {
  if (role === "CHAUFFEUR") return "/chauffeur";
  if (voitDomaine(role, "analyses")) return "/";
  if (voitDomaine(role, "facturation")) return "/factures";
  if (voitDomaine(role, "voyages")) return "/voyages";
  return "/";
}

/**
 * Droit exigé par une route du cockpit.
 *
 * Le contrôle est fait par route et non par domaine : au sein d'un même
 * domaine, consulter et administrer ne s'équivalent pas. L'écran des comptes
 * relève de l'équipe, mais il liste les identifiants de connexion de tout le
 * monde — il demande donc le droit d'écriture, pas celui de lecture.
 *
 * Une page absente du menu doit aussi refuser l'accès direct par l'URL : le
 * masquage n'est pas une protection.
 */
export function permissionDeRoute(chemin: string): Permission | null {
  const table: [string, Permission][] = [
    ["/voyages", "voyages.lire"],
    ["/camions", "flotte.lire"],
    ["/rentabilite", "analyses.lire"],
    ["/reparations", "flotte.lire"],
    ["/echeances", "flotte.lire"],
    ["/dossiers", "flotte.lire"],
    ["/depenses", "depenses.lire"],
    ["/caisse", "depenses.lire"],
    ["/factures", "facturation.lire"],
    ["/creances", "facturation.lire"],
    ["/clients", "clients.lire"],
    ["/reclamations", "clients.lire"],
    ["/chauffeurs", "equipe.lire"],
    ["/utilisateurs", "equipe.ecrire"],
    ["/analyses", "analyses.lire"],
    ["/alertes", "analyses.lire"],
    ["/unites", "parametres.ecrire"],
    ["/pays", "parametres.ecrire"],
    ["/parametres", "parametres.lire"],
  ];
  return table.find(([prefixe]) => chemin.startsWith(prefixe))?.[1] ?? null;
}
