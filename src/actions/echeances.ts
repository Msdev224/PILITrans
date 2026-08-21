"use server";

import { TypeEcheance } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { dateOptionnelle, erreursFormulaire, nombreOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("flotte.ecrire");
}

const schemaEcheance = z.object({
  camionId: z.string().min(1, "Camion requis"),
  type: z.nativeEnum(TypeEcheance),
  /** N° de police d'assurance, de carte brune, de vignette… */
  numero: texteOptionnel,
  /** Compagnie d'assurance ou organisme émetteur. */
  organisme: texteOptionnel,
  dateDebut: dateOptionnelle,
  dateExpiration: z.coerce.date({ message: "Date d'expiration invalide" }),
  /** Coût du document : il pèse sur la rentabilité du camion. */
  montantGnf: nombreOptionnel,
  rappelJours: nombreOptionnel.pipe(z.number().int().positive("Rappel requis").optional()),
});

export interface EtatEcheance {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function rafraichir(camionId?: string) {
  revalidatePath("/echeances");
  revalidatePath("/alertes");
  revalidatePath("/");
  if (camionId) revalidatePath(`/camions/${camionId}`);
}

export async function creerEcheance(_etat: EtatEcheance, donnees: FormData): Promise<EtatEcheance> {
  await droitEcriture();

  const saisie = schemaEcheance.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatEcheance>(saisie.error, donnees);

  const parametres = await prisma.parametres.findFirst({ select: { rappelEcheanceJours: true } });

  await prisma.echeance.create({
    data: {
      camionId: saisie.data.camionId,
      type: saisie.data.type,
      numero: saisie.data.numero ?? null,
      organisme: saisie.data.organisme ?? null,
      dateDebut: saisie.data.dateDebut ?? null,
      dateExpiration: saisie.data.dateExpiration,
      montantGnf: saisie.data.montantGnf ?? null,
      // À défaut, on reprend le délai de rappel des Paramètres.
      rappelJours: saisie.data.rappelJours ?? parametres?.rappelEcheanceJours ?? 30,
    },
  });

  rafraichir(saisie.data.camionId);
  return { ok: true };
}

export async function modifierEcheance(
  id: string,
  _etat: EtatEcheance,
  donnees: FormData,
): Promise<EtatEcheance> {
  await droitEcriture();

  const saisie = schemaEcheance.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatEcheance>(saisie.error, donnees);

  await prisma.echeance.update({
    where: { id },
    data: {
      camionId: saisie.data.camionId,
      type: saisie.data.type,
      numero: saisie.data.numero ?? null,
      organisme: saisie.data.organisme ?? null,
      dateDebut: saisie.data.dateDebut ?? null,
      dateExpiration: saisie.data.dateExpiration,
      montantGnf: saisie.data.montantGnf ?? null,
      rappelJours: saisie.data.rappelJours ?? 30,
    },
  });

  rafraichir(saisie.data.camionId);
  return { ok: true };
}

/** Renouvellement : on décale l'expiration d'un an, cas courant. */
export async function renouvelerEcheance(id: string) {
  await droitEcriture();

  const echeance = await prisma.echeance.findUnique({ where: { id } });
  if (!echeance) throw new Error("Échéance introuvable.");

  // On part de la date d'expiration si elle est à venir, d'aujourd'hui sinon —
  // renouveler un document déjà expiré ne doit pas reconduire le retard.
  const base = echeance.dateExpiration > new Date() ? echeance.dateExpiration : new Date();
  const nouvelle = new Date(base);
  nouvelle.setFullYear(nouvelle.getFullYear() + 1);

  await prisma.echeance.update({ where: { id }, data: { dateExpiration: nouvelle } });
  rafraichir(echeance.camionId);
}

export async function supprimerEcheance(id: string) {
  await droitEcriture();

  const echeance = await prisma.echeance.findUnique({
    where: { id },
    select: { camionId: true },
  });
  await prisma.echeance.delete({ where: { id } });
  rafraichir(echeance?.camionId);
}
