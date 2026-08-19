# Tests

```bash
npm test              # toute la suite
npm run test:watch    # relance à chaque modification
npm run test:couverture
npm run verifier      # lint + types + tests
```

## Organisation

| Dossier            | Environnement | Contenu |
|--------------------|---------------|---------|
| `tests/unite/`     | node          | Fonctions pures : cœur métier, permissions, téléphone, validation, formatage |
| `tests/donnees/`   | node          | Couche de données : P&L par camion, écarts de livraison |
| `tests/integration/` | node        | Contrôle d'accès réel du middleware Auth.js |
| `tests/composants/`| jsdom         | Composants React |

Les tests de calcul tournent sans DOM : ils sont les plus nombreux et doivent
rester instantanés. Seul `tests/composants/` paie le coût de jsdom.

## Conventions

- **Le fuseau et l'horloge sont figés** (`tests/setup.ts`, `Africa/Conakry`).
  Le métier compte des jours pleins — attente de chargement, retard de facture,
  mois de remboursement. Une horloge libre rendrait des tests verts le matin et
  rouges le soir.
- **Un test dit pourquoi la règle existe**, pas seulement ce qu'elle calcule.
  Quand un test protège une régression déjà vécue, elle est nommée en
  commentaire : c'est ce qui empêche de « corriger » le test au lieu du code.
- **Les montants sont écrits en clair** (`12_000_000`) plutôt que calculés dans
  l'assertion : un test qui rejoue la formule qu'il vérifie ne vérifie rien.

## Ce qui est couvert en priorité

1. **Le cœur métier** (`src/lib/calculs.ts`) — les marges, la caisse, la
   consommation, les créances. Une régression y fausse toutes les décisions.
2. **Les droits d'accès** — une erreur n'affiche pas un mauvais chiffre, elle
   ouvre à quelqu'un un écran qui ne le regarde pas.
3. **Les numéros de téléphone** — ils servent d'identifiant de connexion et de
   destinataire des SMS.
4. **La règle du prix d'achat** — il n'entre jamais dans la marge du mois.

## Ce qui n'est pas couvert

Les Server Actions qui écrivent en base ne sont pas testées de bout en bout :
il faudrait une base de test dédiée. Leur logique de validation, elle, l'est
via `tests/unite/validation.test.ts`, et leur garde d'accès via la matrice de
permissions.
