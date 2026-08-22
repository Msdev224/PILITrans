"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { erreursFormulaire, nombreOptionnel } from "@/lib/validation";

/** Les pays desservis relèvent de la configuration de l'exploitation. */
async function droitEcriture() {
  return exigerPermission("parametres.ecrire");
}

export interface EtatPays {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

const schemaPays = z.object({
  nom: z.string().trim().min(1, "Nom requis"),
  /** Deux lettres ISO, reprises sur les factures : GN, SN, ML… */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Deux lettres attendues (GN, SN…)"),
  indicatif: z
    .string()
    .trim()
    .regex(/^\+\d{1,4}$/, "Indicatif attendu, avec le + (ex. +224)"),
  longueurTelephone: nombreOptionnel,
  ordre: nombreOptionnel,
});

export async function creerPays(_etat: EtatPays, donnees: FormData): Promise<EtatPays> {
  await droitEcriture();

  const saisie = schemaPays.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatPays>(saisie.error, donnees);

  const doublon = await prisma.pays.findFirst({
    where: { OR: [{ nom: saisie.data.nom }, { code: saisie.data.code }] },
  });
  if (doublon) {
    return {
      champs: {
        [doublon.nom === saisie.data.nom ? "nom" : "code"]: "Ce pays existe déjà.",
      },
      valeurs: Object.fromEntries(donnees) as Record<string, string>,
    };
  }

  await prisma.pays.create({
    data: {
      nom: saisie.data.nom,
      code: saisie.data.code,
      indicatif: saisie.data.indicatif,
      longueurTelephone:
        saisie.data.longueurTelephone != null ? Math.round(saisie.data.longueurTelephone) : null,
      ordre: saisie.data.ordre != null ? Math.round(saisie.data.ordre) : 100,
    },
  });

  rafraichir();
  return { ok: true };
}

export async function modifierPays(
  id: string,
  _etat: EtatPays,
  donnees: FormData,
): Promise<EtatPays> {
  await droitEcriture();

  const saisie = schemaPays.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatPays>(saisie.error, donnees);

  const doublon = await prisma.pays.findFirst({
    where: {
      id: { not: id },
      OR: [{ nom: saisie.data.nom }, { code: saisie.data.code }],
    },
  });
  if (doublon) {
    return {
      champs: {
        [doublon.nom === saisie.data.nom ? "nom" : "code"]: "Un autre pays porte déjà cette valeur.",
      },
      valeurs: Object.fromEntries(donnees) as Record<string, string>,
    };
  }

  await prisma.pays.update({
    where: { id },
    data: {
      nom: saisie.data.nom,
      code: saisie.data.code,
      indicatif: saisie.data.indicatif,
      longueurTelephone:
        saisie.data.longueurTelephone != null ? Math.round(saisie.data.longueurTelephone) : null,
      ordre: saisie.data.ordre != null ? Math.round(saisie.data.ordre) : undefined,
    },
  });

  rafraichir();
  return { ok: true };
}

/**
 * Retire un pays des listes sans toucher à l'historique.
 *
 * Un corridor fermé ne doit pas rendre illisibles les voyages passés : on le
 * désactive plutôt que de le supprimer.
 */
export async function basculerPays(id: string) {
  await droitEcriture();

  const pays = await prisma.pays.findUnique({ where: { id }, select: { actif: true } });
  if (!pays) throw new Error("Pays introuvable.");

  await prisma.pays.update({ where: { id }, data: { actif: !pays.actif } });
  rafraichir();
}

/** Suppression définitive, réservée à un pays jamais utilisé. */
export async function supprimerPays(id: string) {
  await droitEcriture();

  const [voyagesD, voyagesA, etapesD, etapesA, prelevements] = await Promise.all([
    prisma.voyage.count({ where: { paysDepartId: id } }),
    prisma.voyage.count({ where: { paysArriveeId: id } }),
    prisma.etapeVoyage.count({ where: { paysDepartId: id } }),
    prisma.etapeVoyage.count({ where: { paysArriveeId: id } }),
    prisma.prelevementDouane.count({ where: { paysId: id } }),
  ]);

  if (voyagesD + voyagesA + etapesD + etapesA + prelevements > 0) {
    throw new Error(
      "Ce pays est utilisé par des voyages : désactivez-le plutôt que de le supprimer.",
    );
  }

  await prisma.pays.delete({ where: { id } });
  rafraichir();
}

function rafraichir() {
  revalidatePath("/pays");
  revalidatePath("/voyages");
  revalidatePath("/parametres");
}
