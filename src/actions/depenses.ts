"use server";

import { CategorieDepense, Devise, MoyenPaiement, TypeDepense } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { observerTaux } from "@/lib/donnees/taux";
import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { estChargeDeStructure } from "@/lib/utils";
import { caseACocher, dateBornee, erreursFormulaire, nombreOptionnel, nombrePositif, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("depenses.ecrire");
}

const TYPES_GASOIL: string[] = ["GASOIL_TRACTEUR", "GASOIL_GROUPE_FROID"];

const schemaDepense = z
  .object({
    type: z.nativeEnum(TypeDepense),
    montant: nombrePositif("Montant requis"),
    devise: z.nativeEnum(Devise),
    /** Équivalent GNF au taux réel du moment — figé, jamais recalculé. */
    montantGnf: nombreOptionnel,
    litres: nombreOptionnel,
    releveCompteur: nombreOptionnel,
    description: z.string().trim().optional(),
    date: dateBornee,
    voyageId: z.string().trim().optional(),
    camionId: z.string().trim().optional(),
    /**
     * Dépense réglée sur l'argent remis au chauffeur. Le mouvement de caisse
     * correspondant est créé en même temps et rattaché à cette dépense : c'est
     * ce lien qui garantit qu'une sortie de caisse est toujours imputée à un
     * camion, et qu'elle n'y est comptée qu'une fois.
     */
    surCaisseChauffeurId: texteOptionnel,
    /** Comment la dépense a été réglée : à retrouver dans un relevé. */
    /** Étage de la charge : mission, véhicule, administratif, général. */
    categorie: z.nativeEnum(CategorieDepense).default("DIRECTE"),
    /**
     * Compter cette dépense dans la marge de la mission ?
     *
     * Cochée seulement pour une charge de véhicule qu'on veut malgré tout
     * imputer au voyage — un pneu crevé sur la route, par exemple, dont le
     * coût appartient bien à cette course-là.
     */
    imputerAMission: caseACocher,
    /** Ventilations analytiques facultatives. */
    chauffeurId: texteOptionnel,
    clientId: texteOptionnel,
    moyen: z.nativeEnum(MoyenPaiement),
    reference: texteOptionnel,
  })
  .refine((d) => d.devise === "GNF" || (d.montantGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF du montant en CFA",
    path: ["montantGnf"],
  })
  /*
   * Une charge de mission ou de véhicule doit viser quelque chose, sinon elle
   * n'entre dans aucun compte de résultat et devient invisible.
   *
   * Les charges de structure — loyer, salaires, électricité — ne visent rien
   * par nature. Les y contraindre les rendait tout simplement impossibles à
   * saisir : l'entreprise n'avait aucun moyen d'enregistrer ce qu'elle dépense
   * pour exister.
   */
  .refine((d) => estChargeDeStructure(d.categorie) || !!d.voyageId || !!d.camionId, {
    message: "Rattacher la dépense à un voyage ou à un camion",
    path: ["camionId"],
  })
  // Les litres sont ce qui rend la consommation calculable.
  .refine((d) => !TYPES_GASOIL.includes(d.type) || (d.litres ?? 0) > 0, {
    message: "Saisir les litres pour une dépense de gasoil",
    path: ["litres"],
  });

export interface EtatDepense {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}


async function donneesDepense(saisie: z.infer<typeof schemaDepense>) {
  const montantGnf = saisie.devise === "GNF" ? saisie.montant : (saisie.montantGnf ?? 0);

  // Une dépense rattachée à un voyage l'est aussi à son camion : sans quoi
  // elle échapperait au P&L du véhicule.
  let camionId = saisie.camionId || null;
  if (saisie.voyageId && !camionId) {
    const voyage = await prisma.voyage.findUnique({
      where: { id: saisie.voyageId },
      select: { camionId: true },
    });
    camionId = voyage?.camionId ?? null;
  }

  return {
    type: saisie.type,
    montant: saisie.montant,
    devise: saisie.devise,
    montantGnf,
    litres: saisie.litres ?? null,
    releveCompteur: saisie.releveCompteur != null ? Math.round(saisie.releveCompteur) : null,
    description: saisie.description || null,
    date: saisie.date,
    voyageId: saisie.voyageId || null,
    camionId,
    categorie: saisie.categorie,
    /*
     * Une réparation engagée pendant une mission n'est pas un coût de cette
     * mission : la pièce sert au camion pendant des mois. L'imputer ferait
     * plonger la marge d'un voyage au hasard de la panne. Les charges de
     * véhicule sortent donc de la marge de mission, sauf case cochée.
     */
    imputerAMission: saisie.categorie === "VEHICULE" ? saisie.imputerAMission : true,
    chauffeurId: saisie.chauffeurId || null,
    clientId: saisie.clientId || null,
    moyen: saisie.moyen,
    reference: saisie.reference || null,
  };
}

