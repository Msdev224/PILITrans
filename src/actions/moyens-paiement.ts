"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { erreursFormulaire, nombreOptionnel } from "@/lib/validation";

/** Les moyens de paiement relèvent de la configuration de l'exploitation. */
async function droitEcriture() {
  return exigerPermission("parametres.ecrire");
}

export interface EtatMoyen {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

const schemaMoyen = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(40, "40 caractères maximum"),
  ordre: nombreOptionnel,
});

/**
 * Code stable dérivé du nom.
 *
 * Le libellé peut être corrigé — « Orange money » devient « Orange Money » —
 * sans que les reprises de données perdent leur repère. Le code, lui, ne
 * change plus une fois posé.
 */
function codeDepuisNom(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function rafraichir() {
  revalidatePath("/moyens-paiement");
  revalidatePath("/depenses");
  revalidatePath("/factures");
  revalidatePath("/chauffeurs");
  revalidatePath("/caisse");
}

export async function creerMoyen(_etat: EtatMoyen, donnees: FormData): Promise<EtatMoyen> {
  await droitEcriture();

  const saisie = schemaMoyen.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatMoyen>(saisie.error, donnees);

  const code = codeDepuisNom(saisie.data.nom);
  if (!code) {
    return { erreur: "Ce nom ne donne aucun code exploitable.", champs: { nom: "Nom invalide" } };
  }

  const existant = await prisma.moyenPaiement.findFirst({
    where: { OR: [{ code }, { nom: saisie.data.nom }] },
  });
  if (existant) {
    return {
      erreur: `« ${existant.nom} » existe déjà.`,
      champs: { nom: "Ce moyen de paiement existe déjà" },
    };
  }

  const cree = await prisma.moyenPaiement.create({
    data: { code, nom: saisie.data.nom, ordre: saisie.data.ordre ?? 100 },
  });

  await journaliser({
    action: "moyen-paiement.cree",
    objet: "MoyenPaiement",
    objetId: cree.id,
    libelle: `Moyen de paiement « ${cree.nom} » ajouté`,
  });

  rafraichir();
  return { ok: true };
}

export async function modifierMoyen(
  id: string,
  _etat: EtatMoyen,
  donnees: FormData,
): Promise<EtatMoyen> {
  await droitEcriture();

  const saisie = schemaMoyen.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatMoyen>(saisie.error, donnees);

  const doublon = await prisma.moyenPaiement.findFirst({
    where: { nom: saisie.data.nom, NOT: { id } },
  });
  if (doublon) {
    return { erreur: `« ${doublon.nom} » existe déjà.`, champs: { nom: "Nom déjà utilisé" } };
  }

  // Le code n'est PAS recalculé : les écritures passées s'y accrochent.
  const avant = await prisma.moyenPaiement.findUnique({ where: { id }, select: { nom: true } });
  await prisma.moyenPaiement.update({
    where: { id },
    data: { nom: saisie.data.nom, ordre: saisie.data.ordre ?? undefined },
  });

  if (avant && avant.nom !== saisie.data.nom) {
    await journaliser({
      action: "moyen-paiement.modifie",
      objet: "MoyenPaiement",
      objetId: id,
      libelle: `Moyen de paiement « ${avant.nom} » renommé en « ${saisie.data.nom} »`,
      avant: { nom: avant.nom },
      apres: { nom: saisie.data.nom },
    });
  }

  rafraichir();
  return { ok: true };
}

/**
 * Retire un moyen des listes sans toucher aux écritures.
 *
 * Un opérateur qui ferme ne doit plus apparaître à la saisie, mais les
 * paiements déjà enregistrés gardent le leur : les effacer rendrait
 * inexplicables des sommes bien reçues.
 */
export async function basculerMoyen(id: string) {
  await droitEcriture();

  const moyen = await prisma.moyenPaiement.findUnique({
    where: { id },
    select: { actif: true, nom: true },
  });
  if (!moyen) throw new Error("Moyen de paiement introuvable.");

  await prisma.moyenPaiement.update({ where: { id }, data: { actif: !moyen.actif } });

  await journaliser({
    action: moyen.actif ? "moyen-paiement.retire" : "moyen-paiement.remis",
    objet: "MoyenPaiement",
    objetId: id,
    libelle: `« ${moyen.nom} » ${moyen.actif ? "retiré des" : "remis dans les"} moyens proposés`,
  });

  rafraichir();
}

export async function supprimerMoyen(id: string) {
  await droitEcriture();

  const moyen = await prisma.moyenPaiement.findUnique({
    where: { id },
    select: {
      nom: true,
      _count: { select: { paiements: true, mouvements: true, depenses: true } },
    },
  });
  if (!moyen) throw new Error("Moyen de paiement introuvable.");

  const { paiements, mouvements, depenses } = moyen._count;
  const utilise = paiements + mouvements + depenses;
  if (utilise > 0) {
    throw new Error(
      `« ${moyen.nom} » est utilisé par ${utilise} écriture(s) : retire-le des moyens proposés ` +
        "plutôt que de le supprimer, sinon ces sommes n'auraient plus de provenance.",
    );
  }

  await prisma.moyenPaiement.delete({ where: { id } });

  await journaliser({
    action: "moyen-paiement.supprime",
    objet: "MoyenPaiement",
    objetId: id,
    libelle: `Moyen de paiement « ${moyen.nom} » supprimé (jamais utilisé)`,
  });

  rafraichir();
}
