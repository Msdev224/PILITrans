import { cache } from "react";

import type { SeveriteAlerte, TypeAlerte } from "@prisma/client";

import { conformiteFroid, joursEntre, soldeCaisse } from "@/lib/calculs";
import { dossiersIncomplets, vueDossiers } from "@/lib/donnees/dossiers";
import { comparerExploitation } from "@/lib/donnees/exploitation";
import { moisCourant } from "@/lib/periode";
import { INCLURE_LIGNES, lignesEnEcart, vueLignes } from "@/lib/donnees/marchandises";
import { tonnageTotal } from "@/lib/unites";
import { tronconsDesVoyages } from "@/lib/donnees/carburant";
import { prisma } from "@/lib/prisma";
import { debutDeJour, formatDecimal, formatGnf, formatNombre, n, nOuNull } from "@/lib/utils";

/**
 * Une alerte telle qu'affichée. Certaines sont stockées en base (table
 * `Alerte`, suivi lu/résolu), d'autres sont dérivées en direct des données
 * (facture échue, camion immobilisé, conso hors norme…) comme le prévoit
 * CLAUDE.md.
 */
/** Regroupement d'affichage, indépendant du type technique. */
export type CategorieAlerte = "document" | "finances" | "flotte" | "equipe";

export interface AlerteVue {
  id: string;
  type: TypeAlerte;
  severite: SeveriteAlerte;
  categorie: CategorieAlerte;
  titre: string;
  detail?: string;
  meta: string[];
  camionId?: string;
  /** Lien vers l'écran où traiter l'alerte. */
  lien?: string;
  /** Libellé de l'action proposée. */
  action?: string;
  /** `true` si l'alerte vient de la table `Alerte`, `false` si elle est dérivée. */
  persistee: boolean;
}

const ORDRE: Record<SeveriteAlerte, number> = { URGENT: 0, ATTENTION: 1, INFO: 2 };

const CATEGORIE_PAR_TYPE: Record<TypeAlerte, CategorieAlerte> = {
  ECHEANCE_DOC: "document",
  CARTE_BRUNE: "document",
  ENTRETIEN_DU: "flotte",
  RUPTURE_FROID: "flotte",
  CONSO_ANORMALE: "flotte",
  IMMOBILISATION: "flotte",
  CAISSE: "equipe",
  AUTRE: "finances",
};

const JOUR_MS = 86_400_000;
const joursRestants = (echeance: Date, aujourdhui: Date) =>
  Math.ceil((echeance.getTime() - aujourdhui.getTime()) / JOUR_MS);

