"use server";

import { Pays, StatutVoyage } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { suggestionTrajet, type Suggestion } from "@/lib/donnees/trajets";
import { exigerPermission } from "@/lib/autorisation";
import { prisma } from "@/lib/prisma";
import { notifierAffectationChauffeur, notifierEtapeVoyage } from "@/lib/sms/declencheurs";
import { synchroniserCamion } from "@/lib/donnees/synchronisation";
import { caseACocher, erreursFormulaire, nombreOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("voyages.ecrire");
}

// ------------------------------------------------------------
//  Validation
// ------------------------------------------------------------

/** Champ numérique de formulaire : "" → undefined, virgule décimale acceptée. */
const schemaVoyage = z
  .object({
    camionId: z.string().min(1, "Camion requis"),
    chauffeurId: z.string().min(1, "Chauffeur requis"),
    paysDepart: z.nativeEnum(Pays),
    villeDepart: z.string().trim().min(1, "Ville de départ requise"),
    paysArrivee: z.nativeEnum(Pays),
    villeArrivee: z.string().trim().min(1, "Ville d'arrivée requise"),
    client: z.string().trim().optional(),
    distanceKm: nombreOptionnel,
    dateDepart: z.coerce.date({ message: "Date de départ invalide" }),
    aVide: caseACocher,
    recette: nombreOptionnel,
    devise: z.enum(["GNF", "XOF"]),
    /** Bennes : nombre de rotations sur le même trajet dans la journée. */
    nbRotations: nombreOptionnel,
    /** Si renseigné, la recette vaut tarifRotation × nbRotations. */
    tarifRotation: nombreOptionnel,
    // Équivalent GNF saisi au taux réel du moment (cf. CLAUDE.md).
    recetteGnf: nombreOptionnel,
    statut: z.nativeEnum(StatutVoyage).default("PLANIFIE"),
  })
  .refine((v) => !(v.devise === "XOF" && (v.recette ?? 0) > 0 && !v.recetteGnf), {
    message: "Saisir l'équivalent en GNF de la recette en CFA",
    path: ["recetteGnf"],
  })
  .refine((v) => v.aVide || !!v.client, {
    message: "Client requis (sauf pour un trajet à vide)",
    path: ["client"],
  });

export interface EtatFormulaire {
  ok?: boolean;
  erreur?: string;
  /** Erreurs par champ, pour l'affichage sous les libellés. */
  champs?: Record<string, string>;
  /** Saisie renvoyée telle quelle : sans elle, un échec de validation
   *  viderait les champs non contrôlés (camion, chauffeur, date…). */
  valeurs?: Record<string, string>;
}


// ------------------------------------------------------------
//  Référence de voyage
//  Format repris du seed : « KD-2026-041 » (initiales du trajet, année, rang).
// ------------------------------------------------------------

const initiale = (ville: string) => (ville.trim()[0] ?? "X").toUpperCase();

async function referenceLibre(villeDepart: string, villeArrivee: string, date: Date) {
  const prefixe = `${initiale(villeDepart)}${initiale(villeArrivee)}-${date.getFullYear()}`;
  const existantes = await prisma.voyage.findMany({
    where: { reference: { startsWith: prefixe } },
    select: { reference: true },
  });

  const rangs = existantes
    .map((v) => Number.parseInt(v.reference.split("-")[2] ?? "", 10))
    .filter((r) => Number.isFinite(r));
  const rang = (rangs.length ? Math.max(...rangs) : 0) + 1;

  return `${prefixe}-${String(rang).padStart(3, "0")}`;
}

// ------------------------------------------------------------
//  Actions
// ------------------------------------------------------------

