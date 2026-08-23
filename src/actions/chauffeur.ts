"use server";

import { Devise, StatutVoyage, TypeDepense } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sessionRequise } from "@/auth";
import { observerTaux } from "@/lib/donnees/taux";
import { prisma } from "@/lib/prisma";
import { notifierEtapeVoyage } from "@/lib/sms/declencheurs";
import { synchroniserCamion } from "@/lib/donnees/synchronisation";
import { CHAMP_SAISIE, instantSaisie } from "@/lib/chauffeur/operations";
import { erreursFormulaire, nombreOptionnel, nombrePositif, texteOptionnel } from "@/lib/validation";

/**
 * Un chauffeur n'agit que sur SES missions. On vérifie systématiquement que le
 * voyage visé lui appartient — l'identifiant venant du formulaire n'est jamais
 * digne de confiance.
 */
async function missionDuChauffeur(voyageId: string) {
  const session = await sessionRequise();
  const chauffeurId = session.user.chauffeurId;

  if (session.user.role !== "CHAUFFEUR" || !chauffeurId) {
    throw new Error("Action réservée au chauffeur connecté.");
  }

  const voyage = await prisma.voyage.findUnique({ where: { id: voyageId } });
  if (!voyage || voyage.chauffeurId !== chauffeurId) {
    throw new Error("Cette mission ne vous est pas attribuée.");
  }

  return { voyage, chauffeurId };
}

