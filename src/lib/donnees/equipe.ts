import type { Chauffeur } from "@prisma/client";

import { remunerationVoyage, soldeCaisse } from "@/lib/calculs";
import { kmVoyage } from "@/lib/donnees/camions";
import { dansPeriode, type Periode } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { debutDeJour, n } from "@/lib/utils";

/** Un mouvement de caisse tel qu'affiché au gérant. */
export interface MouvementVue {
  id: string;
  type: string;
  montant: number;
  devise: string;
  montantGnf: number;
  motif: string | null;
  date: string;
  /**
   * Adossé à une dépense : il ne se supprime pas seul, sans quoi la dépense
   * resterait sans contrepartie de caisse.
   */
  lieAUneDepense: boolean;
}

export interface LigneChauffeur {
  chauffeur: Chauffeur;
  nbVoyages: number;
  nbVoyagesMois: number;
  /** Paie cumulée du mois — versée si saisie, estimée sinon. */
  remunerationMoisGnf: number;
  /** Historique de caisse, du plus récent au plus ancien. */
  mouvements: MouvementVue[];
  /** Missions non terminées : celles qu'une avance peut financer. */
  missionsEnCours: { id: string; libelle: string }[];
  soldeGnf: number;
  soldeXof: number;
  consolideGnf: number;
  /** Jours restants avant expiration du permis ; `null` si non renseigné. */
  joursPermis: number | null;
  enMission: boolean;
}

const JOUR_MS = 86_400_000;

export async function vueChauffeurs(
  periode: Periode,
  aujourdhui: Date = new Date(),
): Promise<LigneChauffeur[]> {
  const ceJour = debutDeJour(aujourdhui);

  /*
   * Trois lectures, trois portées différentes.
   *
   * Le solde d'un chauffeur est cumulatif : il ne se fenêtre pas sans se
   * fausser, mais il ne dépend que de sommes par type et devise — un agrégat
   * les donne, quel que soit le volume. L'historique affiché, lui, n'est
   * qu'une liste : cinquante lignes suffisent à relire et corriger.
   *
   * `prisma.mouvementCaisse.findMany()` était appelé sans le moindre argument :
   * toutes les écritures de caisse jamais saisies, à chaque ouverture de
   * l'écran Chauffeurs.
   */
  const [chauffeurs, voyages, soldes, mouvements] = await Promise.all([
    prisma.chauffeur.findMany({ orderBy: [{ actif: "desc" }, { nom: "asc" }] }),
    prisma.voyage.findMany({
      where: { statut: { not: "ANNULE" } },
      select: {
        id: true,
        reference: true,
        villeDepart: true,
        villeArrivee: true,
        chauffeurId: true,
        statut: true,
        dateDepart: true,
        recetteGnf: true,
        remunerationChauffeur: true,
        distanceKm: true,
        kmDepart: true,
        kmArrivee: true,
      },
    }),
    // Soldes : sommes par chauffeur, type et devise. Exact et borné.
    prisma.mouvementCaisse.groupBy({
      by: ["chauffeurId", "type", "devise"],
      _sum: { montant: true, montantGnf: true },
    }),
    // Historique affiché : les cinquante dernières écritures, tous chauffeurs
    // confondus — de quoi remplir largement chaque fiche ouverte.
    prisma.mouvementCaisse.findMany({ orderBy: { date: "desc" }, take: 50 }),
  ]);

  const enRoute = new Set(
    voyages
      .filter((v) => !["TERMINE", "ANNULE", "PLANIFIE"].includes(v.statut))
      .map((v) => v.chauffeurId),
  );

  return chauffeurs.map((chauffeur) => {
    const siens = voyages.filter((v) => v.chauffeurId === chauffeur.id);
    const duMois = siens.filter((v) => dansPeriode(v.dateDepart, periode));

    // Paie du mois : la valeur réellement versée prime, sinon on l'estime
    // depuis le mode de rémunération — même règle que le P&L camion.
    const remunerationMoisGnf = duMois.reduce((total, v) => {
      if (v.remunerationChauffeur != null) return total + n(v.remunerationChauffeur);
      return (
        total +
        remunerationVoyage({
          mode: chauffeur.modeRemuneration,
          taux: n(chauffeur.tauxRemuneration),
          recetteGnf: n(v.recetteGnf),
          km: kmVoyage(v),
        })
      );
    }, 0);

    // `soldeCaisse` ne fait que sommer avec un signe : partir des totaux par
    // type et devise donne exactement le même résultat que ligne à ligne.
    const solde = soldeCaisse(
      soldes
        .filter((m) => m.chauffeurId === chauffeur.id)
        .map((m) => ({
          type: m.type,
          montant: n(m._sum.montant),
          devise: m.devise,
          montantGnf: n(m._sum.montantGnf),
        })),
    );

    return {
      chauffeur,
      nbVoyages: siens.length,
      nbVoyagesMois: duMois.length,
      remunerationMoisGnf,
      // L'historique permet de relire — et de corriger — ce qui a été saisi.
      // Sans lui, une avance entrée par erreur restait dans le solde à vie.
      mouvements: mouvements
        .filter((m) => m.chauffeurId === chauffeur.id)
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map((m) => ({
          id: m.id,
          type: m.type,
          montant: n(m.montant),
          devise: m.devise,
          montantGnf: n(m.montantGnf),
          motif: m.motif,
          date: m.date.toISOString(),
          lieAUneDepense: m.depenseId != null,
        })),
      missionsEnCours: siens
        .filter((v) => v.statut !== "TERMINE" && v.statut !== "ANNULE")
        .map((v) => ({
          id: v.id,
          libelle: `${v.villeDepart} → ${v.villeArrivee} (${v.reference})`,
        })),
      soldeGnf: solde.parDevise.GNF,
      soldeXof: solde.parDevise.XOF,
      consolideGnf: solde.consolideGnf,
      joursPermis: chauffeur.permisExpire
        ? Math.ceil((chauffeur.permisExpire.getTime() - ceJour.getTime()) / JOUR_MS)
        : null,
      enMission: enRoute.has(chauffeur.id),
    };
  });
}

export interface LigneEcheance {
  id: string;
  camionId: string;
  camionNom: string;
  type: string;
  /** N° de police / document, à citer lors d'un contrôle. */
  numero: string | null;
  organisme: string | null;
  dateDebut: Date | null;
  montantGnf: number | null;
  dateExpiration: Date;
  rappelJours: number;
  joursRestants: number;
  /** `true` si l'échéance est dans la fenêtre de rappel ou déjà dépassée. */
  aSignaler: boolean;
}

export async function vueEcheances(aujourdhui: Date = new Date()): Promise<LigneEcheance[]> {
  const ceJour = debutDeJour(aujourdhui);

  const echeances = await prisma.echeance.findMany({
    include: { camion: { select: { nom: true } } },
    orderBy: { dateExpiration: "asc" },
  });

  return echeances.map((e) => {
    const joursRestants = Math.ceil((e.dateExpiration.getTime() - ceJour.getTime()) / JOUR_MS);
    return {
      id: e.id,
      camionId: e.camionId,
      camionNom: e.camion.nom,
      type: e.type,
      numero: e.numero,
      organisme: e.organisme,
      dateDebut: e.dateDebut,
      montantGnf: e.montantGnf != null ? n(e.montantGnf) : null,
      dateExpiration: e.dateExpiration,
      rappelJours: e.rappelJours,
      joursRestants,
      aSignaler: joursRestants <= e.rappelJours,
    };
  });
}
