-- AlterTable
ALTER TABLE "Camion" ADD COLUMN     "photo" TEXT;

-- AlterTable
ALTER TABLE "Parametres" ADD COLUMN     "transportPersonnesActif" BOOLEAN NOT NULL DEFAULT false;

