-- Les moyens de paiement passent d'une énumération figée à une table tenue
-- par l'exploitation. L'ordre des opérations est imposé par PostgreSQL : une
-- table et un type partagent le même espace de noms, on ne peut donc pas
-- créer la table tant que l'énumération existe.

-- 1. On met les valeurs à l'abri sous forme de texte.
ALTER TABLE "Paiement"        ADD COLUMN "moyenCode" TEXT;
ALTER TABLE "MouvementCaisse" ADD COLUMN "moyenCode" TEXT;
ALTER TABLE "Depense"         ADD COLUMN "moyenCode" TEXT;

UPDATE "Paiement"        SET "moyenCode" = "moyen"::text;
UPDATE "MouvementCaisse" SET "moyenCode" = "moyen"::text;
UPDATE "Depense"         SET "moyenCode" = "moyen"::text;

-- 2. Les colonnes typées partent, puis le type.
ALTER TABLE "Paiement"        DROP COLUMN "moyen";
ALTER TABLE "MouvementCaisse" DROP COLUMN "moyen";
ALTER TABLE "Depense"         DROP COLUMN "moyen";
DROP TYPE "MoyenPaiement";

-- 3. La table, avec les cinq moyens d'origine.
CREATE TABLE "MoyenPaiement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 100,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MoyenPaiement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MoyenPaiement_code_key" ON "MoyenPaiement"("code");
CREATE UNIQUE INDEX "MoyenPaiement_nom_key" ON "MoyenPaiement"("nom");
CREATE INDEX "MoyenPaiement_actif_ordre_idx" ON "MoyenPaiement"("actif", "ordre");

INSERT INTO "MoyenPaiement" ("id", "code", "nom", "ordre") VALUES
    ('moyen_especes',      'ESPECES',      'Espèces',      10),
    ('moyen_orange_money', 'ORANGE_MONEY', 'Orange Money', 20),
    ('moyen_virement',     'VIREMENT',     'Virement',     30),
    ('moyen_cheque',       'CHEQUE',       'Chèque',       40),
    ('moyen_autre',        'AUTRE',        'Autre',        90);

-- 4. Les liens, repris du code conservé à l'étape 1.
ALTER TABLE "Paiement"        ADD COLUMN "moyenId" TEXT;
ALTER TABLE "MouvementCaisse" ADD COLUMN "moyenId" TEXT;
ALTER TABLE "Depense"         ADD COLUMN "moyenId" TEXT;

UPDATE "Paiement" p        SET "moyenId" = m."id" FROM "MoyenPaiement" m WHERE m."code" = p."moyenCode";
UPDATE "MouvementCaisse" c SET "moyenId" = m."id" FROM "MoyenPaiement" m WHERE m."code" = c."moyenCode";
UPDATE "Depense" d         SET "moyenId" = m."id" FROM "MoyenPaiement" m WHERE m."code" = d."moyenCode";

-- Filet : une ligne sans correspondance retombe sur les espèces plutôt que
-- de bloquer la migration.
UPDATE "Paiement"        SET "moyenId" = 'moyen_especes' WHERE "moyenId" IS NULL;
UPDATE "MouvementCaisse" SET "moyenId" = 'moyen_especes' WHERE "moyenId" IS NULL;
UPDATE "Depense"         SET "moyenId" = 'moyen_especes' WHERE "moyenId" IS NULL;

ALTER TABLE "Paiement"        ALTER COLUMN "moyenId" SET NOT NULL;
ALTER TABLE "MouvementCaisse" ALTER COLUMN "moyenId" SET NOT NULL;
ALTER TABLE "Depense"         ALTER COLUMN "moyenId" SET NOT NULL;

ALTER TABLE "Paiement"        DROP COLUMN "moyenCode";
ALTER TABLE "MouvementCaisse" DROP COLUMN "moyenCode";
ALTER TABLE "Depense"         DROP COLUMN "moyenCode";

ALTER TABLE "Paiement"        ADD CONSTRAINT "Paiement_moyenId_fkey"        FOREIGN KEY ("moyenId") REFERENCES "MoyenPaiement"("id") ON UPDATE CASCADE;
ALTER TABLE "MouvementCaisse" ADD CONSTRAINT "MouvementCaisse_moyenId_fkey" FOREIGN KEY ("moyenId") REFERENCES "MoyenPaiement"("id") ON UPDATE CASCADE;
ALTER TABLE "Depense"         ADD CONSTRAINT "Depense_moyenId_fkey"         FOREIGN KEY ("moyenId") REFERENCES "MoyenPaiement"("id") ON UPDATE CASCADE;