/** Construit le fil d'alertes complet, trié par gravité. */
async function alertesBrut(aujourdhui: Date = new Date()): Promise<AlerteVue[]> {
  // Les durées affichées se comptent en jours pleins (voir `debutDeJour`).
  const ceJour = debutDeJour(aujourdhui);

  const parametres = await prisma.parametres.findFirst();
  const toleranceFroid = nOuNull(parametres?.toleranceFroid) ?? 1;
  const seuilConso = nOuNull(parametres?.seuilConsoAnormale);
  const rappelDefaut = parametres?.rappelEcheanceJours ?? 30;

  const [
    stockees,
    factures,
    camions,
    reparations,
    echeances,
    reclamations,
    voyages,
    releves,
    mouvements,
    chauffeurs,
    entretiens,
  ] = await Promise.all([
    prisma.alerte.findMany({ where: { resolue: false }, orderBy: { createdAt: "desc" } }),
    prisma.facture.findMany({ where: { statut: { not: "PAYEE" } }, include: { client: true } }),
    prisma.camion.findMany({ where: { actif: true } }),
    prisma.reparation.findMany({ where: { statut: { not: "TERMINEE" } }, include: { camion: true } }),
    prisma.echeance.findMany({ include: { camion: true } }),
    prisma.reclamation.findMany({ where: { statut: { in: ["OUVERTE", "EN_COURS"] } }, include: { client: true } }),
    prisma.voyage.findMany({ where: { statut: { notIn: ["TERMINE", "ANNULE"] } }, include: { camion: true } }),
    prisma.releveTemperature.findMany({ include: { voyage: { include: { camion: true } } } }),
    prisma.mouvementCaisse.findMany({ include: { chauffeur: true } }),
    prisma.chauffeur.findMany({ where: { actif: true } }),
    prisma.entretien.findMany({ include: { camion: true } }),
  ]);

  const liste: AlerteVue[] = [];

  // --- Alertes déjà enregistrées ---
  for (const a of stockees) {
    liste.push({
      id: a.id,
      type: a.type,
      severite: a.severite,
      categorie: CATEGORIE_PAR_TYPE[a.type],
      titre: a.message,
      meta: [],
      camionId: a.camionId ?? undefined,
      persistee: true,
    });
  }

  // --- Factures échues (créances en retard) ---
  for (const f of factures) {
    const echue = f.statut === "EN_RETARD" || (f.echeance != null && f.echeance < aujourdhui);
    if (!echue) continue;

    const reste = n(f.montantGnf) - n(f.montantPayeGnf);
    const retard = f.echeance ? joursEntre(f.echeance, ceJour) : 0;
    liste.push({
      id: `facture-${f.id}`,
      type: "AUTRE",
      severite: "URGENT",
      categorie: "finances",
      lien: "/factures?filtre=en-retard",
      action: "Relancer",
      titre: `Facture en retard — ${f.client.nom}`,
      detail: `${formatGnf(reste)} restant dû · échéance dépassée.`,
      meta: [f.numero, "Finances", retard > 0 ? `retard ${retard} j` : "échue"],
      persistee: false,
    });
  }

  // --- Camions immobilisés ---
  for (const r of reparations.filter((r) => r.statut === "EN_COURS" && r.immobiliseDu && !r.immobiliseAu)) {
    const jours = joursEntre(r.immobiliseDu!, ceJour);
    liste.push({
      id: `immobilisation-${r.id}`,
      type: "IMMOBILISATION",
      severite: jours >= 2 ? "URGENT" : "ATTENTION",
      categorie: "flotte",
      lien: `/camions/${r.camionId}`,
      action: "Voir la réparation",
      titre: `${r.camion.nom} immobilisé depuis ${jours} jour${jours > 1 ? "s" : ""}`,
      detail: `${r.description}${r.garage ? ` · ${r.garage}` : ""}`,
      meta: [r.camion.nom, "Immobilisation", formatGnf(n(r.coutTotalGnf))],
      camionId: r.camionId,
      persistee: false,
    });
  }

  // --- Échéances de documents (assurance, carte brune…) ---
  for (const e of echeances) {
    const restants = joursRestants(e.dateExpiration, ceJour);
    const seuil = e.rappelJours || rappelDefaut;
    if (restants > seuil) continue;

    const carteBrune = e.type === "CARTE_BRUNE_CEDEAO";
    liste.push({
      id: `echeance-${e.id}`,
      type: carteBrune ? "CARTE_BRUNE" : "ECHEANCE_DOC",
      severite: restants <= 7 ? "URGENT" : "ATTENTION",
      categorie: "document",
      lien: `/camions/${e.camionId}`,
      action: "Renouveler",
      titre:
        restants < 0
          ? `${LIBELLE_ECHEANCE[e.type]} — ${e.camion.nom} a expiré`
          : `${LIBELLE_ECHEANCE[e.type]} — ${e.camion.nom} expire dans ${restants} jour${restants > 1 ? "s" : ""}`,
      detail: carteBrune ? "Bloquant pour tout départ international." : undefined,
      meta: [e.camion.nom, "Document"],
      camionId: e.camionId,
      persistee: false,
    });
  }

  // --- Réclamations clients ouvertes ---
  for (const r of reclamations) {
    liste.push({
      id: `reclamation-${r.id}`,
      type: "AUTRE",
      severite: "ATTENTION",
      categorie: "finances",
      lien: "/reclamations",
      action: "Traiter",
      titre: `Réclamation ouverte — ${r.client.nom}`,
      detail: r.description,
      meta: ["Client", "Réclamation", LIBELLE_RECLAMATION[r.type]],
      persistee: false,
    });
  }

  // --- Chaîne du froid : rupture ou approche du seuil ---
  const froidParVoyage = new Map<string, { pire: "CONFORME" | "ALERTE" | "RUPTURE"; camion: string; camionId: string }>();
  for (const rel of releves) {
    if (!rel.voyage.camion.refrigere) continue; // pas de chaîne du froid sur un non-frigo

    const consigne = nOuNull(rel.consigne);
    const etat =
      consigne !== undefined ? conformiteFroid(n(rel.temperature), consigne, toleranceFroid) : rel.conformite;
    if (etat === "CONFORME") continue;

    const courant = froidParVoyage.get(rel.voyageId);
    if (!courant || (courant.pire === "ALERTE" && etat === "RUPTURE")) {
      froidParVoyage.set(rel.voyageId, {
        pire: etat,
        camion: rel.voyage.camion.nom,
        camionId: rel.voyage.camionId,
      });
    }
  }
  for (const [voyageId, etat] of froidParVoyage) {
    liste.push({
      id: `froid-${voyageId}`,
      type: "RUPTURE_FROID",
      severite: etat.pire === "RUPTURE" ? "URGENT" : "ATTENTION",
      categorie: "flotte",
      lien: `/camions/${etat.camionId}`,
      action: "Vérifier",
      titre:
        etat.pire === "RUPTURE"
          ? `Rupture de la chaîne du froid — ${etat.camion}`
          : `Température proche du seuil — ${etat.camion}`,
      detail: "Marchandise en risque — vérifier le groupe froid.",
      meta: [etat.camion, "Chaîne du froid"],
      camionId: etat.camionId,
      persistee: false,
    });
  }

  // --- Consommation anormale ---
  if (seuilConso !== undefined && seuilConso > 0) {
    const enCours = voyages.map((v) => v.id);
    const troncons = await tronconsDesVoyages(enCours);
    const camionParVoyage = new Map(voyages.map((v) => [v.id, v.camion]));

    for (const t of troncons.filter((t) => t.litresPer100km > seuilConso)) {
      const camion = camionParVoyage.get(t.voyageId);
      liste.push({
        id: `conso-${t.etapeId}`,
        type: "CONSO_ANORMALE",
        severite: "ATTENTION",
        categorie: "flotte",
        lien: `/voyages/${t.voyageId}`,
        action: "Analyser",
        titre: `Consommation anormale — ${camion?.nom ?? "camion"}`,
        detail: `${formatDecimal(t.litresPer100km)} L/100 km (seuil ${formatDecimal(seuilConso)}) — vérifier plein ou siphonnage.`,
        meta: [camion?.nom ?? "—", "Carburant", t.libelle],
        camionId: camion?.id,
        persistee: false,
      });
    }
  }

  // --- Attente de chargement qui s'éternise ---
  for (const v of voyages.filter((v) => v.statut === "EN_ATTENTE_CHARGEMENT" && v.dateArriveeChargement)) {
    const jours = joursEntre(v.dateArriveeChargement!, v.dateChargement ?? ceJour);
    if (jours < 2) continue;

    liste.push({
      id: `attente-${v.id}`,
      type: "AUTRE",
      severite: jours >= 4 ? "URGENT" : "ATTENTION",
      categorie: "flotte",
      lien: `/voyages/${v.id}`,
      action: "Voir la mission",
      titre: `Attente de chargement — ${v.villeDepart} → ${v.villeArrivee}`,
      detail: `${v.camion.nom} attend depuis ${jours} jours sur le point de chargement.`,
      meta: [v.camion.nom, "Voyage", v.reference],
      camionId: v.camionId,
      persistee: false,
    });
  }

  // --- Surcharge : chargement au-dessus de la charge utile ---
  /*
   * Signalée, jamais bloquée.
   *
   * Sur le terrain un porteur part régulièrement au-dessus de sa charge
   * utile ; refuser la saisie ferait sortir la mission de l'application. La
   * trace sert à discuter d'une amende, d'un pneu ou d'un pont cassé — pas à
   * empêcher le départ. Elle n'est levée que si la charge utile est connue et
   * que le chargement se totalise en tonnes.
   */
  const charges = await prisma.voyage.findMany({
    where: {
      statut: { notIn: ["ANNULE"] },
      camion: { capaciteTonnes: { not: null } },
      lignes: { some: {} },
    },
    include: { camion: true, lignes: INCLURE_LIGNES },
  });
  for (const v of charges) {
    const capacite = v.camion.capaciteTonnes != null ? Number(v.camion.capaciteTonnes) : null;
    if (capacite == null || capacite <= 0) continue;

    const lignes = vueLignes(v.lignes);
    // Ce qui pèse est ce qui est réellement monté : la quantité reçue au
    // chargement prime sur le prévu, qui n'est qu'une intention.
    const charge = tonnageTotal(
      lignes.map((l) => ({
        quantite: l.quantiteRecue ?? l.quantiteACharger,
        facteurTonne: l.facteurTonne,
      })),
    );
    // `null` quand une marchandise ne se convertit pas en tonnes : un total
    // mêlant cartons et palettes ne voudrait rien dire.
    if (charge == null || charge <= capacite) continue;

    const depassement = charge - capacite;
    const pct = (depassement / capacite) * 100;

    liste.push({
      id: `surcharge-${v.id}`,
      type: "AUTRE",
      severite: pct >= 20 ? "ATTENTION" : "INFO",
      categorie: "flotte",
      lien: `/voyages/${v.id}`,
      action: "Voir la mission",
      titre: `Surcharge — ${v.camion.nom}`,
      detail: `${formatDecimal(charge)} t chargées pour ${formatDecimal(capacite)} t de charge utile, soit ${formatDecimal(depassement)} t au-dessus (${formatDecimal(pct)} %).`,
      meta: [v.camion.nom, `${v.villeDepart} → ${v.villeArrivee}`, v.reference],
      camionId: v.camionId,
      persistee: false,
    });
  }

  // --- Écart entre quantité reçue et quantité livrée (perte / vol) ---
  // L'alerte est levée par marchandise, pas par voyage : sur un chargement
  // mixte, un total en tonnes et en sacs n'aurait aucun sens, et il faut
  // pouvoir dire QUELLE marchandise manque.
  const livraisons = await prisma.voyage.findMany({
    where: { lignes: { some: { quantiteRecue: { not: null }, quantiteLivree: { not: null } } } },
    include: { camion: true, lignes: INCLURE_LIGNES },
  });
  for (const v of livraisons) {
    for (const l of lignesEnEcart(vueLignes(v.lignes))) {
      const { manquant, pct } = l.ecart!;
      const base = Math.max((l.quantiteRecue ?? 0) - l.prelevementQuantite, 0);

      liste.push({
        id: `ecart-${l.id}`,
        type: "AUTRE",
        severite: pct >= 5 ? "URGENT" : "ATTENTION",
        categorie: "finances",
        lien: `/voyages/${v.id}`,
        action: "Voir la mission",
        titre: `Écart de livraison — ${l.designation}`,
        detail:
          // Ce que la douane a retenu n'est pas un manquant : le déduire évite
          // d'accuser le chauffeur d'un vol pour une retenue régulière.
          l.prelevementQuantite > 0
            ? `${formatDecimal(manquant)} ${l.symbole} manquants sur ${formatDecimal(base)} ${l.symbole} (${formatDecimal(pct)} %), après déduction de ${formatDecimal(l.prelevementQuantite)} ${l.symbole} prélevés en douane.`
            : `${formatDecimal(manquant)} ${l.symbole} manquants sur ${formatDecimal(base)} ${l.symbole} (${formatDecimal(pct)} %).`,
        meta: [v.camion.nom, `${v.villeDepart} → ${v.villeArrivee}`, v.reference],
        camionId: v.camionId,
        persistee: false,
      });
    }
  }

  // --- Dossiers de transport incomplets ---
  // Une pièce manquante ne se voit qu'en ouvrant l'écran Dossiers, voyage par
  // voyage. Un chargement bloqué au poste-frontière pour un document absent
  // coûte des jours d'immobilisation : l'information doit remonter d'elle-même.
  for (const d of dossiersIncomplets(await vueDossiers())) {
    const parties = [
      d.manquants > 0 ? `${d.manquants} pièce${d.manquants > 1 ? "s" : ""} manquante${d.manquants > 1 ? "s" : ""}` : null,
      d.expirent > 0 ? `${d.expirent} expirée${d.expirent > 1 ? "s" : ""} ou proche de l'échéance` : null,
    ].filter(Boolean);

    liste.push({
      id: `dossier-${d.voyageId}`,
      type: "ECHEANCE_DOC",
      // Un dossier incomplet sur un trajet international bloque au poste :
      // il ne se traite pas au même rythme qu'un trajet intérieur.
      severite: d.international && d.manquants > 0 ? "URGENT" : "ATTENTION",
      categorie: "document",
      lien: `/dossiers`,
      action: "Compléter le dossier",
      titre: `Dossier incomplet — ${d.trajet}`,
      detail: `${parties.join(" · ")} (${d.completPct} % complet).`,
      meta: [d.camionNom, d.international ? "International" : "National", d.reference],
      persistee: false,
    });
  }

  // --- Missions sans recette : à renseigner, pas des pertes ---
  //
  // Une mission terminée sans recette fait apparaître le camion déficitaire :
  // la paie du chauffeur pèse sans rien en face. C'est presque toujours un
  // oubli de saisie, pas une course à perte. On le dit plutôt que de laisser
  // douter des chiffres.
  const sansRecette = await prisma.voyage.findMany({
    where: {
      statut: { in: ["TERMINE", "EN_DECHARGEMENT", "ARRIVE_DESTINATION"] },
      recetteGnf: { lte: 0 },
      aVide: false,
    },
    include: { camion: { select: { nom: true } }, factures: { select: { numero: true } } },
  });
  for (const v of sansRecette) {
    const facturee = v.factures.length > 0;
    liste.push({
      id: `recette-${v.id}`,
      type: "AUTRE",
      severite: "ATTENTION",
      categorie: "finances",
      lien: `/voyages/${v.id}`,
      action: "Renseigner la recette",
      titre: `Recette non renseignée — ${v.villeDepart} → ${v.villeArrivee}`,
      detail: facturee
        ? `Facturée ${v.factures[0].numero}, mais la mission reste à 0 : la marge du camion est faussée.`
        : "La mission compte la paie du chauffeur sans recette en face : sa marge apparaît négative à tort.",
      meta: [v.camion.nom, "Recette", v.reference],
      camionId: v.camionId,
      persistee: false,
    });
  }

  // --- Facture et mission qui ne disent pas le même montant ---
  //
  // Une recette saisie en millions là où le champ attend des francs — 46,5 au
  // lieu de 50 000 000 — ne se voit nulle part : la facture reste juste, mais
  // la rentabilité du camion s'effondre sans raison apparente. Le rapprochement
  // est le seul moyen de rattraper l'erreur une fois la saisie oubliée.
  const facturees = await prisma.voyage.findMany({
    where: { statut: { not: "ANNULE" }, factures: { some: {} } },
    include: { camion: { select: { nom: true } }, factures: true },
  });
  for (const v of facturees) {
    const factureGnf = v.factures.reduce((t, f) => t + n(f.montantGnf), 0);
    const recetteGnf = n(v.recetteGnf);
    if (factureGnf <= 0) continue;

    const ecart = Math.abs(factureGnf - recetteGnf);
    // Une tolérance d'un pour cent absorbe les arrondis et les avoirs mineurs.
    if (ecart <= factureGnf * 0.01) continue;

    liste.push({
      id: `ecart-recette-${v.id}`,
      type: "AUTRE",
      severite: ecart > factureGnf * 0.5 ? "URGENT" : "ATTENTION",
      categorie: "finances",
      lien: `/voyages/${v.id}`,
      action: "Corriger la recette",
      titre: `Recette et facture divergent — ${v.villeDepart} → ${v.villeArrivee}`,
      detail: `Facturé ${formatNombre(factureGnf)} GNF, mission à ${formatNombre(recetteGnf)} GNF. La marge du camion est calculée sur la mission.`,
      meta: [v.camion.nom, "Recette", v.reference],
      camionId: v.camionId,
      persistee: false,
    });
  }

  // --- Missions terminées jamais facturées ---
  const nonFacturees = await prisma.voyage.findMany({
    where: { statut: "TERMINE", aVide: false, factures: { none: {} }, recetteGnf: { gt: 0 } },
    include: { camion: { select: { nom: true } } },
  });
  for (const v of nonFacturees) {
    liste.push({
      id: `afacturer-${v.id}`,
      type: "AUTRE",
      severite: "ATTENTION",
      categorie: "finances",
      lien: `/voyages/${v.id}`,
      action: "Facturer",
      titre: `Mission terminée non facturée — ${v.villeDepart} → ${v.villeArrivee}`,
      detail: `${formatNombre(n(v.recetteGnf))} GNF de recette sans facture émise.`,
      meta: [v.camion.nom, "Facturation", v.reference],
      camionId: v.camionId,
      persistee: false,
    });
  }

  // --- Marge d'exploitation dégradée ---
  //
  // Une marge qui plonge se voit rarement à temps : chaque poste pris isolément
  // paraît normal. La comparaison au mois précédent est ce qui la rend visible.
  const exploitation = await comparerExploitation(moisCourant(ceJour));
  const margeActuelle = exploitation.actuel.margePct;
  if (margeActuelle !== null) {
    const chute = exploitation.ecartMargePoints;
    if (margeActuelle < 0) {
      liste.push({
        id: "marge-negative",
        type: "AUTRE",
        severite: "URGENT",
        categorie: "finances",
        lien: "/exploitation",
        action: "Voir le compte de résultat",
        titre: `Marge d'exploitation négative — ${formatDecimal(margeActuelle)} %`,
        detail: `Les charges dépassent le chiffre d'affaires de ${formatNombre(Math.abs(exploitation.actuel.resultatGnf))} GNF ce mois.`,
        meta: ["Exploitation", exploitation.actuel.periode.libelle],
        persistee: false,
      });
    } else if (chute !== null && chute <= -10) {
      liste.push({
        id: "marge-chute",
        type: "AUTRE",
        severite: "ATTENTION",
        categorie: "finances",
        lien: "/exploitation",
        action: "Comprendre la baisse",
        titre: `Marge d'exploitation en baisse — ${formatDecimal(margeActuelle)} %`,
        detail: `${formatDecimal(Math.abs(chute))} points de moins qu'en ${exploitation.precedent.periode.libelle}.`,
        meta: ["Exploitation", exploitation.actuel.periode.libelle],
        persistee: false,
      });
    }
  }

  // --- Caisses chauffeurs non soldées ---
  for (const c of chauffeurs) {
    const solde = soldeCaisse(
      mouvements
        .filter((m) => m.chauffeurId === c.id)
        .map((m) => ({ type: m.type, montant: n(m.montant), devise: m.devise, montantGnf: n(m.montantGnf) })),
    );
    if (solde.consolideGnf <= 0) continue;

    const details = (["GNF", "XOF"] as const)
      .filter((d) => solde.parDevise[d] !== 0)
      .map((d) => `${formatNombre(solde.parDevise[d])} ${d === "XOF" ? "CFA" : "GNF"}`);

    liste.push({
      id: `caisse-${c.id}`,
      type: "CAISSE",
      severite: "INFO",
      categorie: "equipe",
      titre: `Caisse à justifier — ${c.nom}`,
      detail: `${details.join(" + ")} non soldés.`,
      meta: ["Chauffeur", "Caisse"],
      persistee: false,
    });
  }

  // --- Permis de conduire expirés ou proches ---
  for (const c of chauffeurs.filter((c) => c.permisExpire)) {
    const restants = joursRestants(c.permisExpire!, ceJour);
    if (restants > rappelDefaut) continue;

    liste.push({
      id: `permis-${c.id}`,
      type: "ECHEANCE_DOC",
      severite: restants <= 0 ? "URGENT" : "ATTENTION",
      categorie: "document",
      titre:
        restants <= 0
          ? `Permis expiré — ${c.nom}`
          : `Permis — ${c.nom} expire dans ${restants} jour${restants > 1 ? "s" : ""}`,
      meta: ["Chauffeur", "Document"],
      persistee: false,
    });
  }

  // --- Entretiens dus : au kilométrage, aux heures de groupe ou à la date ---
  for (const e of entretiens) {
    const echus: string[] = [];

    // Marge de 500 km / 50 h : prévenir AVANT l'échéance, pas après.
    if (e.prochainKm != null && e.camion.kilometrage >= e.prochainKm - 500) {
      const depasse = e.camion.kilometrage - e.prochainKm;
      echus.push(
        depasse >= 0
          ? `dépassé de ${formatNombre(depasse)} km`
          : `dans ${formatNombre(-depasse)} km`,
      );
    }
    if (e.prochainHeures != null && e.camion.heuresGroupeFroid >= e.prochainHeures - 50) {
      const depasse = e.camion.heuresGroupeFroid - e.prochainHeures;
      echus.push(depasse >= 0 ? `dépassé de ${depasse} h` : `dans ${-depasse} h`);
    }
    if (e.prochaineDate != null) {
      const restants = joursRestants(e.prochaineDate, ceJour);
      if (restants <= rappelDefaut) {
        echus.push(restants < 0 ? `échu depuis ${-restants} j` : `dans ${restants} j`);
      }
    }

    if (echus.length === 0) continue;

    // Dépassé = urgent ; simplement proche = à surveiller.
    const depasse =
      (e.prochainKm != null && e.camion.kilometrage >= e.prochainKm) ||
      (e.prochainHeures != null && e.camion.heuresGroupeFroid >= e.prochainHeures) ||
      (e.prochaineDate != null && e.prochaineDate < ceJour);

    liste.push({
      id: `entretien-${e.id}`,
      type: "ENTRETIEN_DU",
      severite: depasse ? "URGENT" : "ATTENTION",
      categorie: "flotte",
      lien: `/camions/${e.camionId}`,
      action: "Planifier",
      titre: `${LIBELLE_ENTRETIEN[e.type] ?? e.type} — ${e.camion.nom} ${depasse ? "dépassé" : "à prévoir"}`,
      detail: `Échéance ${echus.join(" · ")}.`,
      meta: [e.camion.nom, "Entretien"],
      camionId: e.camionId,
      persistee: false,
    });
  }

  // --- Camions marqués immobilisés sans réparation ouverte ---
  const camionsAvecReparation = new Set(reparations.map((r) => r.camionId));
  for (const c of camions.filter((c) => c.statut === "IMMOBILISE" && !camionsAvecReparation.has(c.id))) {
    liste.push({
      id: `arret-${c.id}`,
      type: "IMMOBILISATION",
      severite: "ATTENTION",
      categorie: "flotte",
      lien: `/camions/${c.id}`,
      action: "Ouvrir la fiche",
      titre: `${c.nom} immobilisé sans réparation enregistrée`,
      detail: "Aucune réparation ouverte pour ce camion — vérifier la saisie.",
      meta: [c.nom, "Flotte"],
      camionId: c.id,
      persistee: false,
    });
  }

  return liste.sort((a, b) => ORDRE[a.severite] - ORDRE[b.severite]);
}

