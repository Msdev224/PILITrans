import { describe, expect, it } from "vitest";

import { authConfig } from "@/auth.config";
import { pageAccueil, peut, permissionDeRoute } from "@/lib/permissions";
import type { Role } from "@prisma/client";

/**
 * Contrôle d'accès au niveau du middleware.
 *
 * On exerce ici le vrai `authorized()` d'Auth.js, celui qui garde chaque
 * route. Masquer une entrée de menu ne protège rien : ce test vérifie qu'une
 * URL tapée à la main est bel et bien refusée.
 */

type Verdict = { autorise: boolean; redirige: string | null };

function demander(chemin: string, role: Role | null): Verdict {
  const url = new URL(`http://localhost:3000${chemin}`);
  const resultat = authConfig.callbacks!.authorized!({
    auth: role ? ({ user: { role } } as never) : null,
    request: { nextUrl: url } as never,
  } as never);

  if (typeof resultat === "boolean") return { autorise: resultat, redirige: null };
  const emplacement = (resultat as Response).headers.get("location");
  return { autorise: false, redirige: emplacement ? new URL(emplacement).pathname : null };
}

const COCKPIT: Role[] = ["GERANT", "EXPLOITANT", "COMPTABLE", "LECTEUR"];

describe("visiteur non connecté", () => {
  it("voit la page de connexion", () => {
    expect(demander("/connexion", null).autorise).toBe(true);
  });

  it("est refusé partout ailleurs", () => {
    for (const route of ["/", "/voyages", "/factures", "/parametres", "/chauffeur"]) {
      expect(demander(route, null).autorise, route).toBe(false);
    }
  });
});

describe("gérant", () => {
  it("ouvre tous les écrans", () => {
    for (const route of [
      "/", "/voyages", "/camions", "/factures", "/clients",
      "/chauffeurs", "/utilisateurs", "/parametres", "/rentabilite", "/chauffeur",
    ]) {
      expect(demander(route, "GERANT").autorise, route).toBe(true);
    }
  });
});

describe("profils à accès réduit", () => {
  it("n'atteignent ni les paramètres ni les comptes", () => {
    for (const role of COCKPIT) {
      if (role === "GERANT") continue;
      expect(demander("/parametres", role).autorise, `${role} /parametres`).toBe(false);
      expect(demander("/utilisateurs", role).autorise, `${role} /utilisateurs`).toBe(false);
    }
  });

  it("sont renvoyés vers un écran qu'ils ont le droit de voir", () => {
    for (const role of COCKPIT) {
      if (role === "GERANT") continue;
      const { redirige } = demander("/parametres", role);
      expect(redirige, role).toBe(pageAccueil(role));
      const requis = redirige ? permissionDeRoute(redirige) : null;
      if (requis) expect(peut(role, requis), `${role} → ${redirige}`).toBe(true);
    }
  });

  it("n'entrent pas dans l'espace mobile du chauffeur", () => {
    for (const role of ["EXPLOITANT", "COMPTABLE", "LECTEUR"] as Role[]) {
      expect(demander("/chauffeur", role).autorise, role).toBe(false);
    }
  });

  it("le comptable ouvre la facturation mais pas la création de voyage", () => {
    expect(demander("/factures", "COMPTABLE").autorise).toBe(true);
    expect(peut("COMPTABLE", "voyages.ecrire")).toBe(false);
  });
});

describe("chauffeur", () => {
  it("est cantonné à son espace mobile", () => {
    expect(demander("/chauffeur", "CHAUFFEUR").autorise).toBe(true);
    for (const route of ["/", "/voyages", "/factures", "/camions", "/utilisateurs"]) {
      const v = demander(route, "CHAUFFEUR");
      expect(v.autorise, route).toBe(false);
      expect(v.redirige, route).toBe("/chauffeur");
    }
  });
});

describe("page de connexion pour un compte déjà identifié", () => {
  it("renvoie chacun vers son accueil", () => {
    expect(demander("/connexion", "CHAUFFEUR").redirige).toBe("/chauffeur");
    expect(demander("/connexion", "GERANT").redirige).toBe("/");
  });
});
