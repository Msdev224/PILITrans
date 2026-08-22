"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  compter,
  enfiler,
  identifiant,
  lister,
  marquerEchec,
  retirer,
} from "@/lib/chauffeur/file-attente";
import { CHAMP_SAISIE, type ActionDifferee, type OperationEnAttente } from "@/lib/chauffeur/operations";

interface Contexte {
  /** Saisies gardées sur l'appareil, en attente de réseau. */
  enAttente: OperationEnAttente[];
  /** Saisies refusées par le serveur : elles demandent une correction. */
  refusees: { libelle: string; erreur: string }[];
  enCours: boolean;
  /** Range une saisie et rend la main tout de suite. */
  differer: (action: ActionDifferee, libelle: string, donnees: FormData) => Promise<void>;
  /** Tente d'envoyer la file. Sans réseau, ne fait rien. */
  synchroniser: () => Promise<void>;
  oublierRefus: (index: number) => void;
}

const FileContexte = createContext<Contexte | null>(null);

export function useFile(): Contexte {
  const contexte = useContext(FileContexte);
  if (!contexte) throw new Error("useFile hors du fournisseur de file.");
  return contexte;
}

/** Les champs du formulaire, à plat. Les saisies de terrain n'ont pas de fichier. */
function aPlat(donnees: FormData): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const [cle, valeur] of donnees.entries()) {
    if (typeof valeur === "string") champs[cle] = valeur;
  }
  return champs;
}

export function FournisseurFile({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [enAttente, setEnAttente] = useState<OperationEnAttente[]>([]);
  const [refusees, setRefusees] = useState<{ libelle: string; erreur: string }[]>([]);
  const [enCours, setEnCours] = useState(false);

  const relire = useCallback(async () => setEnAttente(await lister()), []);

  const differer = useCallback(
    async (action: ActionDifferee, libelle: string, donnees: FormData) => {
      const saisieLe = String(donnees.get(CHAMP_SAISIE) ?? new Date().toISOString());
      await enfiler({ id: identifiant(), action, champs: aPlat(donnees), saisieLe, libelle, essais: 0 });
      await relire();
    },
    [relire],
  );

  const synchroniser = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const file = await lister();
    if (file.length === 0) return;

    setEnCours(true);
    let appliquee = false;

    // Une par une, dans l'ordre vécu : livrer avant d'avoir chargé n'a pas de
    // sens, et le serveur refuserait à juste titre.
    for (const operation of file) {
      try {
        const reponse = await fetch("/api/chauffeur/operations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: operation.id,
            action: operation.action,
            champs: operation.champs,
            saisieLe: operation.saisieLe,
          }),
        });
        const resultat = (await reponse.json()) as { ok?: boolean; definitif?: boolean; erreur?: string };

        if (resultat.ok) {
          await retirer(operation.id);
          appliquee = true;
          continue;
        }

        if (resultat.definitif) {
          // La renvoyer donnerait le même refus. On la sort de la file et on
          // le dit au chauffeur, sinon elle bloquerait toutes les suivantes.
          await retirer(operation.id);
          setRefusees((liste) => [...liste, { libelle: operation.libelle, erreur: resultat.erreur ?? "Refusée." }]);
          continue;
        }

        await marquerEchec(operation.id, resultat.erreur ?? "Envoi impossible.");
        break; // Panne passagère : on garde l'ordre, on réessaiera plus tard.
      } catch {
        // Réseau coupé en pleine synchronisation : le reste attend.
        break;
      }
    }

    await relire();
    setEnCours(false);
    if (appliquee) router.refresh();
  }, [relire, router]);

  useEffect(() => {
    void relire();
    void synchroniser();

    const auRetour = () => void synchroniser();
    window.addEventListener("online", auRetour);
    // Le retour d'un tunnel ne déclenche pas toujours « online » : on repasse
    // aussi quand l'écran redevient visible, et à intervalle régulier.
    const auReveil = () => {
      if (document.visibilityState === "visible") void synchroniser();
    };
    document.addEventListener("visibilitychange", auReveil);
    const minuterie = setInterval(() => void synchroniser(), 60_000);

    return () => {
      window.removeEventListener("online", auRetour);
      document.removeEventListener("visibilitychange", auReveil);
      clearInterval(minuterie);
    };
  }, [relire, synchroniser]);

  // Une saisie non partie ne doit pas disparaître avec l'onglet sans un mot.
  useEffect(() => {
    if (enAttente.length === 0) return;
    const prevenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", prevenir);
    return () => window.removeEventListener("beforeunload", prevenir);
  }, [enAttente.length]);

  const valeur = useMemo<Contexte>(
    () => ({
      enAttente,
      refusees,
      enCours,
      differer,
      synchroniser,
      oublierRefus: (index) => setRefusees((liste) => liste.filter((_, i) => i !== index)),
    }),
    [enAttente, refusees, enCours, differer, synchroniser],
  );

  return <FileContexte.Provider value={valeur}>{children}</FileContexte.Provider>;
}

/** Nombre de saisies en attente, au chargement, sans attendre React. */
export async function nombreEnAttente(): Promise<number> {
  return compter();
}

/** Ce que toute action de formulaire du chauffeur peut renvoyer. */
interface EtatBase {
  ok?: boolean;
  erreur?: string;
  champs?: Record<string, string>;
  valeurs?: Record<string, string>;
}

/** Saisie gardée sur l'appareil, pas encore parvenue au serveur. */
export interface Differe {
  differe?: boolean;
}

/**
 * Remplace `useActionState` pour les saisies du chauffeur.
 *
 * Même usage, même valeur de retour — mais si le réseau manque, la saisie
 * est rangée sur l'appareil au lieu d'être perdue. Le chauffeur voit
 * « gardée » plutôt qu'une erreur, et continue sa journée.
 */
export function useActionDifferee<E extends EtatBase>(
  lancer: (donnees: FormData) => Promise<E | void>,
  action: ActionDifferee,
  libelle: string,
): [E & Differe, (donnees: FormData) => Promise<void>] {
  const { differer } = useFile();
  const [etat, setEtat] = useState<E & Differe>({} as E & Differe);

  const envoyer = useCallback(
    async (donnees: FormData) => {
      // L'instant de la saisie est celui du terrain, même si l'envoi part
      // deux jours plus tard : il date la dépense et compte les jours.
      donnees.set(CHAMP_SAISIE, new Date().toISOString());

      const horsLigne = typeof navigator !== "undefined" && !navigator.onLine;
      if (!horsLigne) {
        try {
          const resultat = (await lancer(donnees)) ?? ({ ok: true } as E);
          setEtat(resultat as E & Differe);
          return;
        } catch (e) {
          // Le réseau est tombé pendant l'envoi : on garde. S'il est toujours
          // là, c'est un vrai refus du serveur, qu'il faut montrer.
          if (typeof navigator !== "undefined" && navigator.onLine) {
            setEtat({ erreur: e instanceof Error ? e.message : "Envoi impossible." } as E & Differe);
            return;
          }
        }
      }

      await differer(action, libelle, donnees);
      setEtat({ ok: true, differe: true } as E & Differe);
    },
    [lancer, action, libelle, differer],
  );

  return [etat, envoyer];
}
