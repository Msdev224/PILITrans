"use server";

import { CategorieReparation, Devise, StatutReparation } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { synchroniserCamion } from "@/lib/donnees/synchronisation";
import { dateBorneeOptionnelle, erreursFormulaire, nombreOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("flotte.ecrire");
}

const schemaReparation = z
  .object({
    camionId: z.string().min(1),
    categorie: z.nativeEnum(CategorieReparation),
    description: z.string().trim().min(1, "Description requise"),
    garage: z.string().trim().optional(),
    coutPieces: nombreOptionnel,
    coutMainOeuvre: nombreOptionnel,
    devise: z.nativeEnum(Devise),
    /** Équivalent GNF saisi au taux réel — obligatoire hors GNF. */
    coutTotalGnf: nombreOptionnel,
    kilometrage: nombreOptionnel,
    heuresGroupe: nombreOptionnel,
    immobiliseDu: dateBorneeOptionnelle,
    immobiliseAu: dateBorneeOptionnelle,
    statut: z.nativeEnum(StatutReparation),
  })
  .refine(
    (r) =>
      r.devise === "GNF" ||
      !((r.coutPieces ?? 0) + (r.coutMainOeuvre ?? 0) > 0) ||
      (r.coutTotalGnf ?? 0) > 0,
    { message: "Saisir l'équivalent en GNF du coût en CFA", path: ["coutTotalGnf"] },
  )
  .refine((r) => r.immobiliseAu == null || r.immobiliseDu == null || r.immobiliseAu >= r.immobiliseDu, {
    message: "La fin d'immobilisation ne peut pas précéder son début",
    path: ["immobiliseAu"],
  })
  // Une réparation terminée ne peut pas laisser le camion immobilisé sans fin.
  .refine((r) => r.statut !== "TERMINEE" || r.immobiliseDu == null || r.immobiliseAu != null, {
    message: "Indiquer la fin d'immobilisation pour clore la réparation",
    path: ["immobiliseAu"],
  });

export interface EtatReparation {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}


function donneesReparation(saisie: z.infer<typeof schemaReparation>) {
  const pieces = saisie.coutPieces ?? 0;
  const mainOeuvre = saisie.coutMainOeuvre ?? 0;
  // En GNF, le total se déduit ; en devise, c'est l'équivalent réel saisi.
  const coutTotalGnf = saisie.devise === "GNF" ? pieces + mainOeuvre : (saisie.coutTotalGnf ?? 0);

  return {
    categorie: saisie.categorie,
    description: saisie.description,
    garage: saisie.garage || null,
    coutPieces: pieces,
    coutMainOeuvre: mainOeuvre,
    devise: saisie.devise,
    coutTotalGnf,
    kilometrage: saisie.kilometrage != null ? Math.round(saisie.kilometrage) : null,
    heuresGroupe: saisie.heuresGroupe != null ? Math.round(saisie.heuresGroupe) : null,
    immobiliseDu: saisie.immobiliseDu ?? null,
    immobiliseAu: saisie.immobiliseAu ?? null,
    statut: saisie.statut,
  };
}

async function rafraichirEtSynchroniser(camionId: string) {
  await synchroniserCamion(camionId);
  rafraichir(camionId);
}

function rafraichir(camionId: string) {
  revalidatePath(`/camions/${camionId}`);
  revalidatePath("/camions");
  revalidatePath("/");
}

export async function creerReparation(
  _etat: EtatReparation,
  donnees: FormData,
): Promise<EtatReparation> {
  await droitEcriture();

  const saisie = schemaReparation.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatReparation>(saisie.error, donnees);

  await prisma.reparation.create({
    data: { ...donneesReparation(saisie.data), camionId: saisie.data.camionId },
  });

  await rafraichirEtSynchroniser(saisie.data.camionId);
  return { ok: true };
}

export async function modifierReparation(
  id: string,
  _etat: EtatReparation,
  donnees: FormData,
): Promise<EtatReparation> {
  await droitEcriture();

  const saisie = schemaReparation.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatReparation>(saisie.error, donnees);

  await prisma.reparation.update({ where: { id }, data: donneesReparation(saisie.data) });
  await rafraichirEtSynchroniser(saisie.data.camionId);
  return { ok: true };
}

/** Clôture rapide depuis la liste : marque terminée et lève l'immobilisation. */
export async function cloreReparation(id: string) {
  await droitEcriture();

  const reparation = await prisma.reparation.findUnique({ where: { id } });
  if (!reparation) throw new Error("Réparation introuvable.");

  await prisma.reparation.update({
    where: { id },
    data: {
      statut: "TERMINEE",
      immobiliseAu: reparation.immobiliseDu && !reparation.immobiliseAu ? new Date() : reparation.immobiliseAu,
    },
  });

  await rafraichirEtSynchroniser(reparation.camionId);
}

export async function supprimerReparation(id: string) {
  await droitEcriture();

  const reparation = await prisma.reparation.findUnique({
    where: { id },
    select: { camionId: true },
  });
  if (!reparation) throw new Error("Réparation introuvable.");

  await prisma.reparation.delete({ where: { id } });
  await rafraichirEtSynchroniser(reparation.camionId);
}
