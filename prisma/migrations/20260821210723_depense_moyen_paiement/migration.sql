-- AlterTable
ALTER TABLE "Depense" ADD COLUMN     "moyen" "MoyenPaiement" NOT NULL DEFAULT 'ESPECES',
ADD COLUMN     "reference" TEXT;

