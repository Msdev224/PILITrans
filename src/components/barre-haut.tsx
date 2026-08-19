import { IconeCloche } from "@/components/icones";
import { formatDecimal, initiales } from "@/lib/utils";

interface Props {
  titre: string;
  sousTitre: string;
  nbAlertesUrgentes: number;
  tauxReferenceXof: number | null;
  utilisateur: string;
}

export function BarreHaut({ titre, sousTitre, nbAlertesUrgentes, tauxReferenceXof, utilisateur }: Props) {
  return (
    <header className="top">
      <div>
        <h2>{titre}</h2>
        <div className="sub">{sousTitre}</div>
      </div>
      <div className="spacer" />

      {tauxReferenceXof !== null ? (
        <span className="chip rate" title="Taux de référence — corrigé à chaque saisie en CFA">
          <span className="k">Dernier taux</span>
          <span className="v">1&nbsp;CFA ≈ {formatDecimal(tauxReferenceXof, 2)}&nbsp;GNF</span>
        </span>
      ) : null}

      <span className="chip relative w-[34px] justify-center p-0">
        <IconeCloche width={16} height={16} />
        {nbAlertesUrgentes > 0 ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-[var(--neg)] px-[5px] py-px text-[9px] font-bold text-white">
            {nbAlertesUrgentes}
          </span>
        ) : null}
      </span>

      <div className="avatar" title={utilisateur}>
        {initiales(utilisateur)}
      </div>
    </header>
  );
}
