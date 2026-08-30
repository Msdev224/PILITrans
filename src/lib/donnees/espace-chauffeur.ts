import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * L'espace chauffeur est-il ouvert ?
 *
 * Un seul réglage commande deux choses indissociables : l'accès du chauffeur
 * à son écran de bord, et l'obligation de justifier ce qu'on lui remet. Tant
 * qu'il est fermé, l'argent donné est un forfait de voyage — le chauffeur ne
 * rend compte de rien, et les écrans du bureau n'affichent pas un « reste à
 * justifier » que personne n'a l'intention de solder.
 *
 * Fermé aussi quand aucune ligne de paramètres n'existe encore : une
 * exploitation qui n'a pas fini son installation n'ouvre pas son terrain.
 *
 * `cache()` déduplique l'appel sur un même rendu — la question se pose sur
 * presque chaque écran.
 */
export const espaceChauffeurActif = cache(async (): Promise<boolean> => {
  const parametres = await prisma.parametres.findFirst({
    select: { espaceChauffeurActif: true },
  });
  return parametres?.espaceChauffeurActif ?? false;
});
