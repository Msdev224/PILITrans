"use client";

import { useState } from "react";

import { decomposerTelephone, INDICATIFS } from "@/lib/telephone";

/**
 * Saisie d'un numéro : indicatif choisi dans une liste, partie nationale tapée
 * à côté. Le champ envoyé au serveur porte le numéro complet.
 *
 * L'indicatif n'est pas laissé à la frappe libre : dans une exploitation
 * Guinée ⇄ Sénégal, un numéro saisi sans indicatif est ambigu, et un numéro
 * ambigu ne part jamais en SMS. Le serveur renormalise de toute façon — ce
 * composant sert à rendre l'indicatif visible et difficile à oublier.
 */
export function ChampTelephone({
  nom,
  valeur,
  requis,
  indicatifDefaut,
  id,
  autoComplete = "tel-national",
}: {
  nom: string;
  valeur?: string | null;
  requis?: boolean;
  indicatifDefaut?: string;
  /** Porté par le champ visible, pour qu'un `<label htmlFor>` l'atteigne. */
  id?: string;
  /** `username` sur l'écran de connexion : le numéro y sert d'identifiant. */
  autoComplete?: string;
}) {
  const initial = decomposerTelephone(valeur);
  const [indicatif, setIndicatif] = useState(
    valeur ? initial.indicatif : (indicatifDefaut ?? initial.indicatif),
  );
  const [national, setNational] = useState(initial.national);

  const attendu = INDICATIFS.find((i) => i.code === indicatif)?.longueur;
  const trop = attendu != null && national.length > 0 && national.length !== attendu;

  return (
    <div className="tel-groupe">
      {/* Valeur réellement soumise : indicatif et numéro réunis. */}
      <input type="hidden" name={nom} value={national ? `${indicatif}${national}` : ""} />

      <select
        value={indicatif}
        onChange={(e) => setIndicatif(e.target.value)}
        className="tel-indicatif"
        aria-label="Indicatif du pays"
      >
        {INDICATIFS.map((i) => (
          <option key={i.code} value={i.code}>
            {i.code} · {i.libelle}
          </option>
        ))}
      </select>

      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        required={requis}
        value={national}
        // On n'accepte que des chiffres : un `+` ou un espace collé depuis un
        // carnet d'adresses fausserait la concaténation avec l'indicatif.
        onChange={(e) => setNational(e.target.value.replace(/\D/g, ""))}
        placeholder={attendu ? "0".repeat(attendu) : "Numéro"}
        aria-label="Numéro national"
        className="tel-numero"
      />

      {trop ? (
        <span className="tel-note">
          {attendu} chiffres attendus pour {INDICATIFS.find((i) => i.code === indicatif)?.libelle}
        </span>
      ) : null}
    </div>
  );
}