export type FiltreAlerte = "toutes" | "urgentes" | "surveiller" | "document" | "finances" | "flotte";

export const FILTRES_ALERTE: { cle: FiltreAlerte; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "urgentes", libelle: "Urgentes" },
  { cle: "surveiller", libelle: "À surveiller" },
  { cle: "document", libelle: "Documents" },
  { cle: "finances", libelle: "Finances" },
  { cle: "flotte", libelle: "Flotte" },
];

export function estFiltreAlerte(valeur: string | undefined): valeur is FiltreAlerte {
  return FILTRES_ALERTE.some((f) => f.cle === valeur);
}

export function filtrerAlertes(liste: AlerteVue[], filtre: FiltreAlerte): AlerteVue[] {
  switch (filtre) {
    case "urgentes":
      return liste.filter((a) => a.severite === "URGENT");
    case "surveiller":
      return liste.filter((a) => a.severite === "ATTENTION");
    case "document":
    case "finances":
    case "flotte":
      return liste.filter((a) => a.categorie === filtre);
    default:
      return liste;
  }
}

export function compterParSeverite(liste: AlerteVue[]) {
  return {
    urgent: liste.filter((a) => a.severite === "URGENT").length,
    attention: liste.filter((a) => a.severite === "ATTENTION").length,
    info: liste.filter((a) => a.severite === "INFO").length,
    total: liste.length,
  };
}

