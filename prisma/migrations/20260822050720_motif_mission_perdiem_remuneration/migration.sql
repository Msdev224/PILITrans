-- CreateEnum
CREATE TYPE "MotifVoyage" AS ENUM ('TRANSPORT', 'RECUPERATION_MARCHANDISE', 'REPARATION', 'REPOSITIONNEMENT', 'AUTRE');

-- AlterTable
ALTER TABLE "Chauffeur" ADD COLUMN     "perDiemJournalierGnf" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Parametres" ADD COLUMN     "perDiemJournalierGnf" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Voyage" ADD COLUMN     "motif" "MotifVoyage" NOT NULL DEFAULT 'TRANSPORT',
ADD COLUMN     "perDiemJournalierGnf" DECIMAL(14,2),
ADD COLUMN     "remunererChauffeur" BOOLEAN NOT NULL DEFAULT true;

