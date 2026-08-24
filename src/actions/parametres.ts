"use server";

import { Devise } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigerPermission } from "@/lib/autorisation";
import { difference, journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { caseACocher, dateOptionnelle, erreursFormulaire, nombreOptionnel, telephoneOptionnel, texteOptionnel } from "@/lib/validation";

/** Garde d'écriture du module — voir la matrice dans `src/lib/permissions.ts`. */
async function droitEcriture() {
  return exigerPermission("parametres.ecrire");
}

/** Nombre pouvant être négatif : une consigne de froid vaut souvent −18 °C. */
const nombreSigne = z.preprocess(
  (v) => (v === undefined || v === null || String(v).trim() === "" ? undefined : Number(String(v).replace(",", ".").replace(/\s/g, ""))),
  z.number({ message: "Nombre attendu" }).optional(),
);

const schemaParametres = z.object({
  // Identité — reprise telle quelle sur les factures.
  raisonSociale: z.string().trim().min(1, "Raison sociale requise"),
  adresse: texteOptionnel,
  telephone: telephoneOptionnel,
  email: texteOptionnel.pipe(z.string().email("Adresse e-mail invalide").optional()),
  rccm: texteOptionnel,
  nif: texteOptionnel,
  logoUrl: texteOptionnel,

  // Paiement
  orangeMoney: texteOptionnel,
  banque: texteOptionnel,
  compteBancaire: texteOptionnel,

  // Facturation
  prefixeFacture: z.string().trim().min(1, "Préfixe requis").max(8, "8 caractères maximum"),
  tvaTaux: nombreOptionnel.pipe(z.number().max(100, "Taux impossible").optional()),
  delaiPaiementJours: nombreOptionnel.pipe(z.number().int().positive("Délai requis").optional()),
  conditionsPaiement: texteOptionnel,

  // Modules
  transportPersonnesActif: caseACocher,

  // Caisse
  soldeCaisseInitial: nombreOptionnel,
  dateSoldeInitial: dateOptionnelle,

  // Devises
  deviseBase: z.nativeEnum(Devise),
  tauxReferenceXof: nombreOptionnel,

  // Chaîne du froid & seuils d'alerte
  consigneFroidDefaut: nombreSigne,
  toleranceFroid: nombreOptionnel,
  rappelEcheanceJours: nombreOptionnel.pipe(z.number().int().positive("Rappel requis").optional()),
  seuilConsoAnormale: nombreOptionnel,

  // Notifications SMS
  smsActif: caseACocher,
  /*
   * Nom d'expéditeur Nimba.
   *
   * Onze caractères alphanumériques au plus, sans espace ni accent : c'est la
   * limite de la norme, et Nimba refuse tout l'envoi si elle est dépassée. Le
   * refus arrive côté opérateur, longtemps après la saisie — autant le dire
   * ici, où la correction est immédiate.
   */
  smsExpediteur: texteOptionnel.refine(
    (v) => !v || (v.length <= 11 && /^[A-Za-z0-9]+$/.test(v)),
    { message: "11 caractères maximum, lettres et chiffres uniquement, sans espace ni accent." },
  ),
  urlApplication: texteOptionnel,
  smsChauffeurAffectation: caseACocher,
  smsClientDepart: caseACocher,
  smsClientArrivee: caseACocher,
  smsClientLivraison: caseACocher,
  smsClientFacture: caseACocher,
  smsClientRelance: caseACocher,
  whatsappActif: caseACocher,

  // Écran d'accueil / connexion
  accueilSurtitre: texteOptionnel,
  accueilTitre: texteOptionnel,
  accueilTexte: texteOptionnel,
  accueilMention: texteOptionnel,
  connexionSousTitre: texteOptionnel,
  accueilAfficherDemo: caseACocher,
  afficherCodeLivraison: caseACocher,
});

export interface EtatParametres {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

export async function enregistrerParametres(
  _etat: EtatParametres,
  donnees: FormData,
): Promise<EtatParametres> {
  await droitEcriture();

  const saisie = schemaParametres.safeParse(Object.fromEntries(donnees));
  if (!saisie.success) return erreursFormulaire<EtatParametres>(saisie.error, donnees);

  const d = saisie.data;
  const valeurs = {
    raisonSociale: d.raisonSociale,
    adresse: d.adresse ?? null,
    telephone: d.telephone ?? null,
    email: d.email ?? null,
    rccm: d.rccm ?? null,
    nif: d.nif ?? null,
    logoUrl: d.logoUrl ?? null,
    orangeMoney: d.orangeMoney ?? null,
    banque: d.banque ?? null,
    compteBancaire: d.compteBancaire ?? null,
    prefixeFacture: d.prefixeFacture.toUpperCase(),
    tvaTaux: d.tvaTaux ?? 0,
    delaiPaiementJours: d.delaiPaiementJours ?? 14,
    conditionsPaiement: d.conditionsPaiement ?? null,
    transportPersonnesActif: d.transportPersonnesActif,
    soldeCaisseInitial: d.soldeCaisseInitial ?? null,
    dateSoldeInitial: d.dateSoldeInitial ?? null,
    deviseBase: d.deviseBase,
    tauxReferenceXof: d.tauxReferenceXof ?? null,
    accueilSurtitre: d.accueilSurtitre ?? null,
    accueilTitre: d.accueilTitre ?? null,
    accueilTexte: d.accueilTexte ?? null,
    accueilMention: d.accueilMention ?? null,
    connexionSousTitre: d.connexionSousTitre ?? null,
    accueilAfficherDemo: d.accueilAfficherDemo,
    afficherCodeLivraison: d.afficherCodeLivraison,
    whatsappActif: d.whatsappActif,
    consigneFroidDefaut: d.consigneFroidDefaut ?? null,
    toleranceFroid: d.toleranceFroid ?? null,
    rappelEcheanceJours: d.rappelEcheanceJours ?? 30,
    seuilConsoAnormale: d.seuilConsoAnormale ?? null,
    smsActif: d.smsActif,
    smsExpediteur: d.smsExpediteur ?? null,
    urlApplication: d.urlApplication ?? null,
    smsChauffeurAffectation: d.smsChauffeurAffectation,
    smsClientDepart: d.smsClientDepart,
    smsClientArrivee: d.smsClientArrivee,
    smsClientLivraison: d.smsClientLivraison,
    smsClientFacture: d.smsClientFacture,
    smsClientRelance: d.smsClientRelance,
  };

  // Table à ligne unique : on met à jour si elle existe, on la crée sinon.
  const existant = await prisma.parametres.findFirst({ select: { id: true } });
  if (existant) {
    await prisma.parametres.update({ where: { id: existant.id }, data: valeurs });

  /*
   * Les paramètres décident du comportement de toute l'application : délai de
   * paiement, taux de référence, seuils d'alerte, envoi des SMS. Un chiffre
   * changé ici déplace des marges et des échéances sans qu'aucune écriture
   * n'apparaisse ailleurs — d'où la trace, avec l'avant et l'après.
   */
  const change = difference(
    existant as unknown as Record<string, unknown>,
    valeurs as Record<string, unknown>,
  );
  if (change) {
    await journaliser({
      action: "parametres.modifies",
      objet: "Parametres",
      objetId: existant.id,
      libelle: `Paramètres modifiés : ${Object.keys(change.apres).join(", ")}`,
      avant: change.avant,
      apres: change.apres,
    });
  }
  } else {
    await prisma.parametres.create({ data: valeurs });
  }

  // Les paramètres irriguent factures, alertes et conversions : on rafraîchit large.
  revalidatePath("/", "layout");
  // La page de connexion affiche ces textes et n'est pas sous le layout du
  // cockpit : sans cette invalidation, elle garderait l'ancienne version.
  revalidatePath("/connexion");
  revalidatePath("/caisse");
  revalidatePath("/camions");
  return { ok: true };
}
