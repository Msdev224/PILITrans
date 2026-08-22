"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface OptionRecherche {
  id: string;
  /** Ce qui s'affiche en gras. */
  libelle: string;
  /** Seconde ligne : ville, immatriculation, téléphone… */
  detail?: string | null;
  /** Termes supplémentaires cherchés sans être affichés (numéro, référence). */
  recherche?: string | null;
  /** Photo en data URI, quand elle existe. */
  photo?: string | null;
}

/**
 * Sélection dans une liste, avec recherche au clavier et vignette.
 *
 * Un menu déroulant ordinaire oblige à faire défiler et ne cherche que sur la
 * première lettre. Passé quelques dizaines de clients, retrouver « Diallo &
 * Bussiness » devient pénible — et on ne peut pas le retrouver par son numéro
 * de téléphone, qui est pourtant ce qu'on a souvent sous les yeux.
 */
/**
 * Réduit un texte à sa forme cherchable : minuscules, sans accents, sans
 * espaces ni ponctuation superflus.
 *
 * Personne ne tape « Baldé » avec son accent, ni « +224 622 40 50 60 » avec
 * ses espaces. Sans cette normalisation, la recherche ne trouvait ni l'un ni
 * l'autre — et donnait l'impression que le client n'existait pas.
 */
function sansAccents(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s.\-()]/g, "")
    .trim();
}

export function ChampRecherche({
  nom,
  options,
  valeur,
  requis,
  placeholder = "Rechercher…",
  vide = "— Aucun —",
}: {
  nom: string;
  options: OptionRecherche[];
  valeur?: string | null;
  requis?: boolean;
  placeholder?: string;
  /** Libellé du choix « aucun ». Absent si le champ est obligatoire. */
  vide?: string;
}) {
  const [choisi, setChoisi] = useState(valeur ?? "");
  const [saisie, setSaisie] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const bloc = useRef<HTMLDivElement>(null);

  const selection = options.find((o) => o.id === choisi) ?? null;

  const filtrees = useMemo(() => {
    const q = sansAccents(saisie);
    if (!q) return options;
    // On cherche aussi dans les termes cachés : un numéro de téléphone se
    // retrouve alors qu'il n'est pas forcément affiché.
    return options.filter((o) =>
      sansAccents([o.libelle, o.detail, o.recherche].filter(Boolean).join(" ")).includes(q),
    );
  }, [options, saisie]);

  // Un clic hors du bloc referme la liste sans rien changer.
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (bloc.current && !bloc.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);

  return (
    <div className="rech" ref={bloc}>
      <input type="hidden" name={nom} value={choisi} required={requis} />

      <button
        type="button"
        className="rech-declencheur"
        onClick={() => {
          setOuvert((o) => !o);
          setSaisie("");
        }}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
      >
        {selection ? (
          <span className="rech-choix">
            {selection.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selection.photo} alt="" className="rech-vignette" />
            ) : null}
            <span className="rech-texte">
              <b>{selection.libelle}</b>
              {selection.detail ? <span className="t-sub">{selection.detail}</span> : null}
            </span>
          </span>
        ) : (
          <span className="rech-vide">{requis ? "Choisir…" : vide}</span>
        )}
        <span className="rech-fleche" aria-hidden="true">
          ▾
        </span>
      </button>

      {ouvert ? (
        <div className="rech-panneau">
          <input
            className="rech-saisie"
            autoFocus
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />

          <ul className="rech-liste" role="listbox">
            {!requis ? (
              <li>
                <button
                  type="button"
                  className="rech-option"
                  onClick={() => {
                    setChoisi("");
                    setOuvert(false);
                  }}
                >
                  <span className="rech-texte">
                    <b>{vide}</b>
                  </span>
                </button>
              </li>
            ) : null}

            {filtrees.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`rech-option${o.id === choisi ? " on" : ""}`}
                  onClick={() => {
                    setChoisi(o.id);
                    setOuvert(false);
                  }}
                >
                  {o.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.photo} alt="" className="rech-vignette" />
                  ) : (
                    <span className="rech-vignette rech-initiales">
                      {o.libelle.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="rech-texte">
                    <b>{o.libelle}</b>
                    {o.detail ? <span className="t-sub">{o.detail}</span> : null}
                  </span>
                </button>
              </li>
            ))}

            {filtrees.length === 0 ? (
              <li className="rech-aucun">Aucun résultat pour « {saisie} »</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
