import { historiqueTaux } from "@/lib/donnees/taux";
import { formatDate, formatDecimal } from "@/lib/utils";

/**
 * Taux GNF ⇄ CFA réellement pratiqués.
 *
 * Le taux de référence se met à jour tout seul depuis les transactions en
 * devise. Sans cet historique, le gérant voyait un chiffre changer dans les
 * Paramètres sans savoir d'où il venait ni s'il était crédible — et n'avait
 * aucun moyen de repérer une saisie erronée qui l'aurait fait dériver.
 */
export async function HistoriqueTaux() {
  const points = await historiqueTaux(8);
  if (points.length === 0) return null;

  const [recent] = points;
  const precedent = points[1];
  const variation =
    precedent && precedent.taux > 0
      ? ((recent.taux - precedent.taux) / precedent.taux) * 100
      : null;

  return (
    <div className="taux-hist">
      <div className="lab">Taux observés sur les transactions</div>

      <div className="taux-actuel">
        <b className="mono">1 CFA ≈ {formatDecimal(recent.taux, 2)} GNF</b>
        {variation !== null && Math.abs(variation) >= 0.01 ? (
          <span className={variation > 0 ? "t-sub pos" : "t-sub neg"}>
            {variation > 0 ? "+" : "−"}
            {formatDecimal(Math.abs(variation), 1)} % vs précédent
          </span>
        ) : null}
      </div>

      <ul className="taux-liste">
        {points.map((p) => (
          <li key={p.dateEffet.toISOString()}>
            <span className="mono">{formatDecimal(p.taux, 2)}</span>
            <span className="muted">{formatDate(p.dateEffet)}</span>
          </li>
        ))}
      </ul>

      <p className="aide-role">
        Relevés automatiquement dès qu&apos;une transaction en CFA fige un équivalent GNF
        s&apos;écartant de plus de 0,5 % du dernier connu. Le champ ci-dessus suit le plus
        récent ; le corriger à la main ne change que le pré-remplissage.
      </p>
    </div>
  );
}
