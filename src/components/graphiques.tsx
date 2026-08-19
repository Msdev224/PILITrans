import type { Corridor, PosteCout } from "@/lib/donnees/analyses";
import type { PnlCamion, PointMensuel } from "@/lib/donnees/camions";
import { formatDecimal, formatMillions, formatMillionsSigne } from "@/lib/utils";

const MOIS_COURTS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

/** Courbe de la marge d'exploitation mensuelle. L'échelle s'adapte aux valeurs réelles. */
export function CourbeMarge({ points }: { points: PointMensuel[] }) {
  if (points.length < 2) return null;

  const L = 30;
  const R = 310;
  const HAUT = 20;
  const BAS = 115;

  const valeurs = points.map((p) => p.margeGnf);
  const max = Math.max(...valeurs, 0);
  const min = Math.min(...valeurs, 0);
  const etendue = max - min || 1;

  const x = (i: number) => L + (i * (R - L)) / (points.length - 1);
  const y = (v: number) => BAS - ((v - min) / etendue) * (BAS - HAUT);

  const ligne = points.map((p, i) => `${x(i)},${y(p.margeGnf)}`).join(" ");
  const aire = `M${ligne.split(" ").join(" L")} L${R},${BAS} L${L},${BAS} Z`;
  const zero = min < 0 && max > 0 ? y(0) : null;
  const dernier = points[points.length - 1];

  return (
    <div className="card chart-card p-[17px_19px]">
      <h4 className="m-0 text-sm">Marge d&apos;exploitation mensuelle</h4>
      <div className="mb-3 mt-0.5 text-[11.5px] text-[var(--muted-2)]">
        {points.length} derniers mois · M GNF
      </div>
      <svg viewBox="0 0 320 150" className="block h-auto w-full">
        <line x1={L} y1={BAS} x2={R} y2={BAS} stroke="var(--line)" />
        <line x1={L} y1={(HAUT + BAS) / 2} x2={R} y2={(HAUT + BAS) / 2} stroke="var(--line-soft)" />
        <line x1={L} y1={HAUT} x2={R} y2={HAUT} stroke="var(--line-soft)" />
        {zero !== null ? <line x1={L} y1={zero} x2={R} y2={zero} stroke="var(--line)" strokeDasharray="3 3" /> : null}

        <path d={aire} fill="var(--accent-voile)" />
        <polyline
          points={ligne}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g fill="var(--accent)">
          {points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.margeGnf)} r={i === points.length - 1 ? 3.6 : 3} />
          ))}
        </g>
        <g fontSize="9" fill="var(--muted-2)" textAnchor="middle" fontFamily="var(--police-corps)">
          {points.map((p, i) => (
            <text key={i} x={x(i)} y={132}>
              {MOIS_COURTS[p.periode.debut.getMonth()]}
            </text>
          ))}
        </g>
        <text
          x={R}
          y={Math.max(y(dernier.margeGnf) - 8, 10)}
          textAnchor="end"
          fontSize="11"
          fontWeight="600"
          fontFamily="var(--police-mono)"
          fill={dernier.margeGnf >= 0 ? "var(--pos)" : "var(--neg)"}
        >
          {formatMillionsSigne(dernier.margeGnf)} M
        </text>
      </svg>
    </div>
  );
}

