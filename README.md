# PILITrans

Gestion de flotte pour le transport frigorifique transfrontalier (Guinée ⇄ Sénégal).
Un gérant pilote le parc ; les chauffeurs saisissent depuis le téléphone de bord.

---

## 1. Prérequis

| Outil      | Version   | Vérifier          |
| ---------- | --------- | ----------------- |
| Node.js    | 20 ou 22+ | `node -v`         |
| npm        | 10+       | `npm -v`          |
| PostgreSQL | 14+       | `psql --version`  |

PostgreSQL doit tourner avant tout :

```bash
pg_isready
```

S'il ne répond pas, sur macOS (Homebrew) :

```bash
brew services start postgresql@18
```

## 2. Créer la base

Une seule fois :

```bash
createdb pilitrans
```

## 3. Installer et configurer

```bash
npm install
cp .env.example .env
```

Puis renseigner `.env` :

```bash
# Génère une clé de session et l'insère dans .env
printf 'AUTH_SECRET="%s"\n' "$(openssl rand -base64 32)"
```

| Variable                | Rôle |
| ----------------------- | ---- |
| `DATABASE_URL`          | Connexion applicative. En local : `postgresql://postgres@localhost:5432/pilitrans?schema=public` |
| `DIRECT_URL`            | Connexion sans pooler, pour les migrations. Identique à la précédente en local. |
| `AUTH_SECRET`           | **Obligatoire.** Signe les sessions. Sans elle, aucune connexion. |
| `AUTH_TRUST_HOST`       | `true` en développement. |
| `NIMBA_SMS_SERVICE_ID`  | Facultatif. Vide, les SMS sont mis en file sans partir. |
| `NIMBA_SMS_SECRET_TOKEN`| Idem. Ces clés ne sont **jamais** stockées en base. |

## 4. Schéma et données

```bash
npm run db:push     # crée les tables
npm run db:seed     # jeu de démonstration
```

`db:push` est destiné au développement. Il **écrase** le schéma sans migration :
ne pas l'utiliser sur une base contenant des données réelles — voir
« Mise en production » plus bas.

`db:seed` **vide les tables** avant de réinsérer la démonstration.

## 5. Lancer

```bash
npm run dev
```

→ http://localhost:3000

## Comptes de démonstration

On se connecte **par numéro de téléphone**, pas par e-mail.
Mot de passe commun : `pilitrans`.

| Rôle                | Téléphone       | Ce qu'il voit |
| ------------------- | --------------- | ------------- |
| Gérant              | `+224620000000` | Tout, y compris paramètres et comptes |
| Chef d'exploitation | `+224620555555` | Voyages, parc, frais de route. Ne facture pas. |
| Comptable           | `+224620666666` | Factures, encaissements, clients, dépenses |
| Lecture seule       | `+224620777777` | Consulte tout, ne modifie rien |
| Chauffeur           | `+224620222222` | Son espace mobile, ses missions |

Ces identifiants s'affichent sur l'écran de connexion parce que le jeu de
démonstration active l'option correspondante. **Décochez-la dans Paramètres →
Écran d'accueil avant toute mise en service** : cette page est accessible sans
être connecté.

---

## Commandes

| Commande                  | Effet |
| ------------------------- | ----- |
| `npm run dev`             | Serveur de développement |
| `npm run build`           | Build de production |
| `npm start`               | Sert le build (après `build`) |
| `npm test`                | Suite de tests |
| `npm run test:watch`      | Tests en continu |
| `npm run test:couverture` | Couverture |
| `npm run lint`            | ESLint |
| `npm run verifier`        | **lint + types + tests** — à lancer avant de livrer |
| `npm run db:studio`       | Explorateur de base Prisma |
| `npm run db:generate`     | Régénère le client Prisma |
| `npm run db:deploy`       | Applique les migrations (production) |
| `npm run creer-gerant`    | Crée le premier compte gérant |

## Déploiement — Vercel + Neon

### 1. La base sur Neon

