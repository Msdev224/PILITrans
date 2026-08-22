"use server";

import { Devise } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionRequise } from "@/auth";
import { peut } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  dateOptionnelle,
  erreursFormulaire,
  nombreOptionnel,
  nombrePositif,
  texteOptionnel,
} from "@/lib/validation";

/**
 * Le chauffeur déclare ce qui lui a été prélevé, le gérant peut corriger.
 * Un chauffeur n'agit que sur SES missions.
 */
async function accesAuVoyage(voyageId: string) {
  const session = await sessionRequise();

  const voyage = await prisma.voyage.findUnique({ where: { id: voyageId } });
  if (!voyage) throw new Error("Voyage introuvable.");

  // Le chauffeur agit sur ses missions et seulement les siennes ; tout autre
  // profil doit détenir le droit d'écriture sur les voyages. Ne tester que le
  // cas « CHAUFFEUR » laisserait écrire les rôles en lecture seule.
  if (session.user.role === "CHAUFFEUR") {
    if (voyage.chauffeurId !== session.user.chauffeurId) {
      throw new Error("Cette mission ne vous est pas attribuée.");
    }
  } else if (!peut(session.user.role, "voyages.ecrire")) {
    throw new Error("Vous n'avez pas les droits pour cette action.");
  }

  return voyage;
}

const schemaPrelevement = z
  .object({
    voyageId: z.string().min(1),
    /** Marchandise concernée : un poste retient sur un article précis. */
    ligneId: z.string().min(1, "Marchandise requise"),
    quantite: nombrePositif("Quantité prélevée requise"),
    lieu: z.string().trim().min(1, "Lieu du prélèvement requis"),
    /** Pays du poste. Choisi dans la liste tenue par l'exploitation. */
    paysId: texteOptionnel,
    motif: texteOptionnel,
    montant: nombreOptionnel,
    devise: z.nativeEnum(Devise),
    montantGnf: nombreOptionnel,
    reference: texteOptionnel,
    date: dateOptionnelle,
  })
  .refine((p) => p.devise === "GNF" || !((p.montant ?? 0) > 0) || (p.montantGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF du montant en CFA",
    path: ["montantGnf"],
  });

export interface EtatPrelevement {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

function rafraichir(voyageId: string) {
  revalidatePath(`/voyages/${voyageId}`);
  revalidatePath("/voyages");
  revalidatePath("/chauffeur");
  revalidatePath("/alertes");
  revalidatePath("/");
}

export async function declarerPrelevement(
  _etat: EtatPrelevement,
  donnees: FormData,
): Promise<EtatPrelevement> {
  const saisie = schemaPrelevement.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatPrelevement>(saisie.error, donnees);

  const voyage = await accesAuVoyage(saisie.data.voyageId);

  // La ligne doit appartenir à cette mission : sans cette vérification, un
  // prélèvement pourrait être imputé à la marchandise d'un autre voyage.
  const ligne = await prisma.ligneMarchandise.findUnique({
    where: { id: saisie.data.ligneId },
    include: { unite: { select: { symbole: true } } },
  });
  if (!ligne || ligne.voyageId !== voyage.id) {
    return { erreur: "Marchandise introuvable sur cette mission." };
  }

  // On ne peut pas prélever plus que ce qui a été chargé.
  const recue = ligne.quantiteRecue != null ? Number(ligne.quantiteRecue) : null;
  if (recue != null) {
    const dejaPreleve = await prisma.prelevementDouane.aggregate({
      where: { ligneId: ligne.id },
      _sum: { quantite: true },
    });
    const cumule = Number(dejaPreleve._sum?.quantite ?? 0);
    if (cumule + saisie.data.quantite > recue) {
      const u = ligne.unite.symbole;
      return {
        erreur: `Le prélèvement dépasse la quantité chargée de « ${ligne.designation} ».`,
        champs: { quantite: `Chargé : ${recue} ${u} · déjà prélevé : ${cumule} ${u}` },
        valeurs: { quantite: String(saisie.data.quantite) },
      };
    }
  }

  const montant = saisie.data.montant ?? null;
  await prisma.prelevementDouane.create({
    data: {
      voyageId: voyage.id,
      ligneId: ligne.id,
      quantite: saisie.data.quantite,
      lieu: saisie.data.lieu,
      paysId: saisie.data.paysId || null,
      motif: saisie.data.motif ?? null,
      montant,
      devise: saisie.data.devise,
      montantGnf:
        montant == null ? null : saisie.data.devise === "GNF" ? montant : (saisie.data.montantGnf ?? 0),
      reference: saisie.data.reference ?? null,
      date: saisie.data.date ?? new Date(),
    },
  });

  rafraichir(voyage.id);
  return { ok: true };
}

export async function supprimerPrelevement(id: string) {
  const prelevement = await prisma.prelevementDouane.findUnique({
    where: { id },
    select: { voyageId: true },
  });
  if (!prelevement) throw new Error("Prélèvement introuvable.");

  await accesAuVoyage(prelevement.voyageId);
  await prisma.prelevementDouane.delete({ where: { id } });
  rafraichir(prelevement.voyageId);
}