export interface EtatChauffeur {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

/**
 * Instant à retenir pour une saisie.
 *
 * Une saisie faite lundi sur la route et remontée mercredi au retour du
 * réseau doit rester datée de lundi : sinon le gasoil change de mois, les
 * jours de mission se comptent faux et la marge du mois bouge après coup.
 * La valeur vient du téléphone, donc `instantSaisie` la borne.
 */
function quand(donnees?: FormData): Date {
  const valeur = donnees?.get(CHAMP_SAISIE);
  return instantSaisie(typeof valeur === "string" ? valeur : null);
}

function rafraichir(voyageId: string) {
  revalidatePath("/chauffeur");
  revalidatePath("/voyages");
  revalidatePath(`/voyages/${voyageId}`);
  revalidatePath("/");
}

// ------------------------------------------------------------
//  Avancement de la mission
// ------------------------------------------------------------

/**
 * Chaque cran de la mission pose une date ET un relevé de compteur.
 *
 * Le compteur à chaque étape est ce qui remplace la distance saisie à la
 * création : approche à vide jusqu'au chargement, trajet en charge,
 * déchargement. Sans lui, le coût au kilomètre reposerait sur une estimation
 * faite avant le départ, que personne ne corrige jamais.
 */
const SUITE: Partial<Record<StatutVoyage, { statut: StatutVoyage; champDate: string; champKm: string }>> = {
  PLANIFIE: {
    statut: "EN_ATTENTE_CHARGEMENT",
    champDate: "dateArriveeChargement",
    champKm: "kmArriveeChargement",
  },
  EN_ATTENTE_CHARGEMENT: { statut: "EN_COURS", champDate: "dateChargement", champKm: "kmChargement" },
  EN_COURS: {
    statut: "ARRIVE_DESTINATION",
    champDate: "dateArriveeDestination",
    champKm: "kmArriveeDestination",
  },
  ARRIVE_DESTINATION: {
    statut: "EN_DECHARGEMENT",
    champDate: "dateDechargement",
    champKm: "kmDechargement",
  },
  EN_DECHARGEMENT: { statut: "TERMINE", champDate: "dateArrivee", champKm: "kmArrivee" },
};

/**
 * Relevé de compteur envoyé avec le cran d'étape.
 *
 * Un compteur ne recule pas. Une valeur inférieure au dernier relevé connu
 * est une faute de frappe : la retenir donnerait une distance négative, donc
 * un coût au kilomètre absurde sur toute la période. On la refuse plutôt que
 * de bloquer le chauffeur — l'étape passe, le relevé est ignoré.
 */
function compteurValide(donnees: FormData | undefined, plancher: number | null): number | null {
  const brut = donnees?.get("compteur");
  if (typeof brut !== "string" || brut.trim() === "") return null;

  const valeur = Number(brut.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(valeur) || valeur <= 0) return null;

  const arrondi = Math.round(valeur);
  if (plancher != null && arrondi < plancher) return null;
  return arrondi;
}

export async function avancerMission(voyageId: string, donnees?: FormData) {
  const { voyage } = await missionDuChauffeur(voyageId);

  const suite = SUITE[voyage.statut];
  if (!suite) throw new Error("Cette mission est déjà clôturée.");

  const champ = suite.champDate as keyof typeof voyage;
  const dejaPosee = voyage[champ] != null;

  // Le compteur ne peut pas être inférieur au dernier relevé de la mission.
  const dernierKm = [
    voyage.kmDechargement,
    voyage.kmArriveeDestination,
    voyage.kmChargement,
    voyage.kmArriveeChargement,
    voyage.kmDepart,
  ].find((v) => v != null);
  const compteur = compteurValide(donnees, dernierKm ?? null);

  await prisma.voyage.update({
    where: { id: voyageId },
    data: {
      statut: suite.statut,
      ...(dejaPosee ? {} : { [suite.champDate]: quand(donnees) }),
      ...(compteur != null ? { [suite.champKm]: compteur } : {}),
    },
  });

  await synchroniserCamion(voyage.camionId);
  await notifierEtapeVoyage(voyageId, suite.statut);
  rafraichir(voyageId);
}

/**
 * Une rotation de plus sur la mission du jour (bennes).
 * Le chauffeur appuie une fois par aller-retour : c'est la seule saisie
 * praticable quand il en fait huit dans la journée. La recette suit
 * automatiquement si un tarif par rotation est défini.
 */
export async function ajouterRotation(voyageId: string, _donnees?: FormData) {
  const { voyage } = await missionDuChauffeur(voyageId);

  const nbRotations = voyage.nbRotations + 1;
  const tarif = voyage.tarifRotation != null ? Number(voyage.tarifRotation) : null;

  await prisma.voyage.update({
    where: { id: voyageId },
    data: {
      nbRotations,
      ...(tarif != null && tarif > 0
        ? {
            recette: tarif * nbRotations,
            // L'équivalent GNF ne se recalcule que si la mission est en GNF :
            // en devise, il a été figé au taux réel et ne doit pas bouger.
            ...(voyage.devise === "GNF" ? { recetteGnf: tarif * nbRotations } : {}),
          }
        : {}),
    },
  });

  rafraichir(voyageId);
}

// ------------------------------------------------------------
//  Quantités : chargement puis livraison
// ------------------------------------------------------------

const schemaQuantite = z.object({
  voyageId: z.string().min(1),
  /** Marchandise concernée : le chauffeur confirme article par article. */
  ligneId: z.string().min(1, "Marchandise requise"),
  quantite: nombrePositif("Quantité requise"),
});

/**
 * Marchandise de la mission en cours du chauffeur.
 *
 * Le contrôle d'appartenance est fait ici : une ligne d'un autre voyage ne
 * doit pas pouvoir être modifiée en changeant l'identifiant du formulaire.
 */
async function ligneDeLaMission(voyageId: string, ligneId: string) {
  const ligne = await prisma.ligneMarchandise.findUnique({
    where: { id: ligneId },
    include: { unite: { select: { symbole: true } } },
  });
  if (!ligne || ligne.voyageId !== voyageId) {
    throw new Error("Marchandise introuvable sur cette mission.");
  }
  return ligne;
}

export async function confirmerChargement(
  _etat: EtatChauffeur,
  donnees: FormData,
): Promise<EtatChauffeur> {
  const saisie = schemaQuantite.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatChauffeur>(saisie.error, donnees);

  await missionDuChauffeur(saisie.data.voyageId);
  const ligne = await ligneDeLaMission(saisie.data.voyageId, saisie.data.ligneId);
  await prisma.ligneMarchandise.update({
    where: { id: ligne.id },
    data: { quantiteRecue: saisie.data.quantite },
  });

  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

export async function confirmerLivraison(
  _etat: EtatChauffeur,
  donnees: FormData,
): Promise<EtatChauffeur> {
  const saisie = schemaQuantite.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatChauffeur>(saisie.error, donnees);

  await missionDuChauffeur(saisie.data.voyageId);
  const ligne = await ligneDeLaMission(saisie.data.voyageId, saisie.data.ligneId);

  // Livrer plus que ce qui a été chargé est une erreur de saisie, pas un gain.
  const recue = ligne.quantiteRecue != null ? Number(ligne.quantiteRecue) : null;
  if (recue != null && saisie.data.quantite > recue) {
    return {
      erreur: `« ${ligne.designation} » : la quantité livrée dépasse celle reçue au chargement.`,
      champs: { quantite: `Reçu au chargement : ${recue} ${ligne.unite.symbole}` },
      valeurs: { quantite: String(saisie.data.quantite) },
    };
  }

  await prisma.ligneMarchandise.update({
    where: { id: ligne.id },
    data: { quantiteLivree: saisie.data.quantite },
  });

  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

// ------------------------------------------------------------
//  Arrêt / changement de destination
// ------------------------------------------------------------

const schemaArret = z.object({
  voyageId: z.string().min(1),
  villeDepart: z.string().trim().min(1, "Ville de départ requise"),
  villeArrivee: z.string().trim().min(1, "Destination requise"),
  motif: texteOptionnel,
  // Le compteur fait l'arrêt : sans relevé, on ne sait pas où le trajet s'est
  // coupé, et les kilomètres à vide ne se séparent plus de ceux en charge.
  kmDepart: nombrePositif("Relevé du compteur requis"),
  carburantRestantDepart: nombreOptionnel,
  changementDestination: z.preprocess((v) => v === "true" || v === "on", z.boolean()),
});

export async function signalerArret(
  _etat: EtatChauffeur,
  donnees: FormData,
): Promise<EtatChauffeur> {
  const saisie = schemaArret.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatChauffeur>(saisie.error, donnees);

  await missionDuChauffeur(saisie.data.voyageId);

  const dernier = await prisma.etapeVoyage.findFirst({
    where: { voyageId: saisie.data.voyageId },
    orderBy: { ordre: "desc" },
    select: { ordre: true },
  });

  await prisma.etapeVoyage.create({
    data: {
      voyageId: saisie.data.voyageId,
      ordre: (dernier?.ordre ?? 0) + 1,
      type: saisie.data.changementDestination ? "CHANGEMENT_DESTINATION" : "ARRET",
      villeDepart: saisie.data.villeDepart,
      villeArrivee: saisie.data.villeArrivee,
      motif: saisie.data.motif ?? null,
      kmDepart: saisie.data.kmDepart != null ? Math.round(saisie.data.kmDepart) : null,
      carburantRestantDepart: saisie.data.carburantRestantDepart ?? null,
      departLe: quand(donnees),
    },
  });

  // Un changement de destination réécrit la destination de la mission.
  if (saisie.data.changementDestination) {
    await prisma.voyage.update({
      where: { id: saisie.data.voyageId },
      data: { villeArrivee: saisie.data.villeArrivee },
    });
  }

  rafraichir(saisie.data.voyageId);
  return { ok: true };
}

// ------------------------------------------------------------
//  Dépense de terrain
// ------------------------------------------------------------

const TYPES_GASOIL: string[] = ["GASOIL_TRACTEUR", "GASOIL_GROUPE_FROID"];

const schemaDepenseChauffeur = z
  .object({
    voyageId: z.string().min(1),
    type: z.nativeEnum(TypeDepense),
    montant: nombrePositif("Montant requis"),
    devise: z.nativeEnum(Devise),
    montantGnf: nombreOptionnel,
    litres: nombreOptionnel,
    releveCompteur: nombreOptionnel,
    description: texteOptionnel,
    /** La dépense a-t-elle été payée sur la caisse remise au chauffeur ? */
    surCaisse: z.preprocess((v) => v === "true" || v === "on", z.boolean()),
  })
  .refine((d) => d.devise === "GNF" || (d.montantGnf ?? 0) > 0, {
    message: "Saisir l'équivalent en GNF",
    path: ["montantGnf"],
  })
  .refine((d) => !TYPES_GASOIL.includes(d.type) || (d.litres ?? 0) > 0, {
    message: "Saisir les litres",
    path: ["litres"],
  });

export async function saisirDepense(
  _etat: EtatChauffeur,
  donnees: FormData,
): Promise<EtatChauffeur> {
  const saisie = schemaDepenseChauffeur.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatChauffeur>(saisie.error, donnees);

  const { voyage, chauffeurId } = await missionDuChauffeur(saisie.data.voyageId);
  const montantGnf = saisie.data.devise === "GNF" ? saisie.data.montant : (saisie.data.montantGnf ?? 0);

  if (saisie.data.devise !== "GNF") await observerTaux(saisie.data.montant, montantGnf);

  const depense = await prisma.depense.create({
    data: {
      type: saisie.data.type,
      montant: saisie.data.montant,
      devise: saisie.data.devise,
      montantGnf,
      litres: saisie.data.litres ?? null,
      releveCompteur: saisie.data.releveCompteur != null ? Math.round(saisie.data.releveCompteur) : null,
      description: saisie.data.description ?? null,
      date: quand(donnees),
      voyageId: voyage.id,
      camionId: voyage.camionId,
    },
  });

  // Payée sur la caisse : le mouvement correspondant réduit le solde détenu.
  if (saisie.data.surCaisse) {
    await prisma.mouvementCaisse.create({
      data: {
        chauffeurId,
        type: "DEPENSE",
        montant: saisie.data.montant,
        devise: saisie.data.devise,
        montantGnf,
        motif: saisie.data.description ?? null,
        date: quand(donnees),
        depenseId: depense.id,
      },
    });
  }

  rafraichir(voyage.id);
  return { ok: true };
}
