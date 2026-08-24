import type { Camion, Chauffeur, Client, Facture, Paiement, Parametres, Voyage } from "@prisma/client";

import { creances } from "@/lib/calculs";
import { dansPeriode, type Periode } from "@/lib/periode";
import { INCLURE_LIGNES, vueLignes } from "@/lib/donnees/marchandises";
import { prisma } from "@/lib/prisma";
import { debutDeJour, n } from "@/lib/utils";

export interface VersementVue {
  id: string;
  montant: number;
  devise: "GNF" | "XOF";
  montantGnf: number;
  date: string;
  moyen: string | null;
  reference: string | null;
}

export interface LigneFacture {
  facture: Facture & { client: Client; voyage: Voyage | null; paiements?: PaiementAvecMoyen[] };
  /** Échéancier aplati — les Decimal ne traversent pas vers le client. */
  versements: VersementVue[];
  montantGnf: number;
  payeGnf: number;
  resteGnf: number;
  /** Jours de retard (0 si dans les temps ou réglée). */
  joursRetard: number;
  /** Pénalité théorique au taux propre à la facture, `null` si non applicable. */
  penaliteGnf: number | null;
}

export type FiltreFacture = "toutes" | "emises" | "payees" | "en-retard" | "partielles";

export const FILTRES_FACTURE: { cle: FiltreFacture; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "emises", libelle: "Émises" },
  { cle: "payees", libelle: "Payées" },
  { cle: "en-retard", libelle: "En retard" },
  { cle: "partielles", libelle: "Partielles" },
];

export function estFiltreFacture(valeur: string | undefined): valeur is FiltreFacture {
  return FILTRES_FACTURE.some((f) => f.cle === valeur);
}

export interface StatsFactures {
  encoursGnf: number;
  enRetardGnf: number;
  encaisseGnf: number;
  nbOuvertes: number;
  nbEnRetard: number;
  encaisseMoisGnf: number;
  nbPayeesMois: number;
}

export interface VueFactures {
  lignes: LigneFacture[];
  stats: StatsFactures;
  total: number;
}

/**
 * Un versement, avec le libellé de son moyen de paiement.
 *
 * Le moyen est devenu une table tenue par l'exploitation : la relation est
 * chargée par la requête, et vaut `null` sur une écriture dérivée qui n'en
 * déclare aucun.
 */
export type PaiementAvecMoyen = Paiement & { moyen: { nom: string } | null };

const JOUR_MS = 86_400_000;

/** Le calcul ne dépend que de la facture : le typage du voyage reste libre. */
function construireLigne<T extends LigneFacture["facture"]>(
  facture: T,
  ceJour: Date,
): Omit<LigneFacture, "facture"> & { facture: T } {
  const montantGnf = n(facture.montantGnf);
  const payeGnf = n(facture.montantPayeGnf);
  const resteGnf = Math.max(montantGnf - payeGnf, 0);

  const echue = facture.echeance != null && facture.echeance < ceJour && resteGnf > 0;
  const joursRetard = echue
    ? Math.max(0, Math.round((ceJour.getTime() - facture.echeance!.getTime()) / JOUR_MS))
    : 0;

  // Le taux de pénalité est mensuel et propre à chaque facture (CLAUDE.md).
  const taux = facture.tauxPenaliteRetard != null ? n(facture.tauxPenaliteRetard) : null;
  const penaliteGnf =
    taux != null && joursRetard > 0
      ? Math.round((resteGnf * (taux / 100) * joursRetard) / 30)
      : null;

  const versements: VersementVue[] = (facture.paiements ?? []).map((p) => ({
    id: p.id,
    montant: n(p.montant),
    devise: p.devise,
    montantGnf: n(p.montantGnf),
    date: p.date.toISOString(),
    moyen: p.moyen?.nom ?? null,
    reference: p.reference,
  }));

  return { facture, versements, montantGnf, payeGnf, resteGnf, joursRetard, penaliteGnf };
}

