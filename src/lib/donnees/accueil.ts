import "server-only";

import { ACCUEIL_DEFAUT } from "@/lib/accueil-defaut";
import { prisma } from "@/lib/prisma";

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
}

/** Un champ vide ou absent retombe sur le libellé d'origine. */
const ou = (valeur: string | null | undefined, defaut: string) =>
  valeur && valeur.trim() ? valeur.trim() : defaut;

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
    },
  });

  return {
    raisonSociale: ou(p?.raisonSociale, "PILITrans"),
    surtitre: ou(p?.accueilSurtitre, ACCUEIL_DEFAUT.surtitre),
    titre: ou(p?.accueilTitre, ACCUEIL_DEFAUT.titre),
    texte: ou(p?.accueilTexte, ACCUEIL_DEFAUT.texte),
    mention: ou(p?.accueilMention, ACCUEIL_DEFAUT.mention),
    sousTitre: ou(p?.connexionSousTitre, ACCUEIL_DEFAUT.sousTitre),
    afficherDemo: p?.accueilAfficherDemo ?? false,
  };
}
