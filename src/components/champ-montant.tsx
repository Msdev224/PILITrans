"use client";

import { useState } from "react";

import { montantEnLettres } from "@/lib/lettres";
import { formatNombre } from "@/lib/utils";

/**
 * Saisie d'un montant, relu en toutes lettres sous le champ.
 *
 * Les écrans affichent des millions (« 46,5 M GNF ») tandis que les champs
 * attendent des francs. Un montant de 46,5 saisi là où il fallait 50 000 000
 * passait inaperçu et faussait toute la rentabilité du camion. Le relire en
 * toutes lettres rend l'erreur évidente à la frappe, quand elle se corrige
 * encore d'un caractère.
 */
export function ChampMontant({
  nom,
  valeur,
  devise = "GNF",
  requis,
  desactive,
  placeholder,
  onChange,
}: {
  nom: string;
  valeur?: string | number | null;
  devise?: "GNF" | "XOF";
  requis?: boolean;
  desactive?: boolean;
  placeholder?: string;
  onChange?: (v: string) => void;
}) {
  const [saisie, setSaisie] = useState(
    valeur === null || valeur === undefined ? "" : String(valeur),
  );

  // On accepte la virgule décimale et les espaces de frappe.
  const nombre = Number(saisie.replace(",", ".").replace(/\s/g, ""));
  const lisible = saisie.trim() !== "" && Number.isFinite(nombre) && nombre > 0;

  return (
    <>
      <input
        name={nom}
        inputMode="decimal"
        required={requis}
        disabled={desactive}
        placeholder={placeholder}
        value={saisie}
        onChange={(e) => {
          setSaisie(e.target.value);
          onChange?.(e.target.value);
        }}
      />
      {lisible ? (
        <span className="montant-lettres">
          {formatNombre(nombre)} — {montantEnLettres(Math.round(nombre), devise)}
        </span>
      ) : null}
    </>
  );
}
