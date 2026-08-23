import { describe, expect, it } from "vitest";

import { caracteresHorsGsm7, estGsm7, montantSms, segmentsSms } from "@/lib/sms/gsm7";
import {
  messageAffectation,
  messageArrivee,
  messageCodeLivraison,
  messageDepart,
  messageFacture,
  messageLivraison,
  messageRelance,
} from "@/lib/sms/notifications";

/** Paramètres réalistes : raison sociale longue et numéro renseigné. */
const PARAMETRES = {
  raisonSociale: "PILITrans SARL",
  telephone: "+224620000000",
} as never;

const DATE = new Date("2026-08-24T09:00:00Z");

/**
 * Les sept messages, avec des valeurs réalistes plutôt que minimales : un
 * message qui tient en un segment sur « Dakar » mais déborde sur
 * « Guinée-Bissau » coûterait le double en exploitation.
 */
const MESSAGES: Record<string, string> = {
  affectation: messageAffectation(PARAMETRES, "Conakry → Dakar", "PILI-01", DATE),
  depart: messageDepart(PARAMETRES, "Conakry → Dakar", "Produits frais"),
  arrivee: messageArrivee(PARAMETRES, "Dakar"),
  livraison: messageLivraison(PARAMETRES, "Dakar", "12 t + 240 sacs"),
  code: messageCodeLivraison(PARAMETRES, "482913", "Produits frais"),
  facture: messageFacture(PARAMETRES, "FAC-2026-042", 2_700_000, DATE, null),
  relance: messageRelance(PARAMETRES, "FAC-2026-042", 1_700_000, 12, null),
};

describe("messages SMS — alphabet et coût", () => {
  for (const [nom, message] of Object.entries(MESSAGES)) {
    it(`${nom} : reste dans l'alphabet GSM`, () => {
      // Un seul caractère hors alphabet bascule le message entier en UCS-2,
      // soit 70 caractères par segment au lieu de 160.
      expect(caracteresHorsGsm7(message)).toEqual([]);
      expect(estGsm7(message)).toBe(true);
    });

    it(`${nom} : tient en un seul segment`, () => {
      expect(segmentsSms(message)).toBe(1);
    });
  }

  it("remplace la flèche du trajet, qui coûterait un segment de plus", () => {
    expect(MESSAGES.affectation).toContain("Conakry > Dakar");
    expect(MESSAGES.affectation).not.toContain("→");
  });

  it("écrit les dates en chiffres : « août » contient un û hors alphabet", () => {
    expect(MESSAGES.affectation).toContain("24/08/2026");
  });

  it("garde les accents qui, eux, sont dans l'alphabet", () => {
    // Les retirer donnerait un français bâclé sans rien économiser.
    expect(MESSAGES.depart).toContain("chargée");
    expect(MESSAGES.arrivee).toContain("arrivée");
  });

  it("accorde correctement quand la marchandise est nommée", () => {
    // « votre Produits frais est chargée » ne s'accorde avec rien : le nom
    // commun porte la phrase, la désignation vient la préciser.
    expect(MESSAGES.depart).toContain("votre marchandise (Produits frais) est chargée");
  });

  it("n'emploie aucun mot dont l'accent aurait été mangé", () => {
    // « prêt » perdait son circonflexe et sortait « pret ».
    for (const message of Object.values(MESSAGES)) {
      expect(message).not.toMatch(/\b(pret|etre|meme|tres|apres|cout)\b/);
    }
  });
});

describe("code de retrait", () => {
  it("ne révèle ni montant ni valeur de la marchandise", () => {
    expect(MESSAGES.code).not.toMatch(/GNF|CFA|\d{4,}\s*(GNF|F)/);
  });

  it("dit à qui remettre le code, seule protection réelle", () => {
    expect(MESSAGES.code).toContain("à personne d'autre");
  });

  it("commence ses phrases par une majuscule", () => {
    // Le « À » majuscule est hors alphabet GSM : la tentation est de le
    // remplacer par un « à » minuscule, qui donne un message qui semble raté.
    expect(MESSAGES.code).not.toMatch(/\.\s+[a-zàéèùìò]/);
  });
});

describe("montantSms", () => {
  it("sépare les milliers par une espace ordinaire, pas l'espace fine", () => {
    const m = montantSms(2_700_000);
    expect(m).toBe("2 700 000");
    expect(estGsm7(m)).toBe(true);
  });

  it("garde les décimales sans les arrondir", () => {
    expect(montantSms(1_499.5)).toBe("1 499,5");
  });
});

describe("segmentsSms", () => {
  it("compte 1 segment jusqu'à 160 caractères en GSM-7", () => {
    expect(segmentsSms("a".repeat(160))).toBe(1);
    expect(segmentsSms("a".repeat(161))).toBe(2);
  });

  it("tombe à 70 caractères par segment dès qu'un caractère sort de l'alphabet", () => {
    expect(segmentsSms("→" + "a".repeat(69))).toBe(1);
    expect(segmentsSms("→" + "a".repeat(70))).toBe(2);
  });
});

describe("nom d'expéditeur Nimba", () => {
  // La règle est côté opérateur : onze caractères alphanumériques au plus.
  // La valider à la saisie évite un refus qui n'arrive qu'à l'envoi, parfois
  // des heures plus tard, sur un message qu'on croyait parti.
  const valide = (v: string) => v.length <= 11 && /^[A-Za-z0-9]+$/.test(v);

  it("accepte un nom court et alphanumérique", () => {
    expect(valide("PILITRANS")).toBe(true);
    expect(valide("PiliTrans")).toBe(true);
  });

  it("refuse ce que Nimba refuse", () => {
    expect(valide("Mamadou Saidou Bah")).toBe(false); // trop long, et espaces
    expect(valide("PILITRANS SARL")).toBe(false); // espace
    expect(valide("PILITRÂNS")).toBe(false); // accent
    expect(valide("PILITRANS12")).toBe(true); // 11 exactement
    expect(valide("PILITRANS123")).toBe(false); // 12
  });
});
