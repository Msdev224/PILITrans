import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Écriture au journal des opérations.
 *
 * Un seul point d'appel, invoqué depuis les mutations sensibles : argent,
 * facturation, comptes, annulations. L'auteur est lu de la session — jamais
 * transmis par l'appelant, qui pourrait se tromper ou mentir.
 *
 * Le journal ne doit JAMAIS faire échouer l'opération qu'il trace : une panne
 * d'écriture de trace ne peut pas empêcher un règlement d'être enregistré.
 * Les erreurs sont donc avalées, et signalées en console.
 */

export interface EntreeJournal {
  /** Identifiant technique : `facture.paiement.enregistre`. */
  action: string;
  /** Type d'objet touché : `Facture`, `MouvementCaisse`, `Voyage`… */
  objet: string;
  objetId?: string | null;
  /** Phrase lisible, telle qu'elle s'affichera dans l'historique. */
  libelle: string;
  /** Montant concerné, pour retrouver une somme précise. */
  montantGnf?: number | null;
  /** Valeurs avant et après, sur une modification de champ sensible. */
  avant?: Record<string, unknown> | null;
  apres?: Record<string, unknown> | null;
}

export async function journaliser(entree: EntreeJournal): Promise<void> {
  const session = await auth().catch(() => null);
  const u = session?.user;

  // Le nom est figé : une trace dont l'auteur a été supprimé doit rester
  // lisible. Sans session, l'opération vient d'un script d'exploitation.
  const commun = {
    auteurNom: u?.name ?? "Système",
    auteurRole: u?.role ?? "SYSTEME",
    action: entree.action,
    objet: entree.objet,
    objetId: entree.objetId ?? null,
    libelle: entree.libelle,
    montantGnf: entree.montantGnf ?? null,
    avant: (entree.avant ?? undefined) as never,
    apres: (entree.apres ?? undefined) as never,
  };

  try {
    await prisma.journal.create({ data: { ...commun, auteurId: u?.id ?? null } });
  } catch {
    /*
     * Le rattachement au compte a échoué — session plus ancienne que le
     * compte, base restaurée, utilisateur supprimé entre-temps.
     *
     * On réécrit alors sans le lien, en gardant le nom. Perdre le lien est
     * acceptable ; perdre la trace ne l'est pas, et c'est précisément dans
     * ces situations troubles qu'on a besoin de savoir ce qui s'est passé.
     */
    try {
      await prisma.journal.create({ data: { ...commun, auteurId: null } });
    } catch (e) {
      // Dernier recours : le journal ne doit jamais faire échouer l'opération
      // qu'il trace. On le signale, bruyamment, sans interrompre.
      console.error("[journal] écriture impossible :", e);
    }
  }
}

/**
 * Champs modifiés entre deux états, montants convertis en nombres.
 *
 * Ne garde que ce qui a changé : un journal qui recopie l'objet entier à
 * chaque modification devient illisible et masque le champ qui compte.
 */
export function difference(
  avant: Record<string, unknown>,
  apres: Record<string, unknown>,
): { avant: Record<string, unknown>; apres: Record<string, unknown> } | null {
  const a: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};

  for (const cle of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
    const ancien = normaliser(avant[cle]);
    const nouveau = normaliser(apres[cle]);
    if (ancien !== nouveau) {
      a[cle] = ancien;
      b[cle] = nouveau;
    }
  }

  return Object.keys(a).length > 0 ? { avant: a, apres: b } : null;
}

/** Ramène Decimal, Date et objets à une forme comparable et sérialisable. */
function normaliser(valeur: unknown): unknown {
  if (valeur === null || valeur === undefined) return null;
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === "object" && "toString" in valeur) return String(valeur);
  return valeur;
}
