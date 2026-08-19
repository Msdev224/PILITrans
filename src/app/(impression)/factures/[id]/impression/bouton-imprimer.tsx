"use client";

export function BoutonImprimer() {
  return (
    <div className="barre-impression">
      <button type="button" className="btn ghost" onClick={() => window.history.back()}>
        ← Retour
      </button>
      <button type="button" className="btn primary" onClick={() => window.print()}>
        Imprimer / Enregistrer en PDF
      </button>
    </div>
  );
}
