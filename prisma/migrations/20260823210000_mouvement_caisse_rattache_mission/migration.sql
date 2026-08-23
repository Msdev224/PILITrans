-- Un mouvement de caisse adossé à une dépense hérite de la mission de celle-ci.
--
-- Sans ce rattachement, la fiche mission comptait l'argent remis au chauffeur
-- mais jamais ce qu'il en avait justifié : le reste à justifier restait égal
-- au total remis, même une fois tout dépensé.
UPDATE "MouvementCaisse" m
SET "voyageId" = d."voyageId"
FROM "Depense" d
WHERE m."depenseId" = d."id"
  AND m."voyageId" IS NULL
  AND d."voyageId" IS NOT NULL;