function donneesVoyage(saisie: z.infer<typeof schemaVoyage>) {
  const nbRotations = Math.max(Math.round(saisie.nbRotations ?? 1), 1);
  // Avec un tarif par rotation, la recette se déduit — saisir les deux
  // séparément finirait par les faire diverger.
  const recette =
    saisie.tarifRotation != null && saisie.tarifRotation > 0
      ? saisie.tarifRotation * nbRotations
      : (saisie.recette ?? 0);
  // En GNF, l'équivalent est le montant lui-même ; en devise, c'est la valeur
  // saisie par l'utilisateur au taux réel — jamais un taux recalculé.
  // En GNF l'équivalent est le montant lui-même ; en devise, c'est la valeur
  // saisie au taux réel. Avec un tarif par rotation en GNF, l'équivalent suit
  // la recette recalculée.
  const recetteGnf = saisie.devise === "GNF" ? recette : (saisie.recetteGnf ?? 0);

  return {
    camionId: saisie.camionId,
    chauffeurId: saisie.chauffeurId,
    paysDepart: saisie.paysDepart,
    villeDepart: saisie.villeDepart,
    paysArrivee: saisie.paysArrivee,
    villeArrivee: saisie.villeArrivee,
    client: saisie.client || null,
    distanceKm: saisie.distanceKm != null ? Math.round(saisie.distanceKm) : null,
    dateDepart: saisie.dateDepart,
    aVide: saisie.aVide,
    recette,
    devise: saisie.devise,
    recetteGnf,
    nbRotations,
    tarifRotation: saisie.tarifRotation ?? null,
    statut: saisie.statut,
  };
}

/**
 * Marchandises saisies dans le formulaire.
 *
 * Les champs sont répétés, une occurrence par ligne : `Object.fromEntries` n'en
 * garderait que la dernière. Il faut donc les lire par `getAll` et les
 * réassembler dans l'ordre.
 */
interface SaisieLigne {
  id: string | null;
  designation: string;
  uniteId: string;
  quantiteACharger: number | null;
  client: string | null;
}

function lignesDepuisFormulaire(donnees: FormData): SaisieLigne[] {
  const ids = donnees.getAll("ligneId").map(String);
  const designations = donnees.getAll("ligneDesignation").map(String);
  const unites = donnees.getAll("ligneUniteId").map(String);
  const quantites = donnees.getAll("ligneQuantite").map(String);
  const clients = donnees.getAll("ligneClient").map(String);

  return designations
    .map((designation, i) => {
      const brut = (quantites[i] ?? "").replace(",", ".").replace(/\s/g, "");
      const quantite = brut === "" ? null : Number(brut);
      return {
        id: ids[i] || null,
        designation: designation.trim(),
        uniteId: unites[i] ?? "",
        quantiteACharger: quantite !== null && Number.isFinite(quantite) ? quantite : null,
        client: (clients[i] ?? "").trim() || null,
      };
    })
    // Une ligne sans désignation ni unité est une saisie abandonnée.
    .filter((l) => l.designation !== "" && l.uniteId !== "");
}

/**
 * Aligne les marchandises d'un voyage sur ce que porte le formulaire.
 *
 * Les lignes existantes sont mises à jour plutôt que recréées : elles portent
 * les quantités constatées par le chauffeur et les prélèvements de douane, qui
 * seraient perdus par un simple « tout supprimer puis tout réécrire ».
 */
async function synchroniserLignes(voyageId: string, lignes: SaisieLigne[]) {
  const existantes = await prisma.ligneMarchandise.findMany({
    where: { voyageId },
    select: { id: true },
  });
  const conservees = new Set(lignes.map((l) => l.id).filter(Boolean) as string[]);

  await prisma.ligneMarchandise.deleteMany({
    where: { voyageId, id: { notIn: [...conservees] } },
  });
  void existantes;

  for (const [i, l] of lignes.entries()) {
    const valeurs = {
      designation: l.designation,
      uniteId: l.uniteId,
      quantiteACharger: l.quantiteACharger,
      client: l.client,
      ordre: (i + 1) * 10,
    };
    if (l.id && conservees.has(l.id)) {
      await prisma.ligneMarchandise.update({ where: { id: l.id }, data: valeurs });
    } else {
      await prisma.ligneMarchandise.create({ data: { ...valeurs, voyageId } });
    }
  }
}

function rafraichir(voyageId?: string) {
  revalidatePath("/voyages");
  revalidatePath("/");
  revalidatePath("/camions");
  if (voyageId) revalidatePath(`/voyages/${voyageId}`);
}

