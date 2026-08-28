/**
 * Section repliable de l'espace chauffeur.
 *
 * `<details>` natif, et non un état React : la section s'ouvre sans JavaScript,
 * répond au clavier, et se laisse trouver par la recherche du navigateur —
 * trois choses qu'un repli fait main perd presque toujours.
 */
export function Volet({
  titre,
  ouvert,
  indice,
  children,
}: {
  titre: string;
  ouvert: boolean;
  /** Texte court affiché à droite : ce qui reste à faire, ou l'état constaté. */
  indice?: string | null;
  children: React.ReactNode;
}) {
  return (
    <details className="ph-volet" open={ouvert}>
      <summary>
        <span className="ph-volet-titre">{titre}</span>
        {indice ? <span className="ph-volet-indice">{indice}</span> : null}
        <svg className="ph-volet-fleche" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="ph-volet-corps">{children}</div>
    </details>
  );
}
