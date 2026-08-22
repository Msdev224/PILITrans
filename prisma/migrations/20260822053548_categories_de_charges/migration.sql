-- CreateEnum
CREATE TYPE "CategorieDepense" AS ENUM ('DIRECTE', 'VEHICULE', 'ADMINISTRATIVE', 'GENERALE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeDepense" ADD VALUE 'HEBERGEMENT';
ALTER TYPE "TypeDepense" ADD VALUE 'STATIONNEMENT';
ALTER TYPE "TypeDepense" ADD VALUE 'CHARGEMENT_DECHARGEMENT';
ALTER TYPE "TypeDepense" ADD VALUE 'TRAVERSEE';
ALTER TYPE "TypeDepense" ADD VALUE 'COMMISSION';
ALTER TYPE "TypeDepense" ADD VALUE 'PRIME_CHAUFFEUR';
ALTER TYPE "TypeDepense" ADD VALUE 'PIECES_RECHANGE';
ALTER TYPE "TypeDepense" ADD VALUE 'IMMATRICULATION';
ALTER TYPE "TypeDepense" ADD VALUE 'AUTRE_VEHICULE';
ALTER TYPE "TypeDepense" ADD VALUE 'LOYER';
ALTER TYPE "TypeDepense" ADD VALUE 'SALAIRE_ADMINISTRATIF';
ALTER TYPE "TypeDepense" ADD VALUE 'ELECTRICITE';
ALTER TYPE "TypeDepense" ADD VALUE 'TELECOMMUNICATIONS';
ALTER TYPE "TypeDepense" ADD VALUE 'LOGICIEL_ABONNEMENT';
ALTER TYPE "TypeDepense" ADD VALUE 'COMPTABILITE';
ALTER TYPE "TypeDepense" ADD VALUE 'MARKETING';
ALTER TYPE "TypeDepense" ADD VALUE 'FOURNITURES_BUREAU';
ALTER TYPE "TypeDepense" ADD VALUE 'MAINTENANCE_LOCAUX';
ALTER TYPE "TypeDepense" ADD VALUE 'FRAIS_BANCAIRES';
ALTER TYPE "TypeDepense" ADD VALUE 'IMPOTS_TAXES';
ALTER TYPE "TypeDepense" ADD VALUE 'AUTRE_GENERAL';

-- AlterTable
ALTER TABLE "Depense" ADD COLUMN     "categorie" "CategorieDepense" NOT NULL DEFAULT 'DIRECTE',
ADD COLUMN     "chauffeurId" TEXT,
ADD COLUMN     "clientId" TEXT;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Les dépenses existantes sont toutes des charges de mission : c'était la
-- seule saisie possible jusqu'ici, une dépense devant viser un camion.
UPDATE "Depense" SET "categorie" = 'DIRECTE' WHERE "categorie" IS NULL;