function rafraichir(camionId?: string | null, voyageId?: string | null) {
  revalidatePath("/depenses");
  revalidatePath("/caisse");
  revalidatePath("/camions");
  revalidatePath("/voyages");
  revalidatePath("/");
  if (camionId) revalidatePath(`/camions/${camionId}`);
  if (voyageId) revalidatePath(`/voyages/${voyageId}`);
}

export async function creerDepense(_etat: EtatDepense, donnees: FormData): Promise<EtatDepense> {
  await droitEcriture();

  const saisie = schemaDepense.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatDepense>(saisie.error, donnees);

  const data = await donneesDepense(saisie.data);
  const depense = await prisma.depense.create({ data });

  // Payée sur la caisse : le mouvement qui réduit le solde détenu par le
  // chauffeur est l'ombre de cette dépense, jamais une écriture autonome.
  const chauffeurId = saisie.data.surCaisseChauffeurId;
  if (chauffeurId) {
    await prisma.mouvementCaisse.create({
      data: {
        chauffeurId,
        type: "DEPENSE",
        montant: saisie.data.montant,
        devise: saisie.data.devise,
        montantGnf: data.montantGnf,
        motif: data.description,
        date: data.date,
        depenseId: depense.id,
      },
    });
    revalidatePath("/chauffeurs");
  }

  // Le taux réellement pratiqué alimente la référence de pré-remplissage.
  if (data.devise !== "GNF") await observerTaux(Number(data.montant), data.montantGnf);

  rafraichir(data.camionId, data.voyageId);
  return { ok: true };
}

export async function modifierDepense(
  id: string,
  _etat: EtatDepense,
  donnees: FormData,
): Promise<EtatDepense> {
  await droitEcriture();

  const saisie = schemaDepense.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatDepense>(saisie.error, donnees);

  const data = await donneesDepense(saisie.data);
  await prisma.depense.update({ where: { id }, data });

  // Le mouvement de caisse adossé à cette dépense doit suivre le montant
  // corrigé : sans cela, le solde du chauffeur reste sur l'ancienne valeur et
  // l'écart lui serait réclamé à tort.
  const lie = await prisma.mouvementCaisse.findUnique({ where: { depenseId: id } });
  if (lie) {
    await prisma.mouvementCaisse.update({
      where: { id: lie.id },
      data: {
        montant: saisie.data.montant,
        devise: saisie.data.devise,
        montantGnf: data.montantGnf,
        motif: data.description,
        date: data.date,
      },
    });
    revalidatePath("/chauffeurs");
  }

  rafraichir(data.camionId, data.voyageId);
  return { ok: true };
}

export async function supprimerDepense(id: string) {
  await droitEcriture();

  const depense = await prisma.depense.findUnique({
    where: { id },
    select: { camionId: true, voyageId: true, mouvementCaisse: { select: { id: true } } },
  });
  if (!depense) throw new Error("Dépense introuvable.");

  // Une dépense payée depuis la caisse chauffeur ne peut pas disparaître seule :
  // le solde de caisse deviendrait faux.
  if (depense.mouvementCaisse) {
    throw new Error(
      "Cette dépense est liée à un mouvement de caisse chauffeur : solder le mouvement d'abord.",
    );
  }

  await prisma.depense.delete({ where: { id } });
  rafraichir(depense.camionId, depense.voyageId);
}
