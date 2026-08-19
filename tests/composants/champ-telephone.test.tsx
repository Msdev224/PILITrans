import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChampTelephone } from "@/components/champ-telephone";

afterEach(cleanup);

/** Valeur réellement soumise au serveur par le champ caché. */
function valeurSoumise(container: HTMLElement): string {
  const cache = container.querySelector<HTMLInputElement>('input[type="hidden"]');
  return cache?.value ?? "";
}

describe("ChampTelephone", () => {
  it("propose la Guinée par défaut", () => {
    render(<ChampTelephone nom="telephone" />);
    const indicatif = screen.getByLabelText("Indicatif du pays") as HTMLSelectElement;
    expect(indicatif.value).toBe("+224");
  });

  it("réunit indicatif et numéro dans le champ soumis", () => {
    const { container } = render(<ChampTelephone nom="telephone" />);
    fireEvent.change(screen.getByLabelText("Numéro national"), { target: { value: "620223344" } });
    expect(valeurSoumise(container)).toBe("+224620223344");
  });

  it("n'envoie rien tant qu'aucun numéro n'est saisi", () => {
    // Un indicatif seul n'est pas un numéro : le soumettre créerait une fiche
    // avec un téléphone inexploitable.
    const { container } = render(<ChampTelephone nom="telephone" />);
    expect(valeurSoumise(container)).toBe("");
  });

  it("suit le changement d'indicatif", () => {
    const { container } = render(<ChampTelephone nom="telephone" />);
    fireEvent.change(screen.getByLabelText("Numéro national"), { target: { value: "775554433" } });
    fireEvent.change(screen.getByLabelText("Indicatif du pays"), { target: { value: "+221" } });
    expect(valeurSoumise(container)).toBe("+221775554433");
  });

  it("refuse les caractères non numériques collés depuis un carnet d'adresses", () => {
    const { container } = render(<ChampTelephone nom="telephone" />);
    fireEvent.change(screen.getByLabelText("Numéro national"), {
      target: { value: "+224 620-22-33-44" },
    });
    // Sans ce filtrage, l'indicatif serait concaténé deux fois.
    expect(valeurSoumise(container)).toBe("+224224620223344");
    expect((screen.getByLabelText("Numéro national") as HTMLInputElement).value).toBe(
      "224620223344",
    );
  });

  it("décompose un numéro existant à l'ouverture d'une fiche", () => {
    render(<ChampTelephone nom="telephone" valeur="+221775554433" />);
    expect((screen.getByLabelText("Indicatif du pays") as HTMLSelectElement).value).toBe("+221");
    expect((screen.getByLabelText("Numéro national") as HTMLInputElement).value).toBe("775554433");
  });

  it("honore un indicatif par défaut différent", () => {
    render(<ChampTelephone nom="telephoneBord2" indicatifDefaut="+221" />);
    expect((screen.getByLabelText("Indicatif du pays") as HTMLSelectElement).value).toBe("+221");
  });

  it("signale une longueur inattendue sans bloquer la saisie", () => {
    render(<ChampTelephone nom="telephone" />);
    fireEvent.change(screen.getByLabelText("Numéro national"), { target: { value: "620" } });
    expect(screen.getByText(/9 chiffres attendus/)).toBeTruthy();
  });
});