/** Recette vs coûts, camion par camion. */
export function BarresRecetteCouts({ camions }: { camions: PnlCamion[] }) {
  const visibles = camions.filter((c) => c.recetteGnf > 0 || c.couts > 0);
  if (visibles.length === 0) return null;

  const BAS = 125;
  const HAUT = 17;
  const max = Math.max(...visibles.flatMap((c) => [c.recetteGnf, c.couts]), 1);
  const largeurGroupe = 280 / visibles.length;
  const largeurBarre = Math.min(30, largeurGroupe / 3);

  const hauteur = (v: number) => Math.max(((v / max) * (BAS - HAUT)) | 0, 1);

  return (
    <div className="card chart-card p-[17px_19px]">
      <h4 className="m-0 text-sm">Recette vs coûts par camion</h4>
      <div className="mb-3 mt-0.5 text-[11.5px] text-[var(--muted-2)]">Ce mois · M GNF</div>
      <svg viewBox="0 0 320 150" className="block h-auto w-full">
        <line x1={20} y1={BAS} x2={310} y2={BAS} stroke="var(--line)" />
        {visibles.map((c, i) => {
          const centre = 30 + largeurGroupe * (i + 0.5);
          const xRecette = centre - largeurBarre - 3;
          const xCouts = centre + 3;
          const hRecette = hauteur(c.recetteGnf);
          const hCouts = hauteur(c.couts);
          return (
            <g key={c.camion.id}>
              <rect x={xRecette} y={BAS - hRecette} width={largeurBarre} height={hRecette} rx="3" fill="var(--accent)" />
              <rect x={xCouts} y={BAS - hCouts} width={largeurBarre} height={hCouts} rx="3" fill="var(--gris-barre)" />
              <text
                x={xRecette + largeurBarre / 2}
                y={BAS - hRecette - 5}
                fontSize="9"
                fill="var(--ink)"
                textAnchor="middle"
                fontFamily="var(--police-mono)"
                fontWeight="600"
              >
                {formatMillions(c.recetteGnf)}
              </text>
              <text
                x={xCouts + largeurBarre / 2}
                y={BAS - hCouts - 5}
                fontSize="9"
                fill="var(--muted)"
                textAnchor="middle"
                fontFamily="var(--police-mono)"
                fontWeight="600"
              >
                {formatMillions(c.couts)}
              </text>
              <text
                x={centre}
                y={142}
                fontSize="10"
                fill="var(--muted)"
                textAnchor="middle"
                fontFamily="var(--police-corps)"
                fontWeight="600"
              >
                {c.camion.nom}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11.5px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--accent)]" />
          Recette
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--gris-barre)]" />
          Charges d&apos;exploitation
        </span>
      </div>
    </div>
  );
}

