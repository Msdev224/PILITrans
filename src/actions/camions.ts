"use server";

import { Carrosserie, Prisma, StatutCamion, TypeVehicule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { estTransportPersonnes } from "@/lib/utils";
import { dateOptionnelle, erreursFormulaire, nombreOptionnel, telephoneOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
/**
 * Le transport de personnes n'est ouvert que si les Paramètres l'autorisent.
 *
 * Le contrôle est fait ici, pas seulement dans le menu déroulant : un
 * formulaire modifié à la main enregistrerait sinon un véhicule que
 * l'application ne sait pas suivre.
 */
async function verifierCarrosserie(carrosserie: string) {
  if (!estTransportPersonnes(carrosserie)) return null;

  const parametres = await prisma.parametres.findFirst({
    select: { transportPersonnesActif: true },
  });
  if (parametres?.transportPersonnesActif) return null;

  return {
    champs: {
      carrosserie:
        "Le transport de personnes n'est pas activé. Cochez-le dans Paramètres → Modules.",
    },
  };
}

async function droitEcriture() {
  return exigerPermission("flotte.ecrire");
}

const schemaCamion = z
  .object({
    nom: z.string().trim().min(1, "Nom requis"),
    typeVehicule: z.nativeEnum(TypeVehicule),
    // Le transport de personnes n'est pas encore exploité : refuser la valeur
    // ici, et pas seulement dans le menu déroulant, évite d'enregistrer un
    // véhicule que l'application ne sait pas suivre.
    carrosserie: z.nativeEnum(Carrosserie),
    /** Photo du véhicule, déjà réduite par le navigateur. */
    photo: texteOptionnel.pipe(z.string().max(600_000, "Photo trop lourde").optional()),
    immatTracteur: z.string().trim().min(1, "Immatriculation requise"),
    immatRemorque: z.string().trim().optional(),
    marqueTracteur: z.string().trim().optional(),
    telephoneBord1: telephoneOptionnel,
    telephoneBord2: telephoneOptionnel,
    marqueGroupeFroid: z.string().trim().optional(),
    modeleGroupeFroid: z.string().trim().optional(),
    heuresGroupeFroid: nombreOptionnel,
    kilometrage: nombreOptionnel,
    capaciteTonnes: nombreOptionnel,
    coutAcquisition: nombreOptionnel,
    dateAcquisition: dateOptionnelle,
    dureeAmortissementMois: nombreOptionnel,
    statut: z.nativeEnum(StatutCamion),
  })
  // Un porteur n'a pas de remorque : laisser une immatriculation serait trompeur.
  .refine((c) => c.typeVehicule === "TRACTEUR_REMORQUE" || !c.immatRemorque, {
    message: "Un porteur n'a pas de remorque",
    path: ["immatRemorque"],
  })
  .refine((c) => c.dureeAmortissementMois == null || c.dureeAmortissementMois > 0, {
    message: "La durée d'amortissement doit être supérieure à 0",
    path: ["dureeAmortissementMois"],
  });

export interface EtatCamion {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function donneesCamion(saisie: z.infer<typeof schemaCamion>) {
  // La carrosserie est la source de vérité : seule une caisse FRIGO porte un
  // groupe froid. `refrigere` en découle, ce qui évite qu'une benne se
  // retrouve avec une chaîne du froid à suivre.
  const froid = saisie.carrosserie === "FRIGO";

  return {
    nom: saisie.nom,
    typeVehicule: saisie.typeVehicule,
    carrosserie: saisie.carrosserie,
    refrigere: froid,
    immatTracteur: saisie.immatTracteur,
    immatRemorque: saisie.typeVehicule === "TRACTEUR_REMORQUE" ? saisie.immatRemorque || null : null,
    marqueTracteur: saisie.marqueTracteur || null,
    photo: saisie.photo ?? null,
    telephoneBord1: saisie.telephoneBord1 || null,
    telephoneBord2: saisie.telephoneBord2 || null,
    marqueGroupeFroid: froid ? saisie.marqueGroupeFroid || null : null,
    modeleGroupeFroid: froid ? saisie.modeleGroupeFroid || null : null,
    heuresGroupeFroid: froid ? Math.round(saisie.heuresGroupeFroid ?? 0) : 0,
    kilometrage: Math.round(saisie.kilometrage ?? 0),
    capaciteTonnes: saisie.capaciteTonnes ?? null,
    coutAcquisition: saisie.coutAcquisition ?? null,
    dateAcquisition: saisie.dateAcquisition ?? null,
    dureeAmortissementMois:
      saisie.dureeAmortissementMois != null ? Math.round(saisie.dureeAmortissementMois) : null,
    statut: saisie.statut,
  };
}

/** Les immatriculations sont uniques en base : on traduit l'erreur Prisma. */
function erreurUnicite(e: unknown, donnees: FormData): EtatCamion | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;

  const cibles = (e.meta?.target as string[] | undefined) ?? [];
  const champ = cibles.includes("immatRemorque") ? "immatRemorque" : "immatTracteur";
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") valeurs[cle] = valeur;
  }

  return {
    erreur: "Cette immatriculation est déjà utilisée par un autre camion.",
    champs: { [champ]: "Immatriculation déjà enregistrée" },
    valeurs,
  };
}

function rafraichir(camionId?: string) {
  revalidatePath("/camions");
  revalidatePath("/");
  revalidatePath("/voyages");
  if (camionId) revalidatePath(`/camions/${camionId}`);
}

export async function creerCamion(_etat: EtatCamion, donnees: FormData): Promise<EtatCamion> {
  await droitEcriture();

  const saisie = schemaCamion.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatCamion>(saisie.error, donnees);

  const refus = await verifierCarrosserie(saisie.data.carrosserie);
  if (refus) return refus;

  try {
    await prisma.camion.create({ data: donneesCamion(saisie.data) });
  } catch (e) {
    const conflit = erreurUnicite(e, donnees);
    if (conflit) return conflit;
    throw e;
  }

  rafraichir();
  return { ok: true };
}

export async function modifierCamion(
  id: string,
  _etat: EtatCamion,
  donnees: FormData,
): Promise<EtatCamion> {
  await droitEcriture();

  const saisie = schemaCamion.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatCamion>(saisie.error, donnees);

  const refus = await verifierCarrosserie(saisie.data.carrosserie);
  if (refus) return refus;

  try {
    await prisma.camion.update({ where: { id }, data: donneesCamion(saisie.data) });
  } catch (e) {
    const conflit = erreurUnicite(e, donnees);
    if (conflit) return conflit;
    throw e;
  }

  rafraichir(id);
  return { ok: true };
}

/**
 * Un camion ayant roulé n'est jamais effacé : son historique porte des voyages,
 * des dépenses et un P&L. Il est sorti du parc (`actif = false`).
 */
export async function retirerCamion(id: string) {
  await droitEcriture();

  const camion = await prisma.camion.findUnique({
    where: { id },
    select: { _count: { select: { voyages: true, depenses: true, reparations: true } } },
  });
  if (!camion) throw new Error("Camion introuvable.");

  const { voyages, depenses, reparations } = camion._count;
  if (voyages + depenses + reparations > 0) {
    await prisma.camion.update({ where: { id }, data: { actif: false, statut: "HORS_SERVICE" } });
  } else {
    await prisma.camion.delete({ where: { id } });
  }

  rafraichir(id);
}