export async function creerVoyage(_etat: EtatFormulaire, donnees: FormData): Promise<EtatFormulaire> {
  await droitEcriture();

  const saisie = schemaVoyage.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatFormulaire>(saisie.error, donnees);

  const data = donneesVoyage(saisie.data);
  const reference = await referenceLibre(data.villeDepart, data.villeArrivee, data.dateDepart);

  const cree = await prisma.voyage.create({ data: { ...data, reference } });
  await synchroniserLignes(cree.id, lignesDepuisFormulaire(donnees));
  // Le parc reflète la mission : statut et compteur suivent.
  await synchroniserCamion(data.camionId);
  // Le chauffeur est prévenu de son affectation.
  await notifierAffectationChauffeur(cree.id);
  rafraichir();
  return { ok: true };
}

export async function modifierVoyage(
  id: string,
  _etat: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  await droitEcriture();

  const saisie = schemaVoyage.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatFormulaire>(saisie.error, donnees);

  const valeurs = donneesVoyage(saisie.data);
  const avant = await prisma.voyage.findUnique({ where: { id }, select: { camionId: true } });
  await prisma.voyage.update({ where: { id }, data: valeurs });
  await synchroniserLignes(id, lignesDepuisFormulaire(donnees));

  // Réaffecter la mission à un autre camion libère le précédent.
  await synchroniserCamion(valeurs.camionId);
  if (avant && avant.camionId !== valeurs.camionId) await synchroniserCamion(avant.camionId);
  rafraichir(id);
  return { ok: true };
}

/**
 * Avancement d'une mission. Chaque état pose la date correspondante, qui sert
 * ensuite aux calculs (attente de chargement, durée de mission).
 */
export async function changerStatutVoyage(id: string, statut: StatutVoyage) {
  await droitEcriture();

  const maintenant = new Date();
  const dates: Partial<Record<StatutVoyage, Record<string, Date>>> = {
    EN_ATTENTE_CHARGEMENT: { dateArriveeChargement: maintenant },
    EN_COURS: { dateChargement: maintenant },
    ARRIVE_DESTINATION: { dateArriveeDestination: maintenant },
    EN_DECHARGEMENT: { dateDechargement: maintenant },
    TERMINE: { dateArrivee: maintenant },
  };

  const voyage = await prisma.voyage.findUnique({ where: { id } });
  if (!voyage) throw new Error("Voyage introuvable.");

  // On ne réécrit pas une date déjà posée : un retour en arrière ne doit pas
  // effacer l'historique réel de la mission.
  const aPoser = Object.fromEntries(
    Object.entries(dates[statut] ?? {}).filter(
      ([champ]) => voyage[champ as keyof typeof voyage] == null,
    ),
  );

  await prisma.voyage.update({ where: { id }, data: { statut, ...aPoser } });
  await synchroniserCamion(voyage.camionId);
  // Le client suit sa marchandise étape par étape.
  await notifierEtapeVoyage(id, statut);
  rafraichir(id);
}

export async function supprimerVoyage(id: string) {
  await droitEcriture();

  const liens = await prisma.voyage.findUnique({
    where: { id },
    select: { camionId: true, _count: { select: { factures: true, depenses: true, etapes: true } } },
  });
  if (!liens) throw new Error("Voyage introuvable.");

  // Un voyage facturé ou déjà chiffré est annulé, pas effacé : les montants
  // engagés doivent rester traçables.
  const { factures, depenses, etapes } = liens._count;
  if (factures + depenses + etapes > 0) {
    await prisma.voyage.update({ where: { id }, data: { statut: "ANNULE" } });
  } else {
    await prisma.voyage.delete({ where: { id } });
  }
  await synchroniserCamion(liens.camionId);
  rafraichir();
}

/** Estimation distance / carburant / recette à partir des trajets passés. */
export async function proposerDepuisHistorique(
  depart: string,
  arrivee: string,
): Promise<Suggestion> {
  await droitEcriture();
  return suggestionTrajet(depart, arrivee);
}