/** Marge d'exploitation par camion — barres horizontales, négatives à gauche de l'axe. */
export function BarresMargeCamion({ camions }: { camions: PnlCamion[] }) {
  const visibles = camions.filter((c) => c.recetteGnf > 0 || c.couts > 0);
  if (visibles.length === 0) return null;

  const AXE = 150;
  // À gauche de l'axe il faut laisser la place aux libellés : sans ce plafond,
  // une barre négative sortirait du cadre et recouvrirait le nom du camion.
  const aDesNegatifs = visibles.some((c) => c.margeExploitation < 0);
  const LARGEUR_MAX = aDesNegatifs ? 90 : 135;
  const echelle = Math.max(...visibles.map((c) => Math.abs(c.margeExploitation)), 1);
  const hauteurLigne = 40;
  const hauteur = visibles.length * hauteurLigne + 20;

  return (
    <div className="card chart-card">
      <h4 className="m-0 text-sm">Marge par camion</h4>
      <div className="mb-3 mt-0.5 text-[11.5px] text-[var(--muted-2)]">Marge d&apos;exploitation · M GNF</div>
      <svg viewBox={`0 0 300 ${hauteur}`} className="block h-auto w-full">
        <line x1={AXE} y1={8} x2={AXE} y2={hauteur - 12} stroke="var(--line)" />
        {visibles.map((c, i) => {
          const largeur = Math.max((Math.abs(c.margeExploitation) / echelle) * LARGEUR_MAX, 2);
          const positive = c.margeExploitation >= 0;
          const y = 14 + i * hauteurLigne;
          return (
            <g key={c.camion.id}>
              <rect
                x={positive ? AXE : AXE - largeur}
                y={y}
                width={largeur}
                height={22}
                rx="3"
                fill={positive ? "var(--accent)" : "var(--neg)"}
              />
              <text x={6} y={y + 15} fontSize="10" fill="var(--muted)" fontFamily="var(--police-corps)">
                {c.camion.nom}
              </text>
              <text
                x={292}
                y={y + 15}
                fontSize="11"
                textAnchor="end"
                fontFamily="var(--police-mono)"
                fontWeight="600"
                fill={positive ? "var(--pos)" : "var(--neg)"}
              >
                {formatMillionsSigne(c.margeExploitation)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Répartition des coûts — anneau + légende chiffrée. */
export function AnneauCouts({ postes, total }: { postes: PosteCout[]; total: number }) {
  if (postes.length === 0) return null;

  const RAYON = 45;
  const CIRCONFERENCE = 2 * Math.PI * RAYON;
  let decalage = 0;

  return (
    <div className="card chart-card">
      <h4 className="m-0 text-sm">Répartition des coûts</h4>
      <div className="mb-3 mt-0.5 text-[11.5px] text-[var(--muted-2)]">Postes · ce mois</div>
      <svg viewBox="0 0 300 160" className="block h-auto w-full">
        <g transform="rotate(-90 70 80)" fill="none" strokeWidth="18">
          {postes.map((poste) => {
            const longueur = (poste.pct / 100) * CIRCONFERENCE;
            const arc = (
              <circle
                key={poste.libelle}
                cx="70"
                cy="80"
                r={RAYON}
                stroke={poste.couleur}
                strokeDasharray={`${longueur} ${CIRCONFERENCE}`}
                strokeDashoffset={-decalage}
              />
            );
            decalage += longueur;
            return arc;
          })}
        </g>
        <text x="70" y="77" textAnchor="middle" fontSize="11" fontFamily="var(--police-corps)" fill="var(--muted-2)">
          Coûts
        </text>
        <text
          x="70"
          y="91"
          textAnchor="middle"
          fontSize="12"
          fontFamily="var(--police-mono)"
          fontWeight="600"
          fill="var(--ink)"
        >
          {formatMillions(total)}M
        </text>

        <g fontSize="10.5" fontFamily="var(--police-corps)" fill="var(--muted)">
          {postes.slice(0, 6).map((poste, i) => (
            <g key={poste.libelle}>
              <rect x="150" y={16 + i * 22} width="10" height="10" rx="2" fill={poste.couleur} />
              <text x="166" y={25 + i * 22}>
                {poste.libelle} — {formatDecimal(poste.pct)} %
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Rentabilité par corridor — marge estimée au coût kilométrique moyen. */
export function BarresCorridors({ corridors }: { corridors: Corridor[] }) {
  if (corridors.length === 0) return null;

  const AXE = 150;
  // Même contrainte que pour les camions : une seule échelle, bornée par le
  // côté le plus étroit pour que rien ne déborde.
  const aDesNegatifs = corridors.some((c) => c.margeGnf < 0);
  const LARGEUR_MAX = aDesNegatifs ? 120 : 380;
  const echelle = Math.max(...corridors.map((c) => Math.abs(c.margeGnf)), 1);
  const hauteurLigne = 40;
  const hauteur = corridors.length * hauteurLigne + 20;

  return (
    <div className="card chart-card wide">
      <h4 className="m-0 text-sm">Rentabilité par corridor</h4>
      <div className="mb-3 mt-0.5 text-[11.5px] text-[var(--muted-2)]">
        Marge au coût kilométrique variable (carburant, frais, rémunération) · M GNF
      </div>
      <svg viewBox={`0 0 620 ${hauteur}`} className="block h-auto w-full">
        <line x1={AXE} y1={8} x2={AXE} y2={hauteur - 12} stroke="var(--line)" />
        {corridors.map((c, i) => {
          const largeur = Math.max((Math.abs(c.margeGnf) / echelle) * LARGEUR_MAX, 2);
          const positive = c.margeGnf >= 0;
          const y = 14 + i * hauteurLigne;
          return (
            <g key={c.libelle}>
              <rect
                x={positive ? AXE : AXE - largeur}
                y={y}
                width={largeur}
                height={26}
                rx="3"
                fill={positive ? "var(--accent)" : "var(--neg)"}
              />
              <text x={6} y={y + 17} fontSize="10" fill="var(--muted)" fontFamily="var(--police-corps)">
                {c.libelle.length > 24 ? `${c.libelle.slice(0, 23)}…` : c.libelle}
              </text>
              <text
                x={positive ? AXE + largeur + 8 : AXE - largeur - 8}
                y={y + 17}
                fontSize="11"
                textAnchor={positive ? "start" : "end"}
                fontFamily="var(--police-mono)"
                fontWeight="600"
                fill={positive ? "var(--pos)" : "var(--neg)"}
              >
                {formatMillionsSigne(c.margeGnf)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
