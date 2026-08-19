"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { hacherMotDePasse } from "@/lib/mots-de-passe";
import { prisma } from "@/lib/prisma";
import { normaliserTelephone } from "@/lib/telephone";
import { erreursFormulaire, telephoneRequis, texteOptionnel } from "@/lib/validation";

/** Créer ou modifier un compte relève de la gestion d'équipe. */
async function droitEcriture() {
  return exigerPermission("equipe.ecrire");
}

export interface EtatUtilisateur {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

const schemaUtilisateur = z
  .object({
    nom: z.string().trim().min(1, "Nom requis"),
    // Le numéro sert d'identifiant de connexion : il est obligatoire.
    telephone: telephoneRequis,
    email: texteOptionnel,
    role: z.nativeEnum(Role),
    chauffeurId: texteOptionnel,
    motDePasse: texteOptionnel,
    actif: z
      .preprocess((v) => v === "on" || v === "true" || v === true, z.boolean())
      .optional(),
  })
  .refine((d) => d.role !== "CHAUFFEUR" || !!d.chauffeurId, {
    message: "Rattachez le compte à une fiche chauffeur",
    path: ["chauffeurId"],
  })
  .refine((d) => !d.motDePasse || d.motDePasse.length >= 8, {
    message: "8 caractères minimum",
    path: ["motDePasse"],
  });

/**
 * Empêche de se retirer soi-même l'accès complet.
 *
 * Sans ce garde-fou, le dernier gérant peut se rétrograder ou se désactiver et
 * l'exploitation se retrouve sans personne pouvant créer un compte — une porte
 * qui se verrouille de l'intérieur, sans clé de secours.
 */
async function verifierDernierGerant(idModifie: string, futurRole: Role, futurActif: boolean) {
  if (futurRole === "GERANT" && futurActif) return;

  const autresGerants = await prisma.utilisateur.count({
    where: { role: "GERANT", actif: true, id: { not: idModifie } },
  });
  if (autresGerants === 0) {
    throw new Error(
      "Ce compte est le dernier gérant actif : désignez d'abord un autre gérant.",
    );
  }
}

export async function creerUtilisateur(
  _etat: EtatUtilisateur,
  donnees: FormData,
): Promise<EtatUtilisateur> {
  await droitEcriture();

  const saisie = schemaUtilisateur.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire(saisie.error, donnees);
  const d = saisie.data;

  if (!d.motDePasse) {
    return {
      ...erreursFormulaire(
        new z.ZodError([
          { code: "custom", message: "Mot de passe requis à la création", path: ["motDePasse"] },
        ]),
        donnees,
      ),
    };
  }

  const telephone = normaliserTelephone(d.telephone);
  const existant = await prisma.utilisateur.findFirst({ where: { telephone } });
  if (existant) {
    return { erreur: "Un compte utilise déjà ce numéro.", valeurs: Object.fromEntries(donnees) as Record<string, string> };
  }

  await prisma.utilisateur.create({
    data: {
      nom: d.nom,
      telephone,
      email: d.email ?? null,
      role: d.role,
      actif: d.actif ?? true,
      motDePasse: await hacherMotDePasse(d.motDePasse),
      chauffeurId: d.role === "CHAUFFEUR" ? (d.chauffeurId ?? null) : null,
    },
  });

  revalidatePath("/utilisateurs");
  return { ok: true };
}

export async function modifierUtilisateur(
  id: string,
  _etat: EtatUtilisateur,
  donnees: FormData,
): Promise<EtatUtilisateur> {
  await droitEcriture();

  const saisie = schemaUtilisateur.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire(saisie.error, donnees);
  const d = saisie.data;
  const actif = d.actif ?? false;

  try {
    await verifierDernierGerant(id, d.role, actif);
  } catch (erreur) {
    return {
      erreur: erreur instanceof Error ? erreur.message : "Modification impossible.",
      valeurs: Object.fromEntries(donnees) as Record<string, string>,
    };
  }

  const telephone = normaliserTelephone(d.telephone);
  const doublon = await prisma.utilisateur.findFirst({
    where: { telephone, id: { not: id } },
  });
  if (doublon) {
    return { erreur: "Un autre compte utilise déjà ce numéro.", valeurs: Object.fromEntries(donnees) as Record<string, string> };
  }

  await prisma.utilisateur.update({
    where: { id },
    data: {
      nom: d.nom,
      telephone,
      email: d.email ?? null,
      role: d.role,
      actif,
      chauffeurId: d.role === "CHAUFFEUR" ? (d.chauffeurId ?? null) : null,
      // Un champ mot de passe laissé vide ne touche pas à l'existant.
      ...(d.motDePasse ? { motDePasse: await hacherMotDePasse(d.motDePasse) } : {}),
    },
  });

  revalidatePath("/utilisateurs");
  return { ok: true };
}

/**
 * Désactivation plutôt que suppression : le compte reste lié à ce qu'il a saisi
 * (dépenses, relevés, missions), et l'historique doit rester lisible.
 */
export async function basculerActivation(id: string) {
  await droitEcriture();

  const compte = await prisma.utilisateur.findUnique({
    where: { id },
    select: { actif: true, role: true },
  });
  if (!compte) throw new Error("Compte introuvable.");

  const futurActif = !compte.actif;
  await verifierDernierGerant(id, compte.role, futurActif);

  await prisma.utilisateur.update({ where: { id }, data: { actif: futurActif } });
  revalidatePath("/utilisateurs");
}
