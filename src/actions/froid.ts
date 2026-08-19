"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionRequise } from "@/auth";
import { conformiteFroid } from "@/lib/calculs";
import { peut } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { erreursFormulaire, nombreOptionnel } from "@/lib/validation";

/**
 * Relevé de température : saisi par le chauffeur sur SA mission, ou par le
 * gérant. Sans cet écran, la chaîne du froid ne pouvait jamais être alimentée
 * alors qu'elle est le cœur du métier frigorifique.
 */
async function accesAuVoyage(voyageId: string) {
  const session = await sessionRequise();

  const voyage = await prisma.voyage.findUnique({
    where: { id: voyageId },
    include: { camion: { select: { refrigere: true } } },
  });
  if (!voyage) throw new Error("Voyage introuvable.");

  // Un chauffeur ne relève que ses propres missions.
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

  // Pas de chaîne du froid sur un véhicule non frigorifique (règle CLAUDE.md).
  if (!voyage.camion.refrigere) {
    throw new Error("Ce camion n'est pas frigorifique : aucun relevé n'est attendu.");
  }

  return voyage;
}

/** Température signée : le surgelé se relève en négatif. */
const temperature = z.preprocess(
  (v) => (v === undefined || v === null || String(v).trim() === "" ? undefined : Number(String(v).replace(",", "."))),
  z.number({ message: "Température requise" }),
);

const schemaReleve = z.object({
  voyageId: z.string().min(1),
  temperature,
  consigne: nombreOptionnel,
});

export interface EtatReleve {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

export async function enregistrerReleve(
  _etat: EtatReleve,
  donnees: FormData,
): Promise<EtatReleve> {
  const saisie = schemaReleve.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatReleve>(saisie.error, donnees);

  const voyage = await accesAuVoyage(saisie.data.voyageId);
  const parametres = await prisma.parametres.findFirst();

  // La consigne du relevé prime, sinon celle des Paramètres.
  const consigne =
    saisie.data.consigne ??
    (parametres?.consigneFroidDefaut != null ? Number(parametres.consigneFroidDefaut) : null);
  const tolerance = parametres?.toleranceFroid != null ? Number(parametres.toleranceFroid) : 1;

  // La conformité est calculée, jamais saisie : elle doit toujours découler
  // de l'écart réel à la consigne.
  const conformite =
    consigne != null ? conformiteFroid(saisie.data.temperature, consigne, tolerance) : "CONFORME";

  await prisma.releveTemperature.create({
    data: {
      voyageId: voyage.id,
      temperature: saisie.data.temperature,
      consigne,
      conformite,
    },
  });

  revalidatePath("/chauffeur");
  revalidatePath(`/voyages/${voyage.id}`);
  revalidatePath(`/camions/${voyage.camionId}`);
  revalidatePath("/alertes");
  revalidatePath("/");

  return { ok: true };
}
