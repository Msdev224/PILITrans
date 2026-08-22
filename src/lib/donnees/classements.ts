import "server-only";

import { cache } from "react";

import { kmVoyage, pnlFlotte, remunerationDuVoyage } from "@/lib/donnees/camions";
import { baseRepartition, coutCompletTrajet, quotePartTrajet } from "@/lib/donnees/repartition";
import { INCLURE_LIGNES } from "@/lib/donnees/marchandises";
import type { Periode } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import { n } from "@/lib/utils";

/**
 * Classements de rentabilité.
 *
 * Le but n'est pas de noter, mais de montrer où l'argent se gagne et où il se
 * perd — par camion, par trajet, par client, par chauffeur. Chaque ligne porte
 * ses composantes, jamais un score composite : un chiffre agrégé qu'on ne peut
 * pas décomposer ne se discute pas, il se subit.
 */

export interface LigneClassementCamion {
  id: string;
  nom: string;
  recetteGnf: number;
  chargesGnf: number;
  resultatGnf: number;
  margePct: number | null;
  km: number;
  coutKmGnf: number;
  revenuKmGnf: number;
  tauxAVidePct: number;
  nbVoyages: number;
  /** Charges sans recette : résultat incomplet, pas une perte. */
  recetteManquante: boolean;
}

export interface LigneClassementTrajet {
  id: string;
  reference: string;
  trajet: string;
  camion: string;
  client: string | null;
  dateDepart: Date;
  recetteGnf: number;
  coutsDirectsGnf: number;
  quotePartVehiculeGnf: number;
  margeReelleGnf: number;
  margeReellePct: number | null;
  km: number;
}

export interface LigneClassementClient {
  id: string;
  nom: string;
  nbMissions: number;
  chiffreAffairesGnf: number;
  coutsGnf: number;
  resultatGnf: number;
  margePct: number | null;
  km: number;
  revenuKmGnf: number;
}

export interface LigneClassementChauffeur {
  id: string;
  nom: string;
  nbVoyages: number;
  km: number;
  recetteGeneree: number;
  remunerationGnf: number;
  consoMoyenneL100: number | null;
  /** Écarts de livraison inexpliqués constatés sur ses missions. */
  nbEcarts: number;
}

export interface Classements {
  periode: Periode;
  camions: LigneClassementCamion[];
  trajets: LigneClassementTrajet[];
  clients: LigneClassementClient[];
  chauffeurs: LigneClassementChauffeur[];
}

const pourcent = (resultat: number, base: number) =>
  base > 0 ? Math.round((resultat / base) * 1000) / 10 : null;

