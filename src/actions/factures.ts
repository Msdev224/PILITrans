"use server";

import { Devise, StatutFacture } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { observerTaux } from "@/lib/donnees/taux";
import { exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/lib/journal";
import { refusMissionAnnulee } from "@/lib/mission-active";
import { prisma } from "@/lib/prisma";
import { formatNombre, n } from "@/lib/utils";
import { numeroLibre } from "@/lib/donnees/facturation-auto";
import { notifierFacture, notifierRelance } from "@/lib/sms/declencheurs";
import { caseACocher, dateBorneeOptionnelle, erreursFormulaire, nombreOptionnel, nombrePositif, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("facturation.ecrire");
}

const schemaFacture = z
  .object({
    clientId: z.string().min(1, "Client requis"),
    voyageId: texteOptionnel,
    montant: nombrePositif("Montant requis"),
  /** Ce que le client a déjà versé au moment d'émettre. */
  montantRecu: nombreOptionnel,
  /** Moyen du règlement reçu à l'émission, s'il y en a un. */
  moyenId: texteOptionnel,
    devise: z.nativeEnum(Devise),
    /** Équivalent GNF au taux réel — figé, jamais recalculé. */
    montantGnf: nombreOptionnel,
    /** Date portée sur le document. Par défaut : aujourd'hui. */
    dateEmission: dateBorneeOptionnelle,
    echeance: dateBorneeOptionnelle,
    marchandiseAssuree: caseACocher,
    /** %/mois, propre à chaque facture (cf. CLAUDE.md). */
    tauxPenaliteRetard: nombreOptionnel,
    afficherEquivalentCfa: caseACocher,
  })
  .refine((f) => f.devise === "GNF" || (f.montantGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF du montant en CFA",
    path: ["montantGnf"],
  });

export interface EtatFacture {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

/**
 * Numéro de facture : préfixe des Paramètres + année + rang.
 * Exemple : « FAC-2026-042 ».
 */


/**
 * Statut déduit de l'encaissement et de l'échéance — jamais saisi à la main :
 * il doit toujours refléter les montants réels.
 */
function statutDeduit(
  montantGnf: number,
  payeGnf: number,
  echeance: Date | null,
  aujourdhui = new Date(),
): StatutFacture {
  if (payeGnf >= montantGnf && montantGnf > 0) return "PAYEE";
  if (echeance && echeance < aujourdhui) return "EN_RETARD";
  if (payeGnf > 0) return "PARTIELLE";
  return "EMISE";
}

function rafraichir(voyageId?: string | null) {
  revalidatePath("/factures");
  revalidatePath("/clients");
  revalidatePath("/voyages");
  revalidatePath("/");
  if (voyageId) revalidatePath(`/voyages/${voyageId}`);
}

/**
 * Reporte le montant facturé sur la recette de la mission, si elle est vide.
 *
 * Facture et recette sont deux notions distinctes — l'une est ce qu'on réclame
 * au client, l'autre ce que la mission rapporte au camion — mais laisser la
 * seconde à zéro rend le véhicule artificiellement déficitaire : la paie du
 * chauffeur pèse sans rien en face. Une recette déjà saisie n'est jamais
 * écrasée : c'est le gérant qui sait.
 */
async function reporterRecetteSurVoyage(factureId: string) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    select: { voyageId: true, montant: true, devise: true, montantGnf: true },
  });
  if (!facture?.voyageId) return;

  const voyage = await prisma.voyage.findUnique({
    where: { id: facture.voyageId },
    select: { recetteGnf: true },
  });
  if (!voyage || Number(voyage.recetteGnf) > 0) return;

  await prisma.voyage.update({
    where: { id: facture.voyageId },
    data: {
      recette: facture.montant,
      devise: facture.devise,
      recetteGnf: facture.montantGnf,
    },
  });
  revalidatePath(`/voyages/${facture.voyageId}`);
  revalidatePath("/voyages");
  revalidatePath("/rentabilite");
}

