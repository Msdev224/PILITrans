import { cache } from "react";

import { creances, ratioCarburantRecette, soldeCaisse, tauxAVide } from "@/lib/calculs";
import { alertes, compterParSeverite, type AlerteVue } from "@/lib/donnees/alertes";
import { pnlFlotte, type PnlCamion } from "@/lib/donnees/camions";
import { moisCourant, moisPrecedent, variation, type Periode } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { LIBELLE_STATUT_VOYAGE, n } from "@/lib/utils";

export interface SoldeChauffeur {
  chauffeurId: string;
  nom: string;
  situation: string;
  soldeGnf: number;
  soldeXof: number;
  consolideGnf: number;
}

export interface EtatParc {
  total: number;
  enRoute: number;
  immobilises: number;
  disponibles: number;
}

export interface ContexteCamion {
  temperature: number | null;
  destination: string | null;
  /** Libellé de l'état du voyage en cours (`null` si le camion ne roule pas). */
  statutVoyage: string | null;
  /** Message d'alerte le plus grave concernant ce camion, s'il y en a un. */
  signal: string | null;
}

export interface TableauDeBord {
  periode: Periode;
  camions: PnlCamion[];
  contexteCamions: Record<string, ContexteCamion>;
  parc: EtatParc;

  recetteGnf: number;
  /** Recette − charges d'exploitation. Le prix d'achat n'y entre pas. */
  margeExploitationGnf: number;
  coutsGnf: number;
  carburantGnf: number;
  ratioCarburantPct: number;
  tauxAVidePct: number;

  variationRecettePct: number | null;
  variationMargePct: number | null;
  margeMoisPrecedentGnf: number;

  creances: { encours: number; enRetard: number; encaisse: number };
  alertes: AlerteVue[];
  compteurAlertes: ReturnType<typeof compterParSeverite>;
  caisses: SoldeChauffeur[];
  tauxReferenceXof: number | null;
}

const STATUTS_EN_ROUTE = ["EN_ATTENTE_CHARGEMENT", "EN_COURS", "ARRIVE_DESTINATION", "EN_DECHARGEMENT"];