Créez un projet sur [neon.tech](https://neon.tech), puis relevez **deux** chaînes
de connexion dans *Connection Details* :

| Variable       | Quelle URL prendre | Pourquoi |
| -------------- | ------------------ | -------- |
| `DATABASE_URL` | celle **avec** `-pooler` dans l'hôte | Chaque fonction Vercel ouvre sa propre connexion ; sans pooler, la base sature. |
| `DIRECT_URL`   | celle **sans** `-pooler` | Les migrations posent des verrous que le pooler ne sait pas porter. |

Ajoutez `?sslmode=require` aux deux si Neon ne l'a pas déjà mis.

> Se tromper d'URL est l'erreur la plus fréquente : l'application démarre, puis
> tombe en `too many connections` sous charge, ou `migrate deploy` reste bloqué.

### 2. Appliquer le schéma

Depuis votre poste, une seule fois, avec les URL Neon dans `.env` :

```bash
npm run db:deploy
```

**Jamais `db:push` ni `db:seed` sur la base de production** : le premier peut
supprimer des colonnes pour aligner le schéma, le second vide les tables.

### 3. La région — le réglage qui décide des performances

Chaque page ouvre plusieurs dizaines de requêtes. Ce qui coûte n'est pas le
calcul mais l'**aller-retour réseau** vers la base : mesuré à 180 ms depuis un
poste distant, il fait passer une page de 300 ms à 8 secondes.

`vercel.json` fixe donc la région des fonctions sur `lhr1` (Londres), pour
coller à une base Neon en `eu-west-2`.

> **Si votre base Neon est ailleurs, changez cette valeur.** Une fonction à
> Washington et une base à Francfort, et l'application restera lente quoi qu'on
> optimise dans le code.

| Région Neon | Valeur à mettre dans `vercel.json` |
| ----------- | ---------------------------------- |
| `eu-west-2` (Londres)   | `lhr1` |
| `eu-central-1` (Francfort) | `fra1` |
| `us-east-1` (Virginie)  | `iad1` |
| `us-west-2` (Oregon)    | `pdx1` |

### 4. Le projet sur Vercel

Importez le dépôt sur [vercel.com](https://vercel.com). Les réglages par défaut
conviennent : Next.js est détecté, et `postinstall` régénère le client Prisma à
chaque build.

Déclarez ces variables dans *Settings → Environment Variables* :

| Variable | Valeur |
| -------- | ------ |
| `DATABASE_URL` | URL Neon **avec** pooler |
| `DIRECT_URL` | URL Neon **sans** pooler |
| `AUTH_SECRET` | `openssl rand -base64 32` — **une clé neuve**, pas celle du développement |
| `AUTH_TRUST_HOST` | `true` |
| `NIMBA_SMS_SERVICE_ID` | vos identifiants Nimba, ou vide |
| `NIMBA_SMS_SECRET_TOKEN` | idem |

Puis déployez.

### 5. Créer le compte gérant

Aucun compte n'existe sur une base neuve : personne ne peut se connecter.
Avec les URL Neon dans votre `.env` local :

```bash
npm run creer-gerant -- --tel "+224620000000" --nom "Mamadou Saïdou Bah"
```

Le mot de passe est demandé sans écho. Le script :

- normalise le numéro (`620 00 00 00` → `+224620000000`) — c'est l'identifiant
  de connexion, il doit être stocké sous la même forme que partout ailleurs ;
- crée la ligne de **paramètres** si elle manque, sans laquelle les factures
  sortiraient sans identité d'entreprise ;
- crée les **unités de mesure**, indispensables à la saisie d'un voyage.

Relancé sur un numéro existant, il réactive le compte et remplace le mot de
passe — c'est le recours en cas d'oubli.

Pour un environnement non interactif :

```bash
MOT_DE_PASSE="…" npm run creer-gerant -- --tel "+224620000000" --nom "…"
```

### 6. Après le premier déploiement

1. Connectez-vous, ouvrez **Paramètres** et complétez l'identité de
   l'entreprise : elle est reprise telle quelle sur les factures.
2. **Paramètres → Écran d'accueil** : laissez décoché l'affichage des
   identifiants de démonstration. Cette page est ouverte à tous.
3. **Paramètres → Comptes** : créez les autres profils (exploitation,
   comptable, chauffeurs) avec leurs propres mots de passe.
4. Vérifiez le **taux de référence GNF ⇄ CFA** et le délai de paiement.

### Déploiements suivants

Un `git push` suffit. Si le schéma a changé, appliquez la migration **avant**
que le nouveau code ne soit servi :

```bash
npm run db:deploy
```

---

## Mise en production (serveur classique)

```bash
npm run verifier
npm run build
npm start
```

Trois points à ne pas manquer :

1. **`AUTH_SECRET` différent** de celui de développement.
2. **Migrations, pas `db:push`.** Utilisez `npm run db:deploy` :
   `db:push` peut détruire des colonnes pour aligner le schéma.
3. **Paramètres → Écran d'accueil** : décocher l'affichage des identifiants de
   démonstration, et remplacer les mots de passe des comptes de démonstration
   depuis Paramètres → Comptes.

---

## Problèmes courants

**`Can't reach database server`** — PostgreSQL est arrêté. `pg_isready`, puis
`brew services start postgresql@18`.

**`database "pilitrans" does not exist`** — `createdb pilitrans`.

**Connexion refusée avec les bons identifiants** — `AUTH_SECRET` est vide dans
`.env`. La renseigner puis relancer `npm run dev`.

**`Application error: a client-side exception has occurred`** — page blanche
avec ce seul message. `npm run dev` et `npm run build` partagent le dossier
`.next` : dès que l'un tourne après l'autre, il écrase ses fichiers. Le HTML
servi réclame alors des morceaux de JavaScript qui n'existent plus.

Ne jamais faire tourner les deux en même temps. Pour repartir propre :

```bash
rm -rf .next && npm run build && npm start
```

Et pour revenir au développement, une fois le serveur de production arrêté :

```bash
rm -rf .next && npm run dev
```

**`Cannot find module './xxx.js'` au démarrage** — même cause, `.next` corrompu.
Arrêter le serveur, `rm -rf .next`, relancer.

**`Unknown field ...` alors que les types passent** — le client Prisma a été
régénéré pendant que le serveur tournait. Relancer `npm run dev`.

---

## Structure

```
src/
  app/            (cockpit)/ écrans gérant · chauffeur/ espace mobile PWA
  components/     UI et composants métier
  lib/
    calculs.ts    cœur métier (fourni, testé) — importé, jamais réécrit
    permissions.ts matrice des droits par rôle
    telephone.ts  numéros au format international
    donnees/      accès base et agrégations
  actions/        Server Actions (Zod)
prisma/           schema.prisma · seed.ts
tests/            voir tests/README.md
docs/             maquette.html · facture-modele.html · brief
```

## Règles à connaître

- **Le prix d'achat n'entre jamais dans la marge du mois.** Il est suivi
  séparément comme capital à rembourser (écran Rentabilité).
- **Multi-devise à taux réel** : l'équivalent GNF est figé par transaction. Le
  taux de référence ne sert qu'au pré-remplissage.
- **Bus et taxi** sont prévus mais pas activés : le suivi des passagers reste à
  construire.
- **GPS** : assuré par un opérateur externe, non intégré.
