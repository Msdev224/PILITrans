"use server";

import { Devise, TypeEntretien } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { dateBorneeOptionnelle, erreursFormulaire, nombreOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("flotte.ecrire");
}

/**
 * Entretien préventif. Son échéance se suit selon la nature du véhicule :
 * au kilométrage pour le tracteur, aux heures pour le groupe froid, à la date
 * pour ce qui se périme. Les trois peuvent coexister.
 */
const schemaEntretien = z
  .object({
    camionId: z.string().min(1, "Camion requis"),
    type: z.nativeEnum(TypeEntretien),
    dateFait: dateBorneeOptionnelle,
    kmFait: nombreOptionnel,
    heuresFait: nombreOptionnel,
    prochainKm: nombreOptionnel,
    prochainHeures: nombreOptionnel,
    prochaineDate: dateBorneeOptionnelle,
    cout: nombreOptionnel,
    devise: z.nativeEnum(Devise),
    coutGnf: nombreOptionnel,
  })
  .refine((e) => e.devise === "GNF" || !((e.cout ?? 0) > 0) || (e.coutGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF du coût en CFA",
    path: ["coutGnf"],
  })
  // Une échéance qui précède l'entretien réalisé n'a aucun sens.
  .refine((e) => e.prochainKm == null || e.kmFait == null || e.prochainKm > e.kmFait, {
    message: "La prochaine échéance doit dépasser le kilométrage réalisé",
    path: ["prochainKm"],
  })
  // Sans aucune échéance, aucun rappel ne pourra être déclenché.
  .refine((e) => e.prochainKm != null || e.prochainHeures != null || e.prochaineDate != null, {
    message: "Indiquer au moins une échéance (km, heures ou date) pour être alerté",
    path: ["prochainKm"],
  });

export interface EtatEntretien {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function donnees(saisie: z.infer<typeof schemaEntretien>) {
  const cout = saisie.cout ?? 0;
  return {
    type: saisie.type,
    dateFait: saisie.dateFait ?? null,
    kmFait: saisie.kmFait != null ? Math.round(saisie.kmFait) : null,
    heuresFait: saisie.heuresFait != null ? Math.round(saisie.heuresFait) : null,
    prochainKm: saisie.prochainKm != null ? Math.round(saisie.prochainKm) : null,
    prochainHeures: saisie.prochainHeures != null ? Math.round(saisie.prochainHeures) : null,
    prochaineDate: saisie.prochaineDate ?? null,
    cout,
    devise: saisie.devise,
    coutGnf: saisie.devise === "GNF" ? cout : (saisie.coutGnf ?? 0),
  };
}

function rafraichir(camionId: string) {
  revalidatePath(`/camions/${camionId}`);
  revalidatePath("/camions");
  revalidatePath("/alertes");
  revalidatePath("/");
}

export async function creerEntretien(
  _etat: EtatEntretien,
  donneesForm: FormData,
): Promise<EtatEntretien> {
  await droitEcriture();

  const saisie = schemaEntretien.safeParse(Object.fromEntries(donneesForm));
  if (!saisie.success) return erreursFormulaire<EtatEntretien>(saisie.error, donneesForm);

  await prisma.entretien.create({
    data: { ...donnees(saisie.data), camionId: saisie.data.camionId },
  });

  rafraichir(saisie.data.camionId);
  return { ok: true };
}

export async function modifierEntretien(
  id: string,
  _etat: EtatEntretien,
  donneesForm: FormData,
): Promise<EtatEntretien> {
  await droitEcriture();

  const saisie = schemaEntretien.safeParse(Object.fromEntries(donneesForm));
  if (!saisie.success) return erreursFormulaire<EtatEntretien>(saisie.error, donneesForm);

  await prisma.entretien.update({ where: { id }, data: donnees(saisie.data) });
  rafraichir(saisie.data.camionId);
  return { ok: true };
}

export async function supprimerEntretien(id: string) {
  await droitEcriture();

  const entretien = await prisma.entretien.findUnique({
    where: { id },
    select: { camionId: true },
  });
  if (!entretien) throw new Error("Entretien introuvable.");

  await prisma.entretien.delete({ where: { id } });
  rafraichir(entretien.camionId);
}
