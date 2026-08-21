-- CreateEnum
CREATE TYPE "StatutLivraison" AS ENUM ('EN_ATTENTE', 'CONFORME', 'NON_CONFORME');

-- AlterTable
ALTER TABLE "Chauffeur" ADD COLUMN     "photo" TEXT;

-- AlterTable
ALTER TABLE "Echeance" ADD COLUMN     "dateDebut" TIMESTAMP(3),
ADD COLUMN     "montantGnf" DECIMAL(16,2),
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "organisme" TEXT;

-- AlterTable
ALTER TABLE "LigneMarchandise" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "codeConfirmeLe" TIMESTAMP(3),
ADD COLUMN     "codeEnvois" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeEnvoyeLe" TIMESTAMP(3),
ADD COLUMN     "codeLivraison" TEXT,
ADD COLUMN     "codeTentatives" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MouvementCaisse" ADD COLUMN     "voyageId" TEXT;

-- AlterTable
ALTER TABLE "Voyage" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "vaChercher" BOOLEAN NOT NULL DEFAULT false;


-- ------------------------------------------------------------
--  Reprise des clients saisis en texte libre
--
--  Le nom est rapproché de la fiche Client à la casse et aux espaces près.
--  Ce qui ne correspond à aucune fiche reste NULL : deux orthographes du
--  même client sont précisément ce que cette liaison vient supprimer, et
--  rattacher au jugé créerait de faux liens. Le gérant les redésigne depuis
--  l'écran Voyages.
-- ------------------------------------------------------------
UPDATE "Voyage" v
SET "clientId" = c.id
FROM "Client" c
WHERE v."client" IS NOT NULL
  AND lower(btrim(v."client")) = lower(btrim(c.nom));

UPDATE "LigneMarchandise" l
SET "clientId" = c.id
FROM "Client" c
WHERE l."client" IS NOT NULL
  AND lower(btrim(l."client")) = lower(btrim(c.nom));

-- Les colonnes texte ne disparaissent qu'une fois la reprise faite.
ALTER TABLE "Voyage" DROP COLUMN "client";
ALTER TABLE "LigneMarchandise" DROP COLUMN "client";

-- CreateIndex
CREATE INDEX "Echeance_camionId_idx" ON "Echeance"("camionId");

-- CreateIndex
CREATE INDEX "MouvementCaisse_voyageId_idx" ON "MouvementCaisse"("voyageId");

-- AddForeignKey
ALTER TABLE "LigneMarchandise" ADD CONSTRAINT "LigneMarchandise_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voyage" ADD CONSTRAINT "Voyage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementCaisse" ADD CONSTRAINT "MouvementCaisse_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

