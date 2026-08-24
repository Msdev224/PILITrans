"use server";

import { randomBytes } from "node:crypto";

import { ModeRemuneration, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { hacherMotDePasse } from "@/lib/mots-de-passe";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { caseACocher, dateExpirationOptionnelle, erreursFormulaire, nombreOptionnel, telephoneOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("equipe.ecrire");
}

const schemaChauffeur = z
  .object({
    nom: z.string().trim().min(1, "Nom requis"),
    telephone: telephoneOptionnel,
    /**
     * Photo d'identité en data URI, déjà réduite par le navigateur.
     * Bornée ici aussi : le client peut être contourné, et une image de
     * plusieurs mégaoctets n'a rien à faire dans une colonne texte.
     */
    photo: texteOptionnel.pipe(
      z.string().max(600_000, "Photo trop lourde").optional(),
    ),
    numeroPermis: texteOptionnel,
    categoriePermis: texteOptionnel,
    permisExpire: dateExpirationOptionnelle,
    modeRemuneration: z.nativeEnum(ModeRemuneration),
    tauxRemuneration: nombreOptionnel,
    actif: caseACocher,
    whatsapp: caseACocher,
    whatsappNumero: telephoneOptionnel,
  })
  /*
   * Le taux reste facultatif.
   *
   * Beaucoup de courses se paient au cas par cas : le montant est convenu au
   * départ et saisi sur la mission elle-même. Exiger un barème général
   * obligeait à inventer un chiffre à la création de la fiche, chiffre qui
   * s'appliquait ensuite à toutes les missions sans paie saisie — et faisait
   * apparaître des charges que personne n'avait décidées.
   *
   * Sans taux ni paie de mission, la rémunération vaut zéro : rien n'est
   * inventé.
   */
  // Une commission au-delà de 100 % de la recette est une erreur de saisie.
  .refine(
    (c) =>
      !["COMMISSION", "MIXTE"].includes(c.modeRemuneration) || (c.tauxRemuneration ?? 0) <= 100,
    { message: "Une commission se saisit en pourcentage (0 à 100)", path: ["tauxRemuneration"] },
  );

export interface EtatChauffeurFiche {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
  /**
   * Identifiants du compte créé avec la fiche, à communiquer au chauffeur.
   *
   * Affichés une seule fois : le mot de passe n'est pas conservé en clair, et
   * ne pourra plus être relu. Le gérant le redonne ou le change depuis
   * l'écran Comptes.
   */
  compte?: { telephone: string; motDePasse: string };
}

function donnees(saisie: z.infer<typeof schemaChauffeur>) {
  return {
    nom: saisie.nom,
    telephone: saisie.telephone ?? null,
    photo: saisie.photo ?? null,
    numeroPermis: saisie.numeroPermis ?? null,
    categoriePermis: saisie.categoriePermis ?? null,
    permisExpire: saisie.permisExpire ?? null,
    modeRemuneration: saisie.modeRemuneration,
    tauxRemuneration: saisie.tauxRemuneration ?? null,
    actif: saisie.actif,
    whatsapp: saisie.whatsapp,
    whatsappNumero: saisie.whatsappNumero ?? null,
  };
}

function rafraichir() {
  revalidatePath("/chauffeurs");
  revalidatePath("/voyages");
  revalidatePath("/alertes");
  revalidatePath("/");
}

export async function creerChauffeur(
  _etat: EtatChauffeurFiche,
  donneesForm: FormData,
): Promise<EtatChauffeurFiche> {
  await droitEcriture();

  const saisie = schemaChauffeur.safeParse(Object.fromEntries(donneesForm));
  if (!saisie.success) return erreursFormulaire<EtatChauffeurFiche>(saisie.error, donneesForm);

  const valeurs = donnees(saisie.data);

  /*
   * Le compte de connexion naît avec la fiche.
   *
   * Un chauffeur sans compte ne peut rien saisir depuis la route : la fiche
   * existe, mais l'espace mobile lui reste fermé. Les créer séparément faisait
   * systématiquement oublier le second, et le gérant s'en apercevait le jour
   * où le chauffeur était déjà parti.
   */
  const telephone = valeurs.telephone;
  if (telephone) {
    const pris = await prisma.utilisateur.findUnique({ where: { telephone } });
    if (pris) {
      return {
        erreur: `Le numéro ${telephone} sert déjà de connexion à « ${pris.nom} ». Un numéro identifie une seule personne.`,
        champs: { telephone: "Numéro déjà utilisé par un compte" },
        valeurs: aPlat(donneesForm),
      };
    }
  }

  const motDePasse = telephone ? motDePasseProvisoire() : null;

  await prisma.$transaction(async (tx) => {
    const cree = await tx.chauffeur.create({ data: valeurs });

    /*
     * Son emplacement de trésorerie naît avec lui.
     *
     * L'argent qu'on lui remet est quelque part, et ce quelque part, c'est
     * lui. Sans compte, ses avances sortiraient de la caisse sans arriver
     * nulle part : la trésorerie totale baisserait alors que rien n'a quitté
     * l'entreprise.
     */
    await tx.compteTresorerie.create({
      data: { nom: cree.nom, type: "CHAUFFEUR", chauffeurId: cree.id, ordre: 50 },
    });

    if (telephone && motDePasse) {
      await tx.utilisateur.create({
        data: {
          nom: cree.nom,
          telephone,
          role: "CHAUFFEUR",
          actif: true,
          motDePasse: await hacherMotDePasse(motDePasse),
          chauffeurId: cree.id,
        },
      });
    }
  });

  await journaliser({
    action: telephone ? "chauffeur.cree.avec-compte" : "chauffeur.cree",
    objet: "Chauffeur",
    objetId: null,
    libelle: telephone
      ? `${valeurs.nom} enregistré, compte de connexion créé sur ${telephone}`
      : `${valeurs.nom} enregistré (sans compte : aucun numéro renseigné)`,
  });

  rafraichir();
  revalidatePath("/utilisateurs");

  return {
    ok: true,
    ...(telephone && motDePasse ? { compte: { telephone, motDePasse } } : {}),
  };
}

/** Reprend la saisie telle quelle, pour ne pas la faire retaper après un refus. */
function aPlat(donnees: FormData): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") champs[cle] = valeur;
  }
  return champs;
}