export async function creerFacture(_etat: EtatFacture, donnees: FormData): Promise<EtatFacture> {
  await droitEcriture();

  const saisie = schemaFacture.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatFacture>(saisie.error, donnees);

  const parametres = await prisma.parametres.findFirst();
  const montantGnf =
    saisie.data.devise === "GNF" ? saisie.data.montant : (saisie.data.montantGnf ?? 0);

  // L'échéance se compte depuis la date d'émission, pas depuis l'instant de
  // la saisie : une facture établie le 3 et enregistrée le 10 reste due au
  // délai convenu à partir du 3.
  const dateEmission = saisie.data.dateEmission ?? new Date();
  const echeance =
    saisie.data.echeance ??
    new Date(dateEmission.getTime() + (parametres?.delaiPaiementJours ?? 14) * 86_400_000);

  // Facturer une mission annulée créerait une créance sur une course qui
  // n'a pas eu lieu.
  const refus = await refusMissionAnnulee(saisie.data.voyageId);
  if (refus) return { erreur: refus };

  const numero = await numeroLibre(parametres?.prefixeFacture ?? "FAC", echeance.getFullYear());

  const creee = await prisma.facture.create({
    data: {
      numero,
      clientId: saisie.data.clientId,
      voyageId: saisie.data.voyageId ?? null,
      montant: saisie.data.montant,
      devise: saisie.data.devise,
      montantGnf,
      dateEmission,
      echeance,
      statut: statutDeduit(montantGnf, 0, echeance),
      marchandiseAssuree: saisie.data.marchandiseAssuree,
      tauxPenaliteRetard: saisie.data.tauxPenaliteRetard ?? null,
      afficherEquivalentCfa: saisie.data.afficherEquivalentCfa,
    },
  });

  /*
   * Ce qui a déjà été encaissé au moment d'émettre.
   *
   * Une course se règle souvent en partie à la livraison. Sans cette saisie,
   * il fallait créer la facture puis rouvrir le règlement — et cette seconde
   * étape s'oubliait, laissant une créance qui n'existait pas.
   */
  const recu = saisie.data.montantRecu ?? 0;
  if (recu > 0) {
    const recuGnf =
      saisie.data.devise === "GNF" ? recu : Math.round(recu * (montantGnf / saisie.data.montant));

    // Encaisser plus que le montant convenu n'a pas de sens : on plafonne
    // plutôt que de refuser, la facture est déjà écrite.
    const plafonne = Math.min(recuGnf, montantGnf);

    await prisma.paiement.create({
      data: {
        factureId: creee.id,
        montant: saisie.data.devise === "GNF" ? plafonne : recu,
        devise: saisie.data.devise,
        montantGnf: plafonne,
        date: dateEmission,
        // Un règlement reçu à l'émission : le moyen se saisit sur le
        // formulaire de facture, sinon il reste à préciser.
        moyenId: saisie.data.moyenId || null,
        note: "Reçu à l'émission de la facture",
      },
    });
    await recalculerFacture(creee.id);

    await journaliser({
      action: "facture.paiement.enregistre",
      objet: "Facture",
      objetId: creee.id,
      libelle: `Règlement de ${formatNombre(plafonne)} GNF reçu à l'émission de ${numero}`,
      montantGnf: plafonne,
    });
  }

  await journaliser({
    action: "facture.emise",
    objet: "Facture",
    objetId: creee.id,
    libelle: `Facture ${numero} émise pour ${formatNombre(montantGnf)} GNF`,
    montantGnf,
  });

  // Le client reçoit sa facture et son lien de consultation.
  await reporterRecetteSurVoyage(creee.id);
  await notifierFacture(creee.id);

  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

export async function modifierFacture(
  id: string,
  _etat: EtatFacture,
  donnees: FormData,
): Promise<EtatFacture> {
  await droitEcriture();

  const saisie = schemaFacture.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatFacture>(saisie.error, donnees);

  const existante = await prisma.facture.findUnique({ where: { id } });
  if (!existante) throw new Error("Facture introuvable.");

  const montantGnf =
    saisie.data.devise === "GNF" ? saisie.data.montant : (saisie.data.montantGnf ?? 0);
  const dateEmission = saisie.data.dateEmission ?? existante.dateEmission;
  const echeance = saisie.data.echeance ?? existante.echeance;
  const paye = Number(existante.montantPayeGnf);

  await prisma.facture.update({
    where: { id },
    data: {
      clientId: saisie.data.clientId,
      voyageId: saisie.data.voyageId ?? null,
      montant: saisie.data.montant,
      devise: saisie.data.devise,
      montantGnf,
      dateEmission,
      echeance,
      // Le statut se recalcule : modifier le montant peut rendre une facture
      // payée à nouveau partielle.
      statut: statutDeduit(montantGnf, paye, echeance),
      marchandiseAssuree: saisie.data.marchandiseAssuree,
      tauxPenaliteRetard: saisie.data.tauxPenaliteRetard ?? null,
      afficherEquivalentCfa: saisie.data.afficherEquivalentCfa,
    },
  });

  /*
   * Modifier une facture déjà émise change un document parti chez le client.
   * Le montant avant et après est la première chose qu'on cherche quand un
   * client conteste ce qu'il a reçu.
   */
  await journaliser({
    action: "facture.modifiee",
    objet: "Facture",
    objetId: id,
    libelle:
      Number(existante.montantGnf) !== montantGnf
        ? `Facture ${existante.numero} : montant porté de ${formatNombre(Number(existante.montantGnf))} à ${formatNombre(montantGnf)} GNF`
        : `Facture ${existante.numero} modifiée`,
    montantGnf,
    avant: { montantGnf: Number(existante.montantGnf), echeance: existante.echeance },
    apres: { montantGnf, echeance },
  });

  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

const schemaPaiement = z
  .object({
    montant: nombrePositif("Montant du règlement requis"),
    devise: z.nativeEnum(Devise),
    /** Équivalent GNF figé au taux du jour du versement. */
    montantGnf: nombreOptionnel,
    date: dateBorneeOptionnelle,
    moyenId: texteOptionnel,
    reference: texteOptionnel,
  })
  .refine((p) => p.devise === "GNF" || (p.montantGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF du versement en CFA",
    path: ["montantGnf"],
  });

/**
 * Recalcule le cumul et le statut d'une facture depuis ses versements.
 * Le cumul reste stocké sur la facture car `creances()` et tous les écrans
 * s'y réfèrent ; il ne doit jamais diverger de la somme des paiements.
 */
async function recalculerFacture(factureId: string) {
  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { paiements: { orderBy: { date: "asc" } } },
  });
  if (!facture) throw new Error("Facture introuvable.");

  const montantGnf = Number(facture.montantGnf);
  const paye = facture.paiements.reduce((total, p) => total + Number(p.montantGnf), 0);
  const solde = paye >= montantGnf && montantGnf > 0;

  await prisma.facture.update({
    where: { id: factureId },
    data: {
      montantPayeGnf: paye,
      statut: statutDeduit(montantGnf, paye, facture.echeance),
      // La date de paiement marque le SOLDE, donc le dernier versement.
      datePaiement: solde ? facture.paiements[facture.paiements.length - 1].date : null,
    },
  });

  return { facture, paye, reste: Math.max(montantGnf - paye, 0) };
}