/** Tout ce qu'affiche le tableau de bord, calculé sur les données réelles. */
async function tableauDeBordBrut(aujourdhui: Date = new Date()): Promise<TableauDeBord> {
  const periode = moisCourant(aujourdhui);
  const precedente = moisPrecedent(periode);

  const [camions, camionsMoisPrecedent, factures, chauffeurs, mouvements, parametres, filAlertes, voyagesEnCours] =
    await Promise.all([
      pnlFlotte(periode),
      pnlFlotte(precedente),
      prisma.facture.findMany(),
      prisma.chauffeur.findMany({ where: { actif: true }, orderBy: { nom: "asc" } }),
      prisma.mouvementCaisse.findMany(),
      prisma.parametres.findFirst(),
      alertes(aujourdhui),
      prisma.voyage.findMany({
        where: { statut: { in: STATUTS_EN_ROUTE as never[] } },
        select: {
          id: true,
          camionId: true,
          villeArrivee: true,
          statut: true,
          relevesTemp: { orderBy: { releveLe: "desc" }, take: 1, select: { temperature: true } },
        },
        orderBy: { dateDepart: "desc" },
      }),
    ]);

  // Contexte d'affichage des cartes camion : mission en cours, dernière
  // température relevée et alerte la plus grave.
  const contexteCamions: Record<string, ContexteCamion> = {};
  for (const p of camions) {
    const enMission = voyagesEnCours.find((v) => v.camionId === p.camion.id);
    const alerteCamion =
      filAlertes.find((a) => a.camionId === p.camion.id && a.severite === "URGENT") ??
      filAlertes.find((a) => a.camionId === p.camion.id);

    contexteCamions[p.camion.id] = {
      temperature: enMission?.relevesTemp[0] ? n(enMission.relevesTemp[0].temperature) : null,
      destination: enMission?.villeArrivee ?? null,
      statutVoyage: enMission ? LIBELLE_STATUT_VOYAGE[enMission.statut] : null,
      signal: alerteCamion ? [alerteCamion.titre, alerteCamion.detail].filter(Boolean).join(" — ") : null,
    };
  }

  const somme = (liste: PnlCamion[], champ: keyof PnlCamion) =>
    liste.reduce((total, p) => total + (p[champ] as number), 0);

  const recetteGnf = somme(camions, "recetteGnf");
  const margeExploitationGnf = somme(camions, "margeExploitation");
  const carburantGnf = somme(camions, "gasoilGnf");
  const km = somme(camions, "km");
  const kmAVide = somme(camions, "kmAVide");

  // `camion.statut` est désormais tenu à jour par `synchroniserCamion` :
  // il est la seule source de vérité, plus besoin de le recouper avec les
  // voyages en cours comme il fallait le faire quand il pouvait diverger.
  const parc: EtatParc = {
    total: camions.length,
    enRoute: camions.filter((p) => p.camion.statut === "EN_VOYAGE").length,
    immobilises: camions.filter((p) => p.camion.statut === "IMMOBILISE").length,
    disponibles: camions.filter((p) => p.camion.statut === "DISPONIBLE").length,
  };

  const caisses: SoldeChauffeur[] = chauffeurs
    .map((c) => {
      const solde = soldeCaisse(
        mouvements
          .filter((m) => m.chauffeurId === c.id)
          .map((m) => ({ type: m.type, montant: n(m.montant), devise: m.devise, montantGnf: n(m.montantGnf) })),
      );
      const enRoute = voyagesEnCours.length > 0;
      return {
        chauffeurId: c.id,
        nom: c.nom,
        situation: solde.consolideGnf > 0 ? "Reliquat à justifier" : enRoute ? "En mission" : "Caisse soldée",
        soldeGnf: solde.parDevise.GNF,
        soldeXof: solde.parDevise.XOF,
        consolideGnf: solde.consolideGnf,
      };
    })
    .filter((c) => c.consolideGnf !== 0 || c.soldeXof !== 0)
    .sort((a, b) => b.consolideGnf - a.consolideGnf);

  const margeMoisPrecedentGnf = somme(camionsMoisPrecedent, "margeExploitation");

  return {
    periode,
    camions,
    contexteCamions,
    parc,
    recetteGnf,
    margeExploitationGnf,
    coutsGnf: somme(camions, "couts"),
    carburantGnf,
    ratioCarburantPct: ratioCarburantRecette(carburantGnf, recetteGnf),
    tauxAVidePct: tauxAVide(kmAVide, km),
    variationRecettePct: variation(recetteGnf, somme(camionsMoisPrecedent, "recetteGnf")),
    variationMargePct: variation(margeExploitationGnf, margeMoisPrecedentGnf),
    margeMoisPrecedentGnf,
    creances: creances(
      factures.map((f) => ({
        montantGnf: n(f.montantGnf),
        totalTtcGnf: n(f.totalTtcGnf),
        montantPayeGnf: n(f.montantPayeGnf),
        statut: f.statut,
        echeance: f.echeance ?? undefined,
      })),
      aujourdhui,
    ),
    alertes: filAlertes,
    compteurAlertes: compterParSeverite(filAlertes),
    caisses,
    tauxReferenceXof: parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null,
  };
}

/** Résumé léger pour le pied du rail latéral (présent sur toutes les pages). */
async function resumeRailBrut(aujourdhui: Date = new Date()) {
  const [camions, factures] = await Promise.all([
    prisma.camion.findMany({ where: { actif: true }, select: { id: true, statut: true } }),
    prisma.facture.findMany({ select: { montantGnf: true, totalTtcGnf: true, montantPayeGnf: true, statut: true, echeance: true } }),
  ]);

  const enRoute = camions.filter((c) => c.statut === "EN_VOYAGE").length;
  const immobilises = camions.filter((c) => c.statut === "IMMOBILISE").length;
  const encours = creances(
    factures.map((f) => ({
      montantGnf: n(f.montantGnf),
      totalTtcGnf: n(f.totalTtcGnf),
      montantPayeGnf: n(f.montantPayeGnf),
      statut: f.statut,
      echeance: f.echeance ?? undefined,
    })),
    aujourdhui,
  ).encours;

  return { total: camions.length, enRoute, immobilises, encours };
}

/** Résumé du parc affiché dans le rail. Mémoïsé : voir `alertes()`. */
export const resumeRail = cache(resumeRailBrut);

/** Indicateurs du tableau de bord. Mémoïsé : voir `alertes()`. */
export const tableauDeBord = cache(tableauDeBordBrut);
