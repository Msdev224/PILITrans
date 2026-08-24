"use server";

import { Devise, MotifTresorerie, TypeCompte } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { observerTaux } from "@/lib/donnees/taux";
import { formatNombre, LIBELLE_MOTIF_TRESORERIE } from "@/lib/utils";
import {
  dateBorneeOptionnelle,
  erreursFormulaire,
  nombreOptionnel,
  nombrePositif,
  texteOptionnel,
} from "@/lib/validation";

/** La trésorerie relève de la comptabilité. */
async function droitEcriture() {
  return exigerPermission("depenses.ecrire");
}

export interface EtatTresorerie {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function rafraichir() {
  revalidatePath("/tresorerie");
  revalidatePath("/caisse");
  revalidatePath("/chauffeurs");
  revalidatePath("/");
}

// ------------------------------------------------------------
//  Comptes
// ------------------------------------------------------------

const schemaCompte = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(60, "60 caractères maximum"),
  type: z.nativeEnum(TypeCompte),
  devise: z.nativeEnum(Devise).default("GNF"),
  reference: texteOptionnel,
  soldeInitial: nombreOptionnel,
  dateSoldeInitial: dateBorneeOptionnelle,
  ordre: nombreOptionnel,
});

export async function creerCompte(
  _etat: EtatTresorerie,
  donnees: FormData,
): Promise<EtatTresorerie> {
  await droitEcriture();

  const saisie = schemaCompte.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatTresorerie>(saisie.error, donnees);

  const doublon = await prisma.compteTresorerie.findUnique({ where: { nom: saisie.data.nom } });
  if (doublon) {
    return { erreur: `« ${doublon.nom} » existe déjà.`, champs: { nom: "Nom déjà utilisé" } };
  }

  /*
   * Un compte chauffeur ne se crée pas ici.
   *
   * Il naît avec la fiche du chauffeur et lui reste attaché : en ouvrir un
   * second à la main donnerait deux emplacements pour le même homme, et son
   * solde se répartirait entre les deux sans que rien ne le signale.
   */
  if (saisie.data.type === "CHAUFFEUR") {
    return {
      erreur:
        "Un compte chauffeur se crée avec sa fiche, pas ici. Chaque chauffeur en a déjà un.",
      champs: { type: "Type réservé aux chauffeurs" },
    };
  }

  const cree = await prisma.compteTresorerie.create({
    data: {
      nom: saisie.data.nom,
      type: saisie.data.type,
      devise: saisie.data.devise,
      reference: saisie.data.reference ?? null,
      soldeInitial: saisie.data.soldeInitial ?? 0,
      dateSoldeInitial: saisie.data.dateSoldeInitial ?? null,
      ordre: saisie.data.ordre ?? 100,
    },
  });

  await journaliser({
    action: "tresorerie.compte.cree",
    objet: "CompteTresorerie",
    objetId: cree.id,
    libelle:
      `Compte « ${cree.nom} » ouvert` +
      (saisie.data.soldeInitial
        ? ` avec ${formatNombre(saisie.data.soldeInitial)} ${saisie.data.devise} au départ`
        : ""),
    montantGnf: saisie.data.devise === "GNF" ? (saisie.data.soldeInitial ?? null) : null,
  });

  rafraichir();
  return { ok: true };
}

export async function modifierCompte(
  id: string,
  _etat: EtatTresorerie,
  donnees: FormData,
): Promise<EtatTresorerie> {
  await droitEcriture();

  const saisie = schemaCompte.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatTresorerie>(saisie.error, donnees);

  const doublon = await prisma.compteTresorerie.findFirst({
    where: { nom: saisie.data.nom, NOT: { id } },
  });
  if (doublon) {
    return { erreur: `« ${doublon.nom} » existe déjà.`, champs: { nom: "Nom déjà utilisé" } };
  }

  const avant = await prisma.compteTresorerie.findUnique({
    where: { id },
    select: { nom: true, soldeInitial: true, chauffeurId: true },
  });
  if (!avant) throw new Error("Compte introuvable.");

  await prisma.compteTresorerie.update({
    where: { id },
    data: {
      nom: saisie.data.nom,
      // Le type d'un compte chauffeur ne change pas : il est lié à sa fiche.
      ...(avant.chauffeurId ? {} : { type: saisie.data.type }),
      devise: saisie.data.devise,
      reference: saisie.data.reference ?? null,
      soldeInitial: saisie.data.soldeInitial ?? 0,
      dateSoldeInitial: saisie.data.dateSoldeInitial ?? null,
      ordre: saisie.data.ordre ?? undefined,
    },
  });

  await journaliser({
    action: "tresorerie.compte.modifie",
    objet: "CompteTresorerie",
    objetId: id,
    libelle: `Compte « ${avant.nom} » modifié`,
    avant: { nom: avant.nom, soldeInitial: Number(avant.soldeInitial) },
    apres: { nom: saisie.data.nom, soldeInitial: saisie.data.soldeInitial ?? 0 },
  });

  rafraichir();
  return { ok: true };
}

