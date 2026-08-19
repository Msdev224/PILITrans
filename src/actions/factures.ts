"use server";

import { Devise, MoyenPaiement, StatutFacture } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { observerTaux } from "@/lib/donnees/taux";
import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { notifierFacture, notifierRelance } from "@/lib/sms/declencheurs";
import {
  caseACocher,
  dateOptionnelle,
  erreursFormulaire,
  nombreOptionnel,
  nombrePositif,
  texteOptionnel,
} from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("facturation.ecrire");
}

const schemaFacture = z
  .object({
    clientId: z.string().min(1, "Client requis"),
    voyageId: texteOptionnel,
    montant: nombrePositif("Montant requis"),
    devise: z.nativeEnum(Devise),
    /** Équivalent GNF au taux réel — figé, jamais recalculé. */
    montantGnf: nombreOptionnel,
    /** Date portée sur le document. Par défaut : aujourd'hui. */
    dateEmission: dateOptionnelle,
    echeance: dateOptionnelle,
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
async function numeroLibre(prefixe: string, annee: number) {
  const debut = `${prefixe}-${annee}`;
  const existantes = await prisma.facture.findMany({
    where: { numero: { startsWith: debut } },
    select: { numero: true },
  });

  const rangs = existantes
    .map((f) => Number.parseInt(f.numero.split("-")[2] ?? "", 10))
    .filter((r) => Number.isFinite(r));
  const rang = (rangs.length ? Math.max(...rangs) : 0) + 1;

  return `${debut}-${String(rang).padStart(3, "0")}`;
}

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

  // Le client reçoit sa facture et son lien de consultation.
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

  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

const schemaPaiement = z
  .object({
    montant: nombrePositif("Montant du règlement requis"),
    devise: z.nativeEnum(Devise),
    /** Équivalent GNF figé au taux du jour du versement. */
    montantGnf: nombreOptionnel,
    date: dateOptionnelle,
    moyen: z.nativeEnum(MoyenPaiement),
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
      champs: { montant: `Reste à régler : ${Math.round(reste)} GNF` },
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
      moyen: saisie.data.moyen,
      reference: saisie.data.reference ?? null,
    },
  });

  await recalculerFacture(factureId);
  rafraichir(facture.voyageId);
  return { ok: true };
}

/** Annule un versement saisi par erreur — le cumul et le statut suivent. */
export async function supprimerPaiement(paiementId: string) {
  await droitEcriture();

  const paiement = await prisma.paiement.findUnique({
    where: { id: paiementId },
    select: { factureId: true, facture: { select: { voyageId: true } } },
  });
  if (!paiement) throw new Error("Versement introuvable.");

  await prisma.paiement.delete({ where: { id: paiementId } });
  await recalculerFacture(paiement.factureId);
  rafraichir(paiement.facture.voyageId);
}

/** Raccourci « marquer payée » : solde le restant dû en une fois. */
export async function marquerPayee(id: string) {
  await droitEcriture();

  const facture = await prisma.facture.findUnique({ where: { id } });
  if (!facture) throw new Error("Facture introuvable.");

  const paiements = await prisma.paiement.findMany({ where: { factureId: id } });
  const dejaPaye = paiements.reduce((total, p) => total + Number(p.montantGnf), 0);
  const reste = Number(facture.montantGnf) - dejaPaye;

  // Solder crée un dernier versement : le total réglé doit toujours se lire
  // dans l'historique, jamais apparaître sans écriture correspondante.
  if (reste > 0) {
    await prisma.paiement.create({
      data: {
        factureId: id,
        montant: reste,
        devise: "GNF",
        montantGnf: reste,
        moyen: "AUTRE",
        note: "Solde enregistré depuis la liste des factures",
      },
    });
  }

  await recalculerFacture(id);
  rafraichir(facture.voyageId);
}

export async function supprimerFacture(id: string) {
  await droitEcriture();

  const facture = await prisma.facture.findUnique({
    where: { id },
    select: { voyageId: true, montantPayeGnf: true, _count: { select: { reclamations: true } } },
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