const LIBELLE_ECHEANCE: Record<string, string> = {
  ASSURANCE: "Assurance",
  VISITE_TECHNIQUE: "Visite technique",
  VIGNETTE: "Vignette",
  AUTORISATION_TRANSPORT: "Autorisation de transport",
  CARTE_BRUNE_CEDEAO: "Carte brune CEDEAO",
  AUTRE: "Document",
};

const LIBELLE_ENTRETIEN: Record<string, string> = {
  VIDANGE_TRACTEUR: "Vidange tracteur",
  ENTRETIEN_GROUPE_FROID: "Entretien groupe froid",
  FREINS: "Freins",
  PNEUS: "Pneumatiques",
  AUTRE: "Entretien",
};

const LIBELLE_RECLAMATION: Record<string, string> = {
  QUANTITE: "Quantité contestée",
  QUALITE: "Qualité",
  RETARD: "Retard",
  RUPTURE_FROID: "Chaîne du froid",
  AUTRE: "Autre",
};

/**
 * Fil d'alertes, calculé une seule fois par rendu.
 *
 * `cache()` de React déduplique l'appel sur un même rendu : le layout et la
 * page qu'il enveloppe demandent tous deux ces données, et sans cela la
 * requête partait deux fois — coût doublé à chaque affichage.
 */
export const alertes = cache(alertesBrut);
