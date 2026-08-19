import { cache } from "react";

import { conformiteFroid } from "@/lib/calculs";
import { INCLURE_LIGNES, vueLignes } from "@/lib/donnees/marchandises";
import { formatQuantite } from "@/lib/donnees/unites";
import { prisma } from "@/lib/prisma";
import { n, nOuNull } from "@/lib/utils";

/**
 * Complétude du dossier d'un voyage.
 *
 * Le schéma ne comporte aucun modèle de pièce jointe : impossible de suivre des
 * PDF téléversés sans inventer une table et un stockage de fichiers. Ce qui est
 * fait ici, c'est la **complétude dérivée** — chaque pièce est réputée présente
 * si la donnée correspondante existe déjà en base. C'est exploitable
 * immédiatement, et ça n'anticipe aucune décision d'infrastructure.
 */
export type EtatPiece = "fourni" | "manquant" | "expire" | "sans-objet";

export interface Piece {
  libelle: string;
  etat: EtatPiece;
  detail: string;
  /** Écran où produire la pièce manquante. */
  lien?: string;
}

export interface DossierVoyage {
  voyageId: string;
  reference: string;
  trajet: string;
  camionNom: string;
  international: boolean;
  dateDepart: Date;
  pieces: Piece[];
  /** Pièces réellement attendues — les « sans objet » sont exclues. */
  exigibles: number;
  fournis: number;
  manquants: number;
  expirent: number;
  completPct: number;
}

