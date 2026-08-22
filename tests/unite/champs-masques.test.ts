import { describe, expect, it } from "vitest";
import { z } from "zod";

import { caseACocher, texteOptionnel } from "@/lib/validation";

/**
 * Le piège des champs que l'interface masque ou désactive.
 *
 * Un champ `disabled` n'est **pas envoyé** par le navigateur. Trois défauts
 * réels en sont nés :
 *
 *  - la mission à vide refusait de s'enregistrer, la devise étant exigée
 *    alors que son champ était grisé ;
 *  - couper les SMS effaçait les six déclencheurs et le nom d'expéditeur ;
 *  - une dépense non carburant butait sur les litres.
 *
 * D'où la règle : soit le champ reste soumis, soit le schéma tolère son
 * absence. Ces tests verrouillent les deux moitiés.
 */

describe("un champ absent ne doit pas bloquer l'enregistrement", () => {
  const schema = z.object({
    devise: z.enum(["GNF", "XOF"]).default("GNF"),
    aVide: caseACocher,
  });

  it("la mission à vide passe sans devise", () => {
    const r = schema.safeParse({ aVide: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.devise).toBe("GNF");
  });

  it("une devise explicite est respectée", () => {
    expect(schema.parse({ devise: "XOF" }).devise).toBe("XOF");
  });
});

describe("un champ absent ne doit pas effacer une préférence", () => {
  /**
   * Reproduit ce qui se passait quand les bascules étaient `disabled` :
   * le navigateur n'envoyait rien et tout repassait à faux.
   */
  const schema = z.object({
    smsActif: caseACocher,
    smsClientDepart: caseACocher,
    smsExpediteur: texteOptionnel,
  });

  it("des cases non soumises retombent à faux — d'où le refus de les désactiver", () => {
    const r = schema.parse({});
    expect(r.smsClientDepart).toBe(false);
    expect(r.smsExpediteur).toBeUndefined();
  });

  it("les préférences survivent quand les champs restent soumis", () => {
    // SMS coupés, mais les déclencheurs sont toujours transmis.
    const r = schema.parse({ smsClientDepart: "true", smsExpediteur: "PILITrans" });
    expect(r.smsActif).toBe(false);
    expect(r.smsClientDepart).toBe(true);
    expect(r.smsExpediteur).toBe("PILITrans");
  });
});
