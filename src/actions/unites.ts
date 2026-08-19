"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { erreursFormulaire, nombreOptionnel } from "@/lib/validation";

/** Les unités relèvent de la configuration de l'exploitation. */
async function droitEcriture() {
  return exigerPermission("parametres.ecrire");
}

export interface EtatUnite {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

const schemaUnite = z.object({
  nom: z.string().trim().min(1, "Nom requis"),
  symbole: z.string().trim().min(1, "Symbole requis").max(12, "12 caractères maximum"),
  /**
   * Équivalent en tonnes d'une unité. Facultatif : tout ne se pèse pas.
   * Laissé vide, l'unité reste parfaitement utilisable — seul le cumul en
   * tonnage d'un chargement mixte devient impossible, ce qui vaut mieux qu'un
   * total inventé.
   */
  facteurTonne: nombreOptionnel,
  ordre: nombreOptionnel,
});

export async function creerUnite(_etat: EtatUnite, donnees: FormData): Promise<EtatUnite> {
  await droitEcriture();

  const saisie = schemaUnite.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatUnite>(saisie.error, donnees);

  const existante = await prisma.unite.findUnique({ where: { nom: saisie.data.nom } });
  if (existante) {
    return {
      champs: { nom: "Une unité porte déjà ce nom." },
      valeurs: Object.fromEntries(donnees) as Record<string, string>,
    };
  }

  await prisma.unite.create({
    data: {
      nom: saisie.data.nom,
      symbole: saisie.data.symbole,
      facteurTonne: saisie.data.facteurTonne ?? null,
      ordre: saisie.data.ordre != null ? Math.round(saisie.data.ordre) : 100,
    },
  });

  rafraichir();
  return { ok: true };
}

export async function modifierUnite(
  id: string,
  _etat: EtatUnite,
  donnees: FormData,
): Promise<EtatUnite> {
  await droitEcriture();

  const saisie = schemaUnite.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatUnite>(saisie.error, donnees);

  const doublon = await prisma.unite.findFirst({
    where: { nom: saisie.data.nom, id: { not: id } },
  });
  if (doublon) {
    return {
      champs: { nom: "Une autre unité porte déjà ce nom." },
      valeurs: Object.fromEntries(donnees) as Record<string, string>,
    };
  }

  await prisma.unite.update({
    where: { id },
    data: {
      nom: saisie.data.nom,
      symbole: saisie.data.symbole,
      facteurTonne: saisie.data.facteurTonne ?? null,
      ordre: saisie.data.ordre != null ? Math.round(saisie.data.ordre) : undefined,
    },
  });

  rafraichir();
  return { ok: true };
}

/**
 * Retire une unité des listes sans toucher à l'historique.
 *
 * Une unité déjà employée n'est jamais supprimée : les quantités des voyages
 * passés deviendraient illisibles. La désactivation la fait disparaître de la
 * saisie tout en gardant lisible ce qui a été enregistré.
 */
export async function basculerUnite(id: string) {
  await droitEcriture();

  const unite = await prisma.unite.findUnique({ where: { id }, select: { actif: true } });
  if (!unite) throw new Error("Unité introuvable.");

  await prisma.unite.update({ where: { id }, data: { actif: !unite.actif } });
  rafraichir();
}

/** Suppression définitive, réservée aux unités jamais utilisées. */
export async function supprimerUnite(id: string) {
  await droitEcriture();

  const utilisations = await prisma.ligneMarchandise.count({ where: { uniteId: id } });
  if (utilisations > 0) {
    throw new Error(
      "Cette unité est utilisée par des voyages : désactivez-la plutôt que de la supprimer.",
    );
  }

  await prisma.unite.delete({ where: { id } });
  rafraichir();
}

function rafraichir() {
  revalidatePath("/unites");
  revalidatePath("/voyages");
  revalidatePath("/parametres");
}
