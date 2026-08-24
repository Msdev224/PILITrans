"use client";

/**
 * Impression de la page courante.
 *
 * Un bouton plutôt qu'un simple « Ctrl+P » : sur un rapport qu'on remet à un
 * associé ou à un banquier, il faut que le geste soit évident. Les éléments
 * marqués `no-print` — filtres, navigation — disparaissent à l'impression.
 */
export function BoutonImprimer({ libelle = "Imprimer" }: { libelle?: string }) {
  return (
    <button type="button" className="btn ghost sm" onClick={() => window.print()}>
      {libelle}
    </button>
  );
}