/**
 * Retire un compte des listes sans toucher à ses écritures.
 *
 * Un compte fermé ne doit plus recevoir de saisie, mais son historique reste :
 * les sommes qui y sont passées sont réelles.
 */
export async function basculerCompte(id: string) {
  await droitEcriture();

  const compte = await prisma.compteTresorerie.findUnique({
    where: { id },
    select: { actif: true, nom: true },
  });
  if (!compte) throw new Error("Compte introuvable.");

  await prisma.compteTresorerie.update({ where: { id }, data: { actif: !compte.actif } });

  await journaliser({
    action: compte.actif ? "tresorerie.compte.ferme" : "tresorerie.compte.rouvert",
    objet: "CompteTresorerie",
    objetId: id,
    libelle: `Compte « ${compte.nom} » ${compte.actif ? "fermé" : "rouvert"}`,
  });

  rafraichir();
}

// ------------------------------------------------------------
//  Mouvements d'argent entre comptes
// ------------------------------------------------------------

const schemaOperation = z
  .object({
    compteId: z.string().min(1, "Compte requis"),
    versId: texteOptionnel,
    motif: z.nativeEnum(MotifTresorerie),
    montant: nombrePositif("Montant requis"),
    devise: z.nativeEnum(Devise).default("GNF"),
    montantGnf: nombreOptionnel,
    fraisGnf: nombreOptionnel,
    date: dateBorneeOptionnelle,
    libelle: texteOptionnel,
    reference: texteOptionnel,
  })
  .refine((o) => o.devise === "GNF" || (o.montantGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF du montant en CFA",
    path: ["montantGnf"],
  })
  /*
   * Un transfert va forcément quelque part.
   *
   * Sans destination, l'argent sortirait d'un compte sans arriver nulle part :
   * la trésorerie totale baisserait alors qu'aucun franc n'a quitté
   * l'entreprise.
   */
  .refine((o) => !TRANSFERTS.includes(o.motif) || !!o.versId, {
    message: "Indiquer le compte de destination",
    path: ["versId"],
  })
  .refine((o) => o.compteId !== o.versId, {
    message: "La destination doit différer du compte d'origine",
    path: ["versId"],
  });

/** Motifs qui déplacent l'argent d'un compte à un autre. */
const TRANSFERTS: MotifTresorerie[] = ["DEPOT", "RETRAIT", "TRANSFERT"];

export async function enregistrerOperation(
  _etat: EtatTresorerie,
  donnees: FormData,
): Promise<EtatTresorerie> {
  await droitEcriture();

  const saisie = schemaOperation.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatTresorerie>(saisie.error, donnees);

  const montantGnf =
    saisie.data.devise === "GNF" ? saisie.data.montant : (saisie.data.montantGnf ?? 0);
  if (saisie.data.devise !== "GNF") await observerTaux(saisie.data.montant, montantGnf);

  const [origine, destination] = await Promise.all([
    prisma.compteTresorerie.findUnique({ where: { id: saisie.data.compteId }, select: { nom: true } }),
    saisie.data.versId
      ? prisma.compteTresorerie.findUnique({ where: { id: saisie.data.versId }, select: { nom: true } })
      : null,
  ]);
  if (!origine) return { erreur: "Compte d'origine introuvable." };

  const operation = await prisma.operationTresorerie.create({
    data: {
      compteId: saisie.data.compteId,
      versId: saisie.data.versId || null,
      motif: saisie.data.motif,
      montant: saisie.data.montant,
      devise: saisie.data.devise,
      montantGnf,
      fraisGnf: saisie.data.fraisGnf ?? null,
      date: saisie.data.date ?? new Date(),
      libelle: saisie.data.libelle ?? null,
      reference: saisie.data.reference ?? null,
    },
  });

  await journaliser({
    action: `tresorerie.${saisie.data.motif.toLowerCase()}`,
    objet: "OperationTresorerie",
    objetId: operation.id,
    libelle:
      `${LIBELLE_MOTIF_TRESORERIE[saisie.data.motif]} de ${formatNombre(montantGnf)} GNF ` +
      `depuis « ${origine.nom} »` +
      (destination ? ` vers « ${destination.nom} »` : ""),
    montantGnf,
  });

  rafraichir();
  return { ok: true };
}

export async function supprimerOperation(id: string) {
  await droitEcriture();

  const operation = await prisma.operationTresorerie.findUnique({
    where: { id },
    select: { motif: true, montantGnf: true, compte: { select: { nom: true } } },
  });
  if (!operation) throw new Error("Opération introuvable.");

  await prisma.operationTresorerie.delete({ where: { id } });

  await journaliser({
    action: "tresorerie.operation.supprimee",
    objet: "OperationTresorerie",
    objetId: id,
    libelle:
      `${LIBELLE_MOTIF_TRESORERIE[operation.motif]} de ${formatNombre(Number(operation.montantGnf))} GNF ` +
      `sur « ${operation.compte.nom} » supprimé`,
    montantGnf: Number(operation.montantGnf),
  });

  rafraichir();
}
