/**
 * Service worker de l'espace chauffeur — offline-first sur la coquille.
 *
 * Stratégie : réseau d'abord pour les pages (les données doivent être fraîches
 * quand le réseau est là), repli sur le cache sinon. Les ressources statiques
 * de Next portent un hachage dans leur nom : elles sont immuables, donc
 * servies depuis le cache en priorité.
 *
 * Les saisies faites hors réseau ne passent PAS par ce fichier : elles sont
 * rangées dans IndexedDB par la page, qui les rejoue une par une au retour du
 * réseau. Chacune porte un identifiant produit sur l'appareil, si bien qu'un
 * renvoi ne peut pas compter une dépense deux fois. Le service worker ne sert
 * donc qu'à une chose : que la page s'ouvre encore quand il n'y a pas de
 * réseau du tout.
 */
const CACHE = "pilitrans-v3";
const COQUILLE = ["/chauffeur", "/manifest.webmanifest", "/icone.svg"];

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches
      .open(CACHE)
      // Un fichier manquant ne doit pas faire échouer toute l'installation.
      .then((cache) => Promise.allSettled(COQUILLE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Vide le cache à la demande de la page.
 *
 * Appelé à la déconnexion : sans cela, les pages authentifiées du chauffeur
 * précédent resteraient servies hors ligne au suivant.
 */
self.addEventListener("message", (evenement) => {
  if (evenement.data === "vider-cache") {
    evenement.waitUntil(caches.keys().then((cles) => Promise.all(cles.map((c) => caches.delete(c)))));
  }
});

/** Ressource Next au nom haché : immuable, donc sûre à garder en cache. */
function estImmuable(url) {
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;

  // Les mutations ne passent jamais par le cache.
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // L'authentification ne doit jamais être servie depuis le cache : une
  // session expirée paraîtrait valide, et une déconnexion serait annulée.
  if (url.pathname.startsWith("/api/")) return;

  // --- Ressources immuables : cache d'abord ---
  if (estImmuable(url)) {
    evenement.respondWith(
      caches.match(requete).then(
        (enCache) =>
          enCache ??
          fetch(requete).then((reponse) => {
            if (reponse.ok) {
              const copie = reponse.clone();
              caches.open(CACHE).then((cache) => cache.put(requete, copie));
            }
            return reponse;
          }),
      ),
    );
    return;
  }

  // --- Navigations : réseau d'abord, coquille en secours ---
  if (requete.mode === "navigate") {
    evenement.respondWith(
      fetch(requete)
        .then((reponse) => {
          // Ni les redirections ni les erreurs ne sont mises en cache : garder
          // une redirection de déconnexion rejouerait la déconnexion.
          if (reponse.ok && reponse.type === "basic") {
            const copie = reponse.clone();
            caches.open(CACHE).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() =>
          caches.match(requete).then((c) => c ?? caches.match("/chauffeur")),
        ),
    );
    return;
  }

  /*
   * --- Tout le reste : réseau seul ---
   *
   * Point crucial : aucun repli sur la coquille ici. L'ancienne version
   * renvoyait la page `/chauffeur` pour n'importe quelle requête échouée,
   * y compris un script. Le navigateur recevait alors du HTML là où il
   * attendait du JavaScript et affichait « Application error: a client-side
   * exception has occurred » — écran blanc, application inutilisable. Cela se
   * produisait après chaque déploiement, les noms de fichiers changeant.
   */
  evenement.respondWith(
    fetch(requete).catch(() => caches.match(requete).then((c) => c ?? Response.error())),
  );
});
