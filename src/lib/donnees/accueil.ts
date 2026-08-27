import "server-only";

import { cache } from "react";

import { ACCUEIL_DEFAUT } from "@/lib/accueil-defaut";
import { urlLogo } from "@/lib/images";
import { prisma } from "@/lib/prisma";
import { NOM_APPLICATION } from "@/lib/marque";

/**
 * Textes de l'écran de connexion, lus depuis les Paramètres.
 *
 * Ils vivent en base pour que le gérant puisse les changer sans toucher au
 * code — nom de l'exploitation, accroche, corridor desservi. Un champ laissé
 * vide retombe sur `ACCUEIL_DEFAUT`, plutôt que d'afficher un écran nu.
 */

export { ACCUEIL_DEFAUT };

export interface TextesAccueil {
  raisonSociale: string;
  surtitre: string;
  titre: string;
  texte: string;
  mention: string;
  sousTitre: string;
  afficherDemo: boolean;
  /** Logo de l'entreprise, s'il a été téléversé. */
  logoUrl: string | null;
}

/** Un champ vide ou absent retombe sur le libellé d'origine. */
const ou = (valeur: string | null | undefined, defaut: string) =>
  valeur && valeur.trim() ? valeur.trim() : defaut;

/**
 * Accroche affichée sous le nom de l'exploitation.
 *
 * Le surtitre porte souvent « Entreprise · Métier » : seule la seconde moitié
 * a du sens sous un nom déjà écrit juste au-dessus.
 */
export function accroche(surtitre: string): string {
  return surtitre.includes("·") ? (surtitre.split("·").pop()?.trim() ?? surtitre) : surtitre;
}

export interface MarqueEntreprise {
  raisonSociale: string;
  accroche: string;
  logoUrl: string | null;
  /** Marque carrée, seule lisible quand le rail se réduit à des icônes. */
  iconeUrl: string | null;
}

/**
 * Identité affichée en tête du rail, sur tous les écrans du cockpit.
 *
 * Elle était écrite en dur — le nom du produit, pas celui de l'exploitation.
 * `cache` évite une requête par écran : le rail est monté à chaque navigation.
 */
export const marqueEntreprise = cache(async (): Promise<MarqueEntreprise> => {
  const p = await prisma.parametres.findFirst({
    select: { raisonSociale: true, accueilSurtitre: true, logoUrl: true, iconeUrl: true },
  });

  const raisonSociale = ou(p?.raisonSociale, NOM_APPLICATION);
  const tiree = accroche(ou(p?.accueilSurtitre, ACCUEIL_DEFAUT.surtitre));

  /*
   * Le surtitre ne porte pas toujours de métier : réduit au seul nom de
   * l'exploitation, il se répéterait sous le titre. On retombe alors sur
   * l'accroche d'origine, qui dit au moins ce que fait l'application.
   */
  const nu = (v: string) => v.toLowerCase().replace(/\s+/g, "");

  return {
    raisonSociale,
    accroche: nu(tiree) === nu(raisonSociale) ? accroche(ACCUEIL_DEFAUT.surtitre) : tiree,
    // URL déjà dimensionnée : le rail est un composant client, il ne doit pas
    // importer `images` — qui tire `node:crypto` pour la signature Cloudinary.
    logoUrl: urlLogo(p?.logoUrl, 220),
    iconeUrl: urlLogo(p?.iconeUrl, 64),
  };
});

export async function textesAccueil(): Promise<TextesAccueil> {
  // La page de connexion est publique : elle ne lit ici que des libellés,
  // jamais un identifiant ni un secret.
  const p = await prisma.parametres.findFirst({
    select: {
      raisonSociale: true,
      accueilSurtitre: true,
      accueilTitre: true,
      accueilTexte: true,
      accueilMention: true,
      connexionSousTitre: true,
      accueilAfficherDemo: true,
      logoUrl: true,
    },
  });

  return {
    raisonSociale: ou(p?.raisonSociale, NOM_APPLICATION),
    surtitre: ou(p?.accueilSurtitre, ACCUEIL_DEFAUT.surtitre),
    titre: ou(p?.accueilTitre, ACCUEIL_DEFAUT.titre),
    texte: ou(p?.accueilTexte, ACCUEIL_DEFAUT.texte),
    mention: ou(p?.accueilMention, ACCUEIL_DEFAUT.mention),
    sousTitre: ou(p?.connexionSousTitre, ACCUEIL_DEFAUT.sousTitre),
    afficherDemo: p?.accueilAfficherDemo ?? false,
    logoUrl: p?.logoUrl ?? null,
  };
}
