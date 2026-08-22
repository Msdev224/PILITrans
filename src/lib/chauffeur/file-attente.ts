/**
 * File des saisies en attente de réseau, sur le téléphone du chauffeur.
 *
 * Tout passe par IndexedDB : le stockage survit à la fermeture de l'onglet,
 * au redémarrage du téléphone et à une batterie vide. `localStorage` sert de
 * secours quand IndexedDB est indisponible — navigation privée, quota refusé.
 * Perdre une saisie de terrain n'est pas une option : elle ne sera pas
 * refaite, et c'est un trou dans la caisse ou une étape jamais franchie.
 */
import type { OperationEnAttente } from "./operations";

const BASE = "pilitrans-chauffeur";
const MAGASIN = "file";
const CLE_SECOURS = "pilitrans-file-attente";

let promesseBase: Promise<IDBDatabase | null> | null = null;

function ouvrir(): Promise<IDBDatabase | null> {
  if (promesseBase) return promesseBase;

  promesseBase = new Promise((resoudre) => {
    if (typeof indexedDB === "undefined") return resoudre(null);

    try {
      const demande = indexedDB.open(BASE, 1);
      demande.onupgradeneeded = () => {
        const db = demande.result;
        if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN, { keyPath: "id" });
      };
      demande.onsuccess = () => resoudre(demande.result);
      demande.onerror = () => resoudre(null);
      // Un onglet resté ouvert sur l'ancienne version bloquerait l'ouverture
      // indéfiniment : on bascule sur le secours plutôt que d'attendre.
      demande.onblocked = () => resoudre(null);
    } catch {
      resoudre(null);
    }
  });

  return promesseBase;
}

// --- Secours : même interface, sur localStorage ---

function lireSecours(): OperationEnAttente[] {
  try {
    const brut = localStorage.getItem(CLE_SECOURS);
    return brut ? (JSON.parse(brut) as OperationEnAttente[]) : [];
  } catch {
    return [];
  }
}

function ecrireSecours(operations: OperationEnAttente[]) {
  try {
    localStorage.setItem(CLE_SECOURS, JSON.stringify(operations));
  } catch {
    // Quota plein : il n'y a plus rien à tenter, la saisie est perdue. Le
    // compteur affiché au chauffeur restera à jour, lui saura la refaire.
  }
}

function transaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (magasin: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    const t = db.transaction(MAGASIN, mode);
    const demande = operation(t.objectStore(MAGASIN));
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });
}

/** Range une saisie. Elle partira au prochain passage de la synchronisation. */
export async function enfiler(operation: OperationEnAttente): Promise<void> {
  const db = await ouvrir();
  if (!db) {
    const file = lireSecours();
    ecrireSecours([...file.filter((o) => o.id !== operation.id), operation]);
    return;
  }
  await transaction(db, "readwrite", (m) => m.put(operation));
}

/** Les saisies en attente, de la plus ancienne à la plus récente. */
export async function lister(): Promise<OperationEnAttente[]> {
  const db = await ouvrir();
  const file = db ? await transaction<OperationEnAttente[]>(db, "readonly", (m) => m.getAll()) : lireSecours();
  // L'ordre compte : avancer une mission puis livrer n'a de sens que dans
  // l'ordre où le chauffeur l'a vécu.
  return file.sort((a, b) => a.saisieLe.localeCompare(b.saisieLe));
}

export async function compter(): Promise<number> {
  return (await lister()).length;
}

/** Retire une saisie appliquée par le serveur. */
export async function retirer(id: string): Promise<void> {
  const db = await ouvrir();
  if (!db) return ecrireSecours(lireSecours().filter((o) => o.id !== id));
  await transaction(db, "readwrite", (m) => m.delete(id));
}

/** Note un refus, pour le montrer au chauffeur sans reperdre la saisie. */
export async function marquerEchec(id: string, erreur: string): Promise<void> {
  const file = await lister();
  const operation = file.find((o) => o.id === id);
  if (!operation) return;
  await enfiler({ ...operation, essais: operation.essais + 1, erreur });
}

/** Identifiant de saisie. `randomUUID` manque sur les WebView anciennes. */
export function identifiant(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
