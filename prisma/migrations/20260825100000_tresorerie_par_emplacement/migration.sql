-- Trésorerie par emplacement : savoir non pas combien on détient, mais OÙ.

CREATE TYPE "TypeCompte" AS ENUM ('CAISSE', 'BANQUE', 'MOBILE_MONEY', 'CHAUFFEUR');
CREATE TYPE "MotifTresorerie" AS ENUM ('DEPOT', 'RETRAIT', 'TRANSFERT', 'APPORT', 'PRELEVEMENT', 'AJUSTEMENT');

CREATE TABLE "CompteTresorerie" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeCompte" NOT NULL,
    "reference" TEXT,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "soldeInitial" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "dateSoldeInitial" TIMESTAMP(3),
    "chauffeurId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "CompteTresorerie_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompteTresorerie_nom_key" ON "CompteTresorerie"("nom");
CREATE UNIQUE INDEX "CompteTresorerie_chauffeurId_key" ON "CompteTresorerie"("chauffeurId");
CREATE INDEX "CompteTresorerie_actif_ordre_idx" ON "CompteTresorerie"("actif", "ordre");

ALTER TABLE "CompteTresorerie"
    ADD CONSTRAINT "CompteTresorerie_chauffeurId_fkey"
    FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OperationTresorerie" (
    "id" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "versId" TEXT,
    "motif" "MotifTresorerie" NOT NULL,
    "montant" DECIMAL(16,2) NOT NULL,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "montantGnf" DECIMAL(16,2) NOT NULL,
    "fraisGnf" DECIMAL(14,2),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "libelle" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationTresorerie_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationTresorerie_compteId_date_idx" ON "OperationTresorerie"("compteId", "date");
CREATE INDEX "OperationTresorerie_date_idx" ON "OperationTresorerie"("date");

ALTER TABLE "OperationTresorerie"
    ADD CONSTRAINT "OperationTresorerie_compteId_fkey"
    FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON UPDATE CASCADE;
ALTER TABLE "OperationTresorerie"
    ADD CONSTRAINT "OperationTresorerie_versId_fkey"
    FOREIGN KEY ("versId") REFERENCES "CompteTresorerie"("id") ON UPDATE CASCADE;

-- Les écritures existantes gagnent leur emplacement. Facultatif : les
-- écritures déjà saisies n'en ont pas, et en inventer un fausserait les soldes.
ALTER TABLE "Paiement"        ADD COLUMN "compteId" TEXT;
ALTER TABLE "Depense"         ADD COLUMN "compteId" TEXT;
ALTER TABLE "MouvementCaisse" ADD COLUMN "compteId" TEXT;

ALTER TABLE "Paiement"        ADD CONSTRAINT "Paiement_compteId_fkey"        FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON UPDATE CASCADE;
ALTER TABLE "Depense"         ADD CONSTRAINT "Depense_compteId_fkey"         FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON UPDATE CASCADE;
ALTER TABLE "MouvementCaisse" ADD CONSTRAINT "MouvementCaisse_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON UPDATE CASCADE;

-- La caisse d'espèces du bureau, reprise du solde d'ouverture des Paramètres :
-- sans elle, la trésorerie repartirait de zéro le jour de la mise en service.
INSERT INTO "CompteTresorerie" ("id", "nom", "type", "ordre", "soldeInitial", "dateSoldeInitial")
SELECT 'compte_caisse_bureau', 'Caisse bureau', 'CAISSE', 10,
       COALESCE(p."soldeCaisseInitial", 0), p."dateSoldeInitial"
FROM "Parametres" p
LIMIT 1;

-- Chaque chauffeur porte son propre emplacement : l'argent qu'il détient est
-- quelque part, et ce quelque part, c'est lui.
INSERT INTO "CompteTresorerie" ("id", "nom", "type", "chauffeurId", "ordre")
SELECT 'compte_ch_' || c."id", c."nom", 'CHAUFFEUR', c."id", 50
FROM "Chauffeur" c;