/** Enregistre un versement. Une facture peut en recevoir plusieurs. */
export async function enregistrerPaiement(
  factureId: string,
  _etat: EtatFacture,
  donnees: FormData,
): Promise<EtatFacture> {
  await droitEcriture();

  const saisie = schemaPaiement.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatFacture>(saisie.error, donnees);

  const facture = await prisma.facture.findUnique({
    where: { id: factureId },
    include: { paiements: true },
  });
  if (!facture) throw new Error("Facture introuvable.");

  const montantGnf =
    saisie.data.devise === "GNF" ? saisie.data.montant : (saisie.data.montantGnf ?? 0);

  const dejaPaye = facture.paiements.reduce((total, p) => total + Number(p.montantGnf), 0);
  const reste = Number(facture.montantGnf) - dejaPaye;

  if (montantGnf > reste + 1) {
    return {
      erreur: "Le versement dépasse le montant restant dû.",
      champs: { montant: `Reste à régler : ${formatNombre(reste)} GNF` },
      valeurs: { montant: String(saisie.data.montant) },
    };
  }

  if (saisie.data.devise !== "GNF") await observerTaux(saisie.data.montant, montantGnf);

  await prisma.paiement.create({
    data: {
      factureId,
      montant: saisie.data.montant,
      devise: saisie.data.devise,
      montantGnf,
      date: saisie.data.date ?? new Date(),
      moyenId: saisie.data.moyenId || null,
      reference: saisie.data.reference ?? null,
    },
  });

  await recalculerFacture(factureId);

  await journaliser({
    action: "facture.paiement.enregistre",
    objet: "Facture",
    objetId: factureId,
    libelle: `Règlement de ${formatNombre(montantGnf)} GNF sur ${facture.numero}`,
    montantGnf,
    apres: { moyenId: saisie.data.moyenId ?? null, reference: saisie.data.reference ?? null },
  });

  rafraichir(facture.voyageId);
  return { ok: true };
}

