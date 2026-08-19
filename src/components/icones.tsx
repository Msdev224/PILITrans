import type { SVGProps } from "react";

/** Jeu d'icônes de la maquette — traits fins, 24×24, `currentColor`. */
type Props = SVGProps<SVGSVGElement>;

const base = (props: Props) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const IconeTableauDeBord = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconeAnalyses = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const IconeCloche = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const IconeVoyages = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
    <path d="M8 6h6a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h1" />
  </svg>
);

export const IconeDossier = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const IconeFacture = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h4" />
  </svg>
);

export const IconeClients = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.6-1.6-4.6-4-5.2" />
  </svg>
);

export const IconeTriangle = (p: Props) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconeCamion = (p: Props) => (
  <svg {...base(p)}>
    <path d="M2 7h11v9H2z" />
    <path d="M13 10h4l3 3v3h-7z" />
    <circle cx="6" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </svg>
);

export const IconeCle = (p: Props) => (
  <svg {...base(p)}>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2z" />
  </svg>
);

export const IconeCalendrier = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 2.5v4M16 2.5v4" />
  </svg>
);

export const IconeChauffeur = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </svg>
);

export const IconeTelephone = (p: Props) => (
  <svg {...base(p)}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </svg>
);

export const IconeParametres = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.5 12a7.5 7.5 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2.1-1.2L14.6 3H10.4l-.4 2.7a7.5 7.5 0 0 0-2.1 1.2l-2.3-1-2 3.4 2 1.5a7.5 7.5 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2.1 1.2l.4 2.7h4.2l.4-2.7a7.5 7.5 0 0 0 2.1-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z" />
  </svg>
);

export const IconeDepense = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

export const IconeAlerteTriangle = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 3l9 16H3z" />
    <path d="M12 10v4M12 17v.1" />
  </svg>
);

export const IconeHorloge = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconeInfo = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.1M12 11v5" />
  </svg>
);

export const IconeNeige = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 2v20M4 6l16 12M20 6L4 18" />
  </svg>
);

export const IconeDeconnexion = (p: Props) => (
  <svg {...base(p)}>
    <path d="M15 4h4v16h-4M11 8l-4 4 4 4M7 12h10" />
  </svg>
);

export const IconeFleche = (p: Props) => (
  <svg {...base(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const IconeLoupe = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" />
  </svg>
);

export const IconePlus = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconeCrayon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 20h4l10-10-4-4L4 16z" />
  </svg>
);

export const IconeCorbeille = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);

export const IconeValider = (p: Props) => (
  <svg {...base(p)}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="M22 4L12 14.01l-3-3" />
  </svg>
);
