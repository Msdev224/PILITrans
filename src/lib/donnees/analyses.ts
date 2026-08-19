import {
  coutParKm,
  margeParKm,
  ratioCarburantRecette,
  recetteParKm,
  tauxAVide,
  tauxUtilisation,
} from "@/lib/calculs";
import { pnlFlotte, serieMensuelle, type PnlCamion, type PointMensuel } from "@/lib/donnees/camions";
import { moisCourant, type Periode } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

export interface PosteCout {
  libelle: string;
  montantGnf: number;
  pct: number;
  couleur: string;
}

export interface Corridor {
  libelle: string;
  nbVoyages: number;
  recetteGnf: number;
  margeGnf: number;
  km: number;
}

export interface Analyses {
  periode: Periode;
  camions: PnlCamion[];
  serie: PointMensuel[];

  // Indicateurs de flotte
  coutKm: number;
  recetteKm: number;
  margeKm: number;
  tauxUtilisationPct: number;
  tauxAVidePct: number;
  ratioCarburantPct: number;

  joursRoulage: number;
  joursDisponibles: number;
  /** Coût kilométrique variable — base de comparaison des corridors. */
  coutVariableKm: number;

  postes: PosteCout[];
  coutsTotalGnf: number;
  corridors: Corridor[];
}

const COULEURS = ["var(--accent)", "var(--neg)", "#E0A100", "var(--accent-2)", "#8A99A0", "var(--intl)"];

/** Nombre de jours du mois écoulés (le mois en cours n'est pas terminé). */
function joursEcoules(periode: Periode, aujourdhui: Date): number {
  const fin = aujourdhui < periode.fin ? aujourdhui : new Date(periode.fin.getTime() - 1);
  return Math.max(1, fin.getDate());
}

export async function analyses(aujourdhui: Date = new Date()): Promise<Analyses> {
  const periode = moisCourant(aujourdhui);

  const [camions, serie, voyages] = await Promise.all([
    pnlFlotte(periode),
    serieMensuelle(6, aujourdhui),
    prisma.voyage.findMany({
      where: { statut: { not: "ANNULE" }, dateDepart: { gte: periode.debut, lt: periode.fin } },
      select: {
        villeDepart: true,
        villeArrivee: true,
        aVide: true,
        recetteGnf: true,
        distanceKm: true,
        kmDepart: true,
        kmArrivee: true,
        dateDepart: true,
        dateArrivee: true,
        camionId: true,
      },
    }),
  ]);

  const somme = (champ: keyof PnlCamion) =>
    camions.reduce((total, p) => total + (p[champ] as number), 0);

  const recetteGnf = somme("recetteGnf");
  const coutsGnf = somme("couts");
  const margeGnf = somme("margeExploitation");
  const km = somme("km");
  const kmAVide = somme("kmAVide");

  // Taux d'utilisation : jours effectivement roulés rapportés aux jours-camion
  // disponibles sur la période.
  const jours = joursEcoules(periode, aujourdhui);
  const joursDisponibles = Math.max(camions.length * jours, 1);
  const joursRoulage = voyages.reduce((total, v) => {
    const fin = v.dateArrivee && v.dateArrivee < aujourdhui ? v.dateArrivee : aujourdhui;
    const duree = Math.max(1, Math.round((fin.getTime() - v.dateDepart.getTime()) / 86_400_000));
    return total + duree;
  }, 0);

  // Répartition des coûts par poste.
  const bruts: { libelle: string; montantGnf: number }[] = [
    { libelle: "Gasoil", montantGnf: somme("gasoilGnf") },
    { libelle: "Réparations", montantGnf: somme("reparationsGnf") },
    { libelle: "Rémunération", montantGnf: somme("remunerationGnf") },
    { libelle: "Frais de voyage", montantGnf: somme("autresDepensesGnf") },
    { libelle: "Entretien", montantGnf: somme("entretiensGnf") },
  ];
  const postes: PosteCout[] = bruts
    .filter((p) => p.montantGnf > 0)
    .sort((a, b) => b.montantGnf - a.montantGnf)
    .map((p, i) => ({
      ...p,
      pct: coutsGnf > 0 ? Math.round((p.montantGnf / coutsGnf) * 1000) / 10 : 0,
      couleur: COULEURS[i % COULEURS.length],
    }));

  // Rentabilité par corridor : les trajets à vide sont regroupés à part, car
  // ils n'ont pas d'origine commerciale.
  const parCorridor = new Map<string, Corridor>();
  for (const v of voyages) {
    const distance =
      v.kmDepart != null && v.kmArrivee != null && v.kmArrivee > v.kmDepart
        ? v.kmArrivee - v.kmDepart
        : (v.distanceKm ?? 0);
    const libelle = v.aVide ? "Trajets à vide" : `${v.villeDepart} → ${v.villeArrivee}`;

    const courant = parCorridor.get(libelle) ?? {
      libelle,
      nbVoyages: 0,
      recetteGnf: 0,
      margeGnf: 0,
      km: 0,
    };
    courant.nbVoyages += 1;
    courant.recetteGnf += n(v.recetteGnf);
    courant.km += distance;
    parCorridor.set(libelle, courant);
  }

  // Comparer des corridors au coût *complet* fausse la lecture : l'amortissement
  // et les réparations d'un camion à l'arrêt seraient reportés sur les trajets
  // qui ont roulé, rendant tout déficitaire. On retient donc le coût
  // kilométrique *variable* — ce que le trajet a réellement consommé.
  const coutsVariablesGnf = somme("gasoilGnf") + somme("autresDepensesGnf") + somme("remunerationGnf");
  const coutVariableKm = coutParKm(coutsVariablesGnf, km);
  const coutMoyenKm = coutParKm(coutsGnf, km);

  for (const corridor of parCorridor.values()) {
    corridor.margeGnf = corridor.recetteGnf - corridor.km * coutVariableKm;
  }

  return {
    periode,
    camions,
    serie,
    coutKm: coutMoyenKm,
    coutVariableKm,
    recetteKm: recetteParKm(recetteGnf, km),
    margeKm: margeParKm(margeGnf, km),
    tauxUtilisationPct: tauxUtilisation(joursRoulage, joursDisponibles),
    tauxAVidePct: tauxAVide(kmAVide, km),
    ratioCarburantPct: ratioCarburantRecette(somme("gasoilGnf"), recetteGnf),
    joursRoulage,
    joursDisponibles,
    postes,
    coutsTotalGnf: coutsGnf,
    corridors: [...parCorridor.values()].sort((a, b) => b.margeGnf - a.margeGnf),
  };
}