/** Annule un versement saisi par erreur — le cumul et le statut suivent. */
export async function supprimerPaiement(paiementId: string) {
  await droitEcriture();

  const paiement = await prisma.paiement.findUnique({
    where: { id: paiementId },
    select: {
      factureId: true,
      montantGnf: true,
      moyen: { select: { nom: true } },
      date: true,
      facture: { select: { voyageId: true, numero: true } },
    },
  });
  if (!paiement) throw new Error("Versement introuvable.");

  await prisma.paiement.delete({ where: { id: paiementId } });
  await recalculerFacture(paiement.factureId);

  /*
   * La suppression d'un encaissement est l'opération la plus sensible de
   * l'application : elle fait disparaître de l'argent reçu. Sans trace, elle
   * est indétectable.
   */
  await journaliser({
    action: "facture.paiement.supprime",
    objet: "Facture",
    objetId: paiement.factureId,
    libelle: `Versement de ${formatNombre(n(paiement.montantGnf))} GNF annulé sur ${paiement.facture.numero}`,
    montantGnf: n(paiement.montantGnf),
    avant: { moyen: paiement.moyen?.nom ?? null, date: paiement.date.toISOString() },
  });

  rafraichir(paiement.facture.voyageId);
}

export async function supprimerFacture(id: string) {
  await droitEcriture();

  const facture = await prisma.facture.findUnique({
    where: { id },
    select: {
      voyageId: true,
      numero: true,
      montantGnf: true,
      montantPayeGnf: true,
      _count: { select: { reclamations: true } },
    },
  });
  if (!facture) throw new Error("Facture introuvable.");

  // Une facture déjà encaissée ou contestée ne s'efface pas : elle fait partie
  // de la trésorerie constatée. Les versements partiraient en cascade.
  if (Number(facture.montantPayeGnf) > 0) {
    throw new Error("Cette facture a déjà été réglée en tout ou partie : elle ne peut pas être supprimée.");
  }
  if (facture._count.reclamations > 0) {
    throw new Error("Cette facture porte une réclamation : traite-la avant de supprimer.");
  }

  await prisma.facture.delete({ where: { id } });

  // Une facture supprimée laisse un trou dans la numérotation : sans trace,
  // ce trou est inexplicable devant un contrôle.
  await journaliser({
    action: "facture.supprimee",
    objet: "Facture",
    objetId: id,
    libelle: `Facture ${facture.numero} supprimée (jamais réglée)`,
    montantGnf: Number(facture.montantGnf),
  });

  rafraichir(facture.voyageId);
}

/**
 * Relance manuelle d'une facture échue par SMS.
 * Déclenchée depuis l'écran Factures : une relance s'envoie au bon moment,
 * pas automatiquement.
 */
export async function relancerParSms(factureId: string) {
  await droitEcriture();

  const facture = await prisma.facture.findUnique({ where: { id: factureId } });
  if (!facture) throw new Error("Facture introuvable.");

  const joursRetard = facture.echeance
    ? Math.max(0, Math.round((Date.now() - facture.echeance.getTime()) / 86_400_000))
    : 0;

  await notifierRelance(factureId, joursRetard);
  revalidatePath("/factures");
  revalidatePath("/parametres");
}
