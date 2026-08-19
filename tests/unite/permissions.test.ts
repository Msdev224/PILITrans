import type { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DOMAINES,
  LIBELLE_ROLE,
  MATRICE,
  pageAccueil,
  permissionDeRoute,
  peut,
  ROLES_COCKPIT,
  voitDomaine,
  type Permission,
} from "@/lib/permissions";

/**
 * Contrôle d'accès.
 *
 * Ces tests valent plus que la moyenne : une erreur ici n'affiche pas un
 * mauvais chiffre, elle ouvre à quelqu'un un écran qui ne le regarde pas. Ils
 * vérifient aussi les invariants qu'un ajout de rôle pourrait casser sans
 * qu'on s'en aperçoive.
 */

const TOUS: Role[] = ["GERANT", "EXPLOITANT", "COMPTABLE", "LECTEUR", "CHAUFFEUR"];

describe("invariants de la matrice", () => {
  it("chaque rôle a une entrée pour chaque domaine", () => {
    for (const role of TOUS) {
      for (const domaine of DOMAINES) {
        expect(MATRICE[role][domaine], `${role}/${domaine}`).toBeDefined();
      }
    }
  });

  it("chaque rôle a un libellé lisible", () => {
    for (const role of TOUS) {
      expect(LIBELLE_ROLE[role]).toBeTruthy();
    }
  });

  it("l'écriture implique toujours la lecture", () => {
    for (const role of TOUS) {
      for (const domaine of DOMAINES) {
        if (peut(role, `${domaine}.ecrire` as Permission)) {
          expect(peut(role, `${domaine}.lire` as Permission), `${role}/${domaine}`).toBe(true);
        }
      }
    }
  });

  it("le gérant est le seul à toucher aux paramètres et aux comptes", () => {
    for (const role of TOUS) {
      if (role === "GERANT") continue;
      expect(peut(role, "parametres.ecrire"), role).toBe(false);
      expect(peut(role, "equipe.ecrire"), role).toBe(false);
    }
  });
});

describe("séparation des tâches", () => {
  it("le chef d'exploitation organise mais ne facture pas", () => {
    expect(peut("EXPLOITANT", "voyages.ecrire")).toBe(true);
    expect(peut("EXPLOITANT", "flotte.ecrire")).toBe(true);
    expect(peut("EXPLOITANT", "facturation.ecrire")).toBe(false);
  });

  it("le comptable encaisse mais ne déclare pas les courses", () => {
    expect(peut("COMPTABLE", "facturation.ecrire")).toBe(true);
    expect(peut("COMPTABLE", "voyages.ecrire")).toBe(false);
  });

  it("le profil en lecture seule ne peut rien écrire, nulle part", () => {
    for (const domaine of DOMAINES) {
      expect(peut("LECTEUR", `${domaine}.ecrire` as Permission), domaine).toBe(false);
    }
  });

  it("le chauffeur n'a aucun accès au cockpit", () => {
    for (const domaine of DOMAINES) {
      expect(voitDomaine("CHAUFFEUR", domaine), domaine).toBe(false);
    }
  });
});

describe("permissionDeRoute", () => {
  it("exige l'écriture pour l'écran des comptes", () => {
    // Il liste les identifiants de connexion de tout le monde : le droit de
    // consultation sur l'équipe ne suffit pas à l'ouvrir.
    expect(permissionDeRoute("/utilisateurs")).toBe("equipe.ecrire");
    expect(peut("LECTEUR", "equipe.lire")).toBe(true);
    expect(peut("LECTEUR", permissionDeRoute("/utilisateurs")!)).toBe(false);
  });

  it("reconnaît les sous-routes", () => {
    expect(permissionDeRoute("/camions/abc123")).toBe("flotte.lire");
    expect(permissionDeRoute("/factures/xyz/impression")).toBe("facturation.lire");
  });

  it("laisse passer une route non répertoriée", () => {
    expect(permissionDeRoute("/")).toBeNull();
  });

  it("couvre toutes les entrées de menu du cockpit", () => {
    const routes = [
      "/voyages", "/camions", "/reparations", "/echeances", "/dossiers",
      "/depenses", "/factures", "/clients", "/reclamations", "/chauffeurs",
      "/utilisateurs", "/analyses", "/alertes", "/parametres", "/rentabilite",
    ];
    for (const route of routes) {
      expect(permissionDeRoute(route), route).not.toBeNull();
    }
  });
});

describe("pageAccueil", () => {
  it("envoie le chauffeur vers son espace mobile", () => {
    expect(pageAccueil("CHAUFFEUR")).toBe("/chauffeur");
  });

  it("envoie tout profil du cockpit sur un écran qu'il a le droit d'ouvrir", () => {
    for (const role of ROLES_COCKPIT) {
      const cible = pageAccueil(role);
      const requis = permissionDeRoute(cible);
      if (requis) expect(peut(role, requis), `${role} → ${cible}`).toBe(true);
    }
  });
});
