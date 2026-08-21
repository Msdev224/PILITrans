-- AlterTable
ALTER TABLE "MouvementCaisse" ADD COLUMN     "fraisGnf" DECIMAL(14,2),
ADD COLUMN     "moyen" "MoyenPaiement" NOT NULL DEFAULT 'ESPECES',
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "Parametres" ADD COLUMN     "dateSoldeInitial" TIMESTAMP(3),
ADD COLUMN     "soldeCaisseInitial" DECIMAL(16,2);