/**
 * Mot de passe provisoire, montré une seule fois au gérant.
 *
 * Assez long pour ne pas se deviner, assez simple pour être dicté au
 * téléphone : pas de caractère ambigu — ni O ni 0, ni I ni l.
 */
function motDePasseProvisoire(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(10), (o) => alphabet[o % alphabet.length]).join("");
}

export async function modifierChauffeur(
  id: string,
  _etat: EtatChauffeurFiche,
  donneesForm: FormData,
): Promise<EtatChauffeurFiche> {
  await droitEcriture();

  const saisie = schemaChauffeur.safeParse(Object.fromEntries(donneesForm));
  if (!saisie.success) return erreursFormulaire<EtatChauffeurFiche>(saisie.error, donneesForm);

  const valeursModifiees = donnees(saisie.data);
  await prisma.chauffeur.update({ where: { id }, data: valeursModifiees });

  // Le compte porte le nom du chauffeur : le renommer d'un côté sans l'autre
  // rendrait l'écran Trésorerie incompréhensible.
  await prisma.compteTresorerie.updateMany({
    where: { chauffeurId: id },
    data: { nom: valeursModifiees.nom },
  });
  rafraichir();
  return { ok: true };
}

/** Un chauffeur ayant roulé est désactivé, jamais effacé : ses voyages restent. */
export async function retirerChauffeur(id: string) {
  await droitEcriture();

  const fiche = await prisma.chauffeur.findUnique({ where: { id }, select: { nom: true } });
  let desactive = false;

  try {
    await prisma.chauffeur.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      await prisma.chauffeur.update({ where: { id }, data: { actif: false } });
      desactive = true;
    } else {
      throw e;
    }
  }

  await journaliser({
    action: desactive ? "chauffeur.desactive" : "chauffeur.supprime",
    objet: "Chauffeur",
    objetId: id,
    libelle: `${fiche?.nom ?? "Chauffeur"} ${desactive ? "désactivé (ses missions restent)" : "supprimé (n'avait jamais roulé)"}`,
  });

  rafraichir();
}
