"use client";

import { useState } from "react";

import { supprimerMouvementCaisse } from "@/actions/caisse";
import type { MouvementVue } from "@/lib/donnees/equipe";
import { formatDate, formatDevise, LIBELLE_MOUVEMENT as LIBELLE } from "@/lib/utils";

/**
 * Historique de caisse d'un chauffeur.
 *
 * Sans lui, une avance saisie par erreur restait dans le solde à vie : le
 * gérant voyait un chauffeur devoir de l'argent qu'il n'avait jamais reçu.
 * Les sorties adossées à une dépense ne s'y suppriment pas — elles se
 * corrigent depuis la dépense, sinon celle-ci perdrait sa contrepartie.
 */
export function HistoriqueCaisse({
  nom,
  mouvements,
}: {
  nom: string;
  mouvements: MouvementVue[];
}) {
  const [ouvert, setOuvert] = useState(false);

  if (mouvements.length === 0) return null;

  return (
    <div className="caisse-hist">
      <button type="button" className="btn ghost sm" onClick={() => setOuvert((o) => !o)}>
        {ouvert ? "Masquer" : `Historique de caisse (${mouvements.length})`}
      </button>

      {ouvert ? (
        <table className="tbl mt-2">
          <thead>
            <tr>
              <th>Date</th>
              <th>Nature</th>
              <th>Motif</th>
              <th className="num">Montant</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {mouvements.map((m) => (
              <tr key={m.id}>
                <td className="muted">{formatDate(new Date(m.date))}</td>
                <td>{LIBELLE[m.type] ?? m.type}</td>
                <td className="muted">{m.motif ?? "—"}</td>
                <td className="num">
                  {formatDevise(m.montant, m.devise === "XOF" ? "XOF" : "GNF")}
                </td>
                <td className="actions-cell">
                  {m.lieAUneDepense ? (
                    <span className="t-sub" title="Corriger la dépense correspondante">
                      liée à une dépense
                    </span>
                  ) : (
                    <form action={supprimerMouvementCaisse.bind(null, m.id)}>
                      <button
                        type="submit"
                        className="btn ghost sm"
                        title={`Supprimer ce mouvement de la caisse de ${nom}`}
                      >
                        Supprimer
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
