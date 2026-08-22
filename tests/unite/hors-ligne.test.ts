import { describe, expect, it } from "vitest";

import {
  ACTIONS_DIFFEREES,
  ANCIENNETE_MAX_JOURS,
  estActionDifferee,
  instantSaisie,
} from "@/lib/chauffeur/operations";

const MAINTENANT = new Date("2026-08-22T12:00:00.000Z");

describe("instantSaisie — datation d'une saisie rejouée", () => {
  it("garde l'heure du terrain, pas celle du rejeu", () => {
    // Une dépense faite lundi et remontée mercredi doit rester au lundi :
    // sinon le gasoil change de mois et la marge du mois bouge après coup.
    const lundi = "2026-08-17T09:30:00.000Z";
    expect(instantSaisie(lundi, MAINTENANT).toISOString()).toBe(lundi);
  });

  it("retombe sur l'heure du serveur quand rien n'est fourni", () => {
    expect(instantSaisie(null, MAINTENANT)).toEqual(MAINTENANT);
    expect(instantSaisie(undefined, MAINTENANT)).toEqual(MAINTENANT);
    expect(instantSaisie("", MAINTENANT)).toEqual(MAINTENANT);
  });

  it("refuse une date illisible", () => {
    expect(instantSaisie("hier matin", MAINTENANT)).toEqual(MAINTENANT);
  });

  it("refuse une date future — horloge du téléphone en avance", () => {
    const demain = "2026-08-23T12:00:00.000Z";
    expect(instantSaisie(demain, MAINTENANT)).toEqual(MAINTENANT);
  });

  it("tolère une minute d'avance : les horloges ne s'accordent jamais", () => {
    const trenteSecondes = new Date(MAINTENANT.getTime() + 30_000).toISOString();
    expect(instantSaisie(trenteSecondes, MAINTENANT).toISOString()).toBe(trenteSecondes);
  });

  it("refuse une saisie plus vieille que la limite", () => {
    // Sans cette borne, une saisie pourrait se ranger dans un mois déjà
    // clôturé et en fausser la marge après publication.
    const troporVieux = new Date(
      MAINTENANT.getTime() - (ANCIENNETE_MAX_JOURS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(instantSaisie(troporVieux, MAINTENANT)).toEqual(MAINTENANT);
  });

  it("accepte une saisie juste dans la limite", () => {
    const limite = new Date(
      MAINTENANT.getTime() - (ANCIENNETE_MAX_JOURS - 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(instantSaisie(limite, MAINTENANT).toISOString()).toBe(limite);
  });
});

describe("actions acceptées hors ligne", () => {
  it("reconnaît les saisies de terrain", () => {
    expect(estActionDifferee("saisirDepense")).toBe(true);
    expect(estActionDifferee("avancerMission")).toBe(true);
  });

  it("exclut la confirmation par code de retrait", () => {
    // Elle doit être vérifiée en direct : l'accepter hors ligne reviendrait à
    // remettre la marchandise sur un code faux.
    expect(estActionDifferee("confirmerParCode")).toBe(false);
  });

  it("rejette tout nom inconnu venu du téléphone", () => {
    expect(estActionDifferee("supprimerVoyage")).toBe(false);
    expect(estActionDifferee("")).toBe(false);
    expect(estActionDifferee("__proto__")).toBe(false);
  });

  it("n'expose que des actions du chauffeur", () => {
    // Le point d'entrée de rejeu applique ces noms sans autre filtre : la
    // liste est la frontière de ce qu'un téléphone peut déclencher.
    expect([...ACTIONS_DIFFEREES].sort()).toEqual([
      "ajouterRotation",
      "avancerMission",
      "confirmerChargement",
      "confirmerLivraison",
      "declarerPrelevement",
      "enregistrerReleve",
      "saisirDepense",
      "signalerArret",
    ]);
  });
});