async function vueDossiersBrut(): Promise<DossierVoyage[]> {
  const [voyages, parametres] = await Promise.all([
    prisma.voyage.findMany({
      where: { statut: { not: "ANNULE" } },
      include: {
        camion: { include: { echeances: true } },
        factures: true,
        relevesTemp: true,
        lignes: INCLURE_LIGNES,
      },
      orderBy: { dateDepart: "desc" },
    }),
    prisma.parametres.findFirst(),
  ]);

  const tolerance = nOuNull(parametres?.toleranceFroid) ?? 1;

  return voyages.map((v) => {
    const international = v.paysDepart !== v.paysArrivee;
    const pieces: Piece[] = [];

    // --- Facture client : attendue dès qu'il y a une recette ---
    if (v.aVide) {
      pieces.push({
        libelle: "Facture client",
        etat: "sans-objet",
        detail: "Trajet à vide — rien à facturer.",
      });
    } else if (v.factures.length > 0) {
      const f = v.factures[0];
      pieces.push({
        libelle: "Facture client",
        etat: "fourni",
        detail: `${f.numero} · ${f.statut === "PAYEE" ? "payée" : "émise"}`,
        lien: "/factures",
      });
    } else {
      pieces.push({
        libelle: "Facture client",
        etat: "manquant",
        detail: "Non encore émise.",
        lien: "/voyages",
      });
    }

    // --- Chaîne du froid : uniquement sur un camion frigorifique ---
    if (!v.camion.refrigere) {
      pieces.push({
        libelle: "Certificat de chaîne du froid",
        etat: "sans-objet",
        detail: "Véhicule non frigorifique.",
      });
    } else if (v.relevesTemp.length === 0) {
      pieces.push({
        libelle: "Certificat de chaîne du froid",
        etat: "manquant",
        detail: "Aucun relevé de température.",
        lien: `/voyages/${v.id}`,
      });
    } else {
      const conformes = v.relevesTemp.filter((r) => {
        const consigne = nOuNull(r.consigne);
        return consigne === undefined
          ? r.conformite === "CONFORME"
          : conformiteFroid(n(r.temperature), consigne, tolerance) === "CONFORME";
      });
      const tousConformes = conformes.length === v.relevesTemp.length;
      pieces.push({
        libelle: "Certificat de chaîne du froid",
        etat: tousConformes ? "fourni" : "expire",
        detail: `${conformes.length} / ${v.relevesTemp.length} relevés conformes.`,
        lien: `/voyages/${v.id}`,
      });
    }

    // --- Quantités : la preuve de livraison ---
    const livrees = vueLignes(v.lignes).filter((l) => l.quantiteLivree != null);
    if (livrees.length > 0) {
      pieces.push({
        libelle: "Preuve de livraison (quantités)",
        etat: "fourni",
        detail: `${livrees.map((l) => `${l.designation} ${formatQuantite(l.quantiteLivree, l.symbole)}`).join(" · ")} livrés.`,
      });
    } else if (v.aVide) {
      pieces.push({
        libelle: "Preuve de livraison (quantités)",
        etat: "sans-objet",
        detail: "Trajet à vide.",
      });
    } else {
      pieces.push({
        libelle: "Preuve de livraison (quantités)",
        etat: "manquant",
        detail: "Quantité livrée non saisie.",
        lien: `/voyages/${v.id}`,
      });
    }

    // --- Carte brune CEDEAO : bloquante à l'international ---
    if (!international) {
      pieces.push({
        libelle: "Carte brune CEDEAO",
        etat: "sans-objet",
        detail: "Trajet national.",
      });
    } else {
      const carte = v.camion.echeances.find((e) => e.type === "CARTE_BRUNE_CEDEAO");
      if (!carte) {
        pieces.push({
          libelle: "Carte brune CEDEAO",
          etat: "manquant",
          detail: "Aucune carte brune enregistrée — bloquant au passage de frontière.",
          lien: "/echeances",
        });
      } else {
        // Valide à la DATE DU VOYAGE, pas aujourd'hui : un dossier passé reste
        // conforme même si le document a expiré depuis.
        const reference = v.dateArrivee ?? v.dateDepart;
        const valide = carte.dateExpiration >= reference;
        pieces.push({
          libelle: "Carte brune CEDEAO",
          etat: valide ? "fourni" : "expire",
          detail: valide
            ? `Valide jusqu'au ${carte.dateExpiration.toLocaleDateString("fr-FR")}.`
            : `Expirée le ${carte.dateExpiration.toLocaleDateString("fr-FR")}, avant ce trajet.`,
          lien: "/echeances",
        });
      }
    }

    // --- Assurance du véhicule ---
    const assurance = v.camion.echeances.find((e) => e.type === "ASSURANCE");
    if (!assurance) {
      pieces.push({
        libelle: "Assurance du véhicule",
        etat: "manquant",
        detail: "Aucune assurance enregistrée.",
        lien: "/echeances",
      });
    } else {
      const valide = assurance.dateExpiration >= (v.dateArrivee ?? v.dateDepart);
      pieces.push({
        libelle: "Assurance du véhicule",
        etat: valide ? "fourni" : "expire",
        detail: valide
          ? `Valide jusqu'au ${assurance.dateExpiration.toLocaleDateString("fr-FR")}.`
          : "Expirée à la date du trajet.",
        lien: "/echeances",
      });
    }

    // Les pièces sans objet ne comptent ni au numérateur ni au dénominateur :
    // un trajet national n'a pas à être pénalisé pour une carte brune.
    const attendues = pieces.filter((p) => p.etat !== "sans-objet");
    const fournis = attendues.filter((p) => p.etat === "fourni").length;
    const manquants = attendues.filter((p) => p.etat === "manquant").length;
    const expirent = attendues.filter((p) => p.etat === "expire").length;

    return {
      voyageId: v.id,
      reference: v.reference,
      trajet: `${v.villeDepart} → ${v.villeArrivee}`,
      camionNom: v.camion.nom,
      international,
      dateDepart: v.dateDepart,
      pieces,
      exigibles: attendues.length,
      fournis,
      manquants,
      expirent,
      completPct: attendues.length > 0 ? Math.round((fournis / attendues.length) * 100) : 100,
    };
  });
}

/** Voyages dont le dossier n'est pas complet — ceux qui demandent une action. */
export function dossiersIncomplets(dossiers: DossierVoyage[]) {
  return dossiers.filter((d) => d.manquants > 0 || d.expirent > 0);
}

/**
 * Dossiers de transport, calculés une seule fois par rendu.
 *
 * `cache()` de React déduplique l'appel sur un même rendu : le layout et la
 * page qu'il enveloppe demandent tous deux ces données, et sans cela la
 * requête partait deux fois — coût doublé à chaque affichage.
 */
export const vueDossiers = cache(vueDossiersBrut);
