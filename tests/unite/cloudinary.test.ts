import { describe, expect, it } from "vitest";

import {
  DOSSIER_IMAGES,
  estUrlHebergee,
  signatureCloudinary,
  urlImage,
} from "@/lib/images";

describe("signature de téléversement", () => {
  it("produit un SHA-1 hexadécimal", () => {
    const s = signatureCloudinary("secret-de-test", DOSSIER_IMAGES, 1_700_000_000);
    expect(s).toMatch(/^[0-9a-f]{40}$/);
  });

  it("est reproductible : même secret et même instant donnent la même signature", () => {
    const a = signatureCloudinary("secret-de-test", DOSSIER_IMAGES, 1_700_000_000);
    const b = signatureCloudinary("secret-de-test", DOSSIER_IMAGES, 1_700_000_000);
    expect(a).toBe(b);
  });

  it("change dès que le secret ou l'instant change", () => {
    // Sinon une signature interceptée resterait valable indéfiniment.
    const base = signatureCloudinary("secret-de-test", DOSSIER_IMAGES, 1_700_000_000);
    expect(signatureCloudinary("autre-secret", DOSSIER_IMAGES, 1_700_000_000)).not.toBe(base);
    expect(signatureCloudinary("secret-de-test", DOSSIER_IMAGES, 1_700_000_001)).not.toBe(base);
  });

  it("ne laisse pas fuir le secret dans la signature", () => {
    const s = signatureCloudinary("secret-de-test", DOSSIER_IMAGES, 1_700_000_000);
    expect(s).not.toContain("secret");
  });
});

describe("cohabitation des deux formes d'image", () => {
  it("reconnaît une image hébergée d'une image en base", () => {
    expect(estUrlHebergee("https://res.cloudinary.com/demo/image/upload/v1/a.jpg")).toBe(true);
    expect(estUrlHebergee("data:image/jpeg;base64,/9j/4AAQ")).toBe(false);
    expect(estUrlHebergee(null)).toBe(false);
  });

  it("redimensionne une image hébergée sans toucher aux anciennes", () => {
    const hebergee = "https://res.cloudinary.com/demo/image/upload/v1/a.jpg";
    expect(urlImage(hebergee, 96)).toContain("w_96,h_96");

    // Une image déjà en base est renvoyée telle quelle : la transformer
    // n'aurait aucun sens et casserait l'affichage des fiches existantes.
    const enBase = "data:image/jpeg;base64,/9j/4AAQ";
    expect(urlImage(enBase, 96)).toBe(enBase);
    expect(urlImage(null, 96)).toBeNull();
  });
});