function appliquerFiltre(lignes: LigneFacture[], filtre: FiltreFacture): LigneFacture[] {
  switch (filtre) {
    case "emises":
      return lignes.filter((l) => l.facture.statut === "EMISE");
    case "payees":
      return lignes.filter((l) => l.facture.statut === "PAYEE");
    case "en-retard":
      return lignes.filter((l) => l.facture.statut === "EN_RETARD" || l.joursRetard > 0);
    case "partielles":
      return lignes.filter((l) => l.facture.statut === "PARTIELLE");
    default:
      return lignes;
  }
}

/** Liste des factures avec l'état des créances, calculé par `creances()`. */
export async function vueFactures(
  periode: Periode,
  options: { filtre?: FiltreFacture; recherche?: string; aujourdhui?: Date } = {},
): Promise<VueFactures> {
  const { filtre = "toutes", recherche = "", aujourdhui = new Date() } = options;
  const ceJour = debutDeJour(aujourdhui);

  const factures = await prisma.facture.findMany({
    include: {
      client: true,
      voyage: true,
      paiements: { orderBy: { date: "asc" }, include: { moyen: { select: { nom: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const toutes = factures.map((f) => construireLigne(f, ceJour));

  const situation = creances(
    factures.map((f) => ({
      montantGnf: n(f.montantGnf),
      montantPayeGnf: n(f.montantPayeGnf),
      statut: f.statut,
      echeance: f.echeance ?? undefined,
    })),
    aujourdhui,
  );

  const payeesDuMois = toutes.filter(
    (l) => l.facture.datePaiement != null && dansPeriode(l.facture.datePaiement, periode),
  );

  const stats: StatsFactures = {
    encoursGnf: situation.encours,
    enRetardGnf: situation.enRetard,
    encaisseGnf: situation.encaisse,
    nbOuvertes: toutes.filter((l) => l.facture.statut !== "PAYEE").length,
    nbEnRetard: toutes.filter((l) => l.joursRetard > 0).length,
    encaisseMoisGnf: payeesDuMois.reduce((total, l) => total + l.payeGnf, 0),
    nbPayeesMois: payeesDuMois.length,
  };

  let lignes = appliquerFiltre(toutes, filtre);

  const terme = recherche.trim().toLowerCase();
  if (terme) {
    lignes = lignes.filter((l) =>
      [
        l.facture.numero,
        l.facture.client.nom,
        l.facture.voyage?.villeDepart,
        l.facture.voyage?.villeArrivee,
        l.facture.voyage?.reference,
      ]
        .filter(Boolean)
        .some((champ) => champ!.toLowerCase().includes(terme)),
    );
  }

  return { lignes, stats, total: toutes.length };
}

/** Facture enrichie du camion : l'impression a besoin du groupe froid. */
export type FactureImprimable = Facture & {
  client: Client;
  /** Règlements reçus, repris sur le document avec leur moyen. */
  paiements: PaiementAvecMoyen[];
  voyage:
    | (Voyage & {
        camion: Camion;
        chauffeur: Chauffeur;
        paysDepart: { nom: string; code: string } | null;
        paysArrivee: { nom: string; code: string } | null;
        lignes: Parameters<typeof vueLignes>[0];
      })
    | null;
};

export interface FicheFacture {
  ligne: Omit<LigneFacture, "facture"> & { facture: FactureImprimable };
  parametres: Parametres | null;
}

/** Facture complète pour l'impression (gabarit `docs/facture-modele.html`). */
export async function ficheFacture(
  id: string,
  aujourdhui: Date = new Date(),
): Promise<FicheFacture | null> {
  const facture = await prisma.facture.findUnique({
    where: { id },
    include: {
      client: true,
      voyage: {
        include: {
          camion: true,
          chauffeur: true,
          lignes: INCLURE_LIGNES,
          paysDepart: { select: { nom: true, code: true } },
          paysArrivee: { select: { nom: true, code: true } },
        },
      },
      paiements: { orderBy: { date: "asc" }, include: { moyen: { select: { nom: true } } } },
    },
  });
  if (!facture) return null;

  const parametres = await prisma.parametres.findFirst();
  return { ligne: construireLigne(facture, debutDeJour(aujourdhui)), parametres };
}