async function classementsBruts(periode: Periode): Promise<Classements> {
  const flotte = await pnlFlotte(periode);

  const camions: LigneClassementCamion[] = flotte.map((p) => ({
    id: p.camion.id,
    nom: p.camion.nom,
    recetteGnf: p.recetteGnf,
    chargesGnf: p.couts,
    resultatGnf: p.margeExploitation,
    margePct: pourcent(p.margeExploitation, p.recetteGnf),
    km: p.km,
    coutKmGnf: p.coutKm,
    revenuKmGnf: p.recetteKm,
    tauxAVidePct: p.tauxAVidePct,
    nbVoyages: p.nbVoyages,
    recetteManquante: p.recetteManquante,
  }));

  // --- Trajets, avec la quote-part de leur camion ---
  //
  // Les dépenses sont chargées en une fois puis regroupées : une requête par
  // trajet ferait autant d'allers-retours vers la base, et chacun coûte des
  // dizaines de millisecondes en production.
  const depensesParVoyage = new Map<string, number>();
  for (const d of await prisma.depense.findMany({
    where: { voyageId: { not: null } },
    select: { voyageId: true, montantGnf: true },
  })) {
    if (!d.voyageId) continue;
    depensesParVoyage.set(d.voyageId, (depensesParVoyage.get(d.voyageId) ?? 0) + n(d.montantGnf));
  }

  const trajets: LigneClassementTrajet[] = [];
  for (const p of flotte) {
    const base = baseRepartition(p);
    for (const v of p.voyages) {
      const km = kmVoyage(v);
      // Charges propres au trajet : ses dépenses et la paie du chauffeur.
      const coutsDirects = (depensesParVoyage.get(v.id) ?? 0) + remunerationDuVoyage(v);
      const complet = coutCompletTrajet(
        n(v.recetteGnf),
        coutsDirects,
        quotePartTrajet(base, km),
        km,
      );

      trajets.push({
        id: v.id,
        reference: v.reference,
        trajet: `${v.villeDepart} → ${v.villeArrivee}`,
        camion: p.camion.nom,
        client: null,
        dateDepart: v.dateDepart,
        recetteGnf: complet.recetteGnf,
        coutsDirectsGnf: complet.coutsDirectsGnf,
        quotePartVehiculeGnf: complet.quotePartVehiculeGnf,
        margeReelleGnf: complet.margeReelleGnf,
        margeReellePct: complet.margeReellePct,
        km,
      });
    }
  }
  trajets.sort((a, b) => b.margeReelleGnf - a.margeReelleGnf);

  // --- Clients ---
  const voyagesClients = await prisma.voyage.findMany({
    where: { statut: { not: "ANNULE" }, dateDepart: { gte: periode.debut, lt: periode.fin } },
    include: {
      client: { select: { id: true, nom: true } },
      chauffeur: true,
      depenses: { select: { montantGnf: true } },
      lignes: INCLURE_LIGNES,
    },
  });

  const parClient = new Map<string, LigneClassementClient>();
  for (const v of voyagesClients) {
    if (!v.client) continue;
    const km = kmVoyage(v);
    const couts = v.depenses.reduce((t, d) => t + n(d.montantGnf), 0) + remunerationDuVoyage(v);
    const c = parClient.get(v.client.id) ?? {
      id: v.client.id,
      nom: v.client.nom,
      nbMissions: 0,
      chiffreAffairesGnf: 0,
      coutsGnf: 0,
      resultatGnf: 0,
      margePct: null,
      km: 0,
      revenuKmGnf: 0,
    };
    c.nbMissions += 1;
    c.chiffreAffairesGnf += n(v.recetteGnf);
    c.coutsGnf += couts;
    c.km += km;
    parClient.set(v.client.id, c);
  }
  const clients = [...parClient.values()].map((c) => ({
    ...c,
    resultatGnf: c.chiffreAffairesGnf - c.coutsGnf,
    margePct: pourcent(c.chiffreAffairesGnf - c.coutsGnf, c.chiffreAffairesGnf),
    revenuKmGnf: c.km > 0 ? Math.round(c.chiffreAffairesGnf / c.km) : 0,
  }));
  clients.sort((a, b) => b.resultatGnf - a.resultatGnf);

  // --- Chauffeurs ---
  const parChauffeur = new Map<string, LigneClassementChauffeur>();
  for (const v of voyagesClients) {
    const c = parChauffeur.get(v.chauffeurId) ?? {
      id: v.chauffeurId,
      nom: v.chauffeur.nom,
      nbVoyages: 0,
      km: 0,
      recetteGeneree: 0,
      remunerationGnf: 0,
      consoMoyenneL100: null,
      nbEcarts: 0,
    };
    c.nbVoyages += 1;
    c.km += kmVoyage(v);
    c.recetteGeneree += n(v.recetteGnf);
    c.remunerationGnf += remunerationDuVoyage(v);
    // Un manquant inexpliqué se compte, il ne se note pas.
    for (const l of v.lignes) {
      const recue = l.quantiteRecue != null ? Number(l.quantiteRecue) : null;
      const livree = l.quantiteLivree != null ? Number(l.quantiteLivree) : null;
      const preleve = l.prelevements.reduce((t, p) => t + Number(p.quantite), 0);
      if (recue !== null && livree !== null && Math.max(recue - preleve, 0) - livree > 0) {
        c.nbEcarts += 1;
      }
    }
    parChauffeur.set(v.chauffeurId, c);
  }
  const chauffeurs = [...parChauffeur.values()].sort((a, b) => b.recetteGeneree - a.recetteGeneree);

  return { periode, camions, trajets, clients, chauffeurs };
}

export const classements = cache(classementsBruts);
