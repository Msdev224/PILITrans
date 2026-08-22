"use server";

import { TypeEtape } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { synchroniserCamionDuVoyage } from "@/lib/donnees/synchronisation";
import { dateOptionnelle, erreursFormulaire, nombreOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("voyages.ecrire");
}

/** "" → undefined ; virgule décimale acceptée (saisie française). */
const schemaEtape = z
  .object({
    voyageId: z.string().min(1),
    type: z.nativeEnum(TypeEtape),
    villeDepart: z.string().trim().min(1, "Ville de départ requise"),
    villeArrivee: z.string().trim().min(1, "Ville d'arrivée requise"),
    /** Pays choisis dans la liste tenue par l'exploitation. */
    paysDepartId: texteOptionnel,
    paysArriveeId: texteOptionnel,
    kmDepart: nombreOptionnel,
    kmArrivee: nombreOptionnel,
    carburantRestantDepart: nombreOptionnel,
    carburantRestantArrivee: nombreOptionnel,
    motif: z.string().trim().optional(),
    departLe: dateOptionnelle,
    arriveeLe: dateOptionnelle,
    /** Ids des ravitaillements (dépenses gasoil) rattachés à ce tronçon. */
    ravitaillements: z.array(z.string()).default([]),
  })
  .refine((e) => e.kmArrivee == null || e.kmDepart == null || e.kmArrivee >= e.kmDepart, {
    message: "Le compteur d'arrivée ne peut pas être inférieur à celui du départ",
    path: ["kmArrivee"],
  })
  .refine((e) => e.arriveeLe == null || e.departLe == null || e.arriveeLe >= e.departLe, {
    message: "L'arrivée ne peut pas précéder le départ",
    path: ["arriveeLe"],
  });

export interface EtatEtape {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function lire(donnees: FormData) {
  const brut = Object.fromEntries(donnees) as Record<string, unknown>;
  // Les cases à cocher multiples arrivent en entrées répétées.
  brut.ravitaillements = donnees.getAll("ravitaillements").map(String);
  return brut;
}


function donneesEtape(saisie: z.infer<typeof schemaEtape>) {
  return {
    type: saisie.type,
    villeDepart: saisie.villeDepart,
    villeArrivee: saisie.villeArrivee,
    paysDepartId: saisie.paysDepartId || null,
    paysArriveeId: saisie.paysArriveeId || null,
    kmDepart: saisie.kmDepart != null ? Math.round(saisie.kmDepart) : null,
    kmArrivee: saisie.kmArrivee != null ? Math.round(saisie.kmArrivee) : null,
    carburantRestantDepart: saisie.carburantRestantDepart ?? null,
    carburantRestantArrivee: saisie.carburantRestantArrivee ?? null,
    motif: saisie.motif || null,
    departLe: saisie.departLe ?? null,
    arriveeLe: saisie.arriveeLe ?? null,
  };
}

function rafraichir(voyageId: string) {
  revalidatePath(`/voyages/${voyageId}`);
  revalidatePath("/voyages");
  revalidatePath("/camions");
  revalidatePath("/");
}

export async function creerEtape(_etat: EtatEtape, donnees: FormData): Promise<EtatEtape> {
  await droitEcriture();

  const saisie = schemaEtape.safeParse(lire(donnees));
  if (!saisie.success) return erreursFormulaire<EtatEtape>(saisie.error, donnees);

  // L'ordre suit la saisie : le tronçon s'ajoute en fin de trajet.
  const dernier = await prisma.etapeVoyage.findFirst({
    where: { voyageId: saisie.data.voyageId },
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });

  await prisma.etapeVoyage.create({
    data: {
      ...donneesEtape(saisie.data),
      voyageId: saisie.data.voyageId,
      ordre: (dernier?.ordre ?? 0) + 1,
      ravitaillements: { connect: saisie.data.ravitaillements.map((id) => ({ id })) },
    },
  });

  await synchroniserCamionDuVoyage(saisie.data.voyageId);
  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

export async function modifierEtape(id: string, _etat: EtatEtape, donnees: FormData): Promise<EtatEtape> {
  await droitEcriture();

  const saisie = schemaEtape.safeParse(lire(donnees));
  if (!saisie.success) return erreursFormulaire<EtatEtape>(saisie.error, donnees);

  await prisma.etapeVoyage.update({
    where: { id },
    data: {
      ...donneesEtape(saisie.data),
      // `set` remplace la liste : décocher un plein le détache réellement.
      ravitaillements: { set: saisie.data.ravitaillements.map((r) => ({ id: r })) },
    },
  });

  await synchroniserCamionDuVoyage(saisie.data.voyageId);
  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

export async function supprimerEtape(id: string) {
  await droitEcriture();

  const etape = await prisma.etapeVoyage.findUnique({ where: { id }, select: { voyageId: true } });
  if (!etape) throw new Error("Étape introuvable.");

  // Les ravitaillements sont détachés, jamais supprimés : ce sont des dépenses.
  await prisma.etapeVoyage.update({ where: { id }, data: { ravitaillements: { set: [] } } });
  await prisma.etapeVoyage.delete({ where: { id } });

  rafraichir(etape.voyageId);
}
