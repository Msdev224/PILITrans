-- Charge utile du véhicule : indicative, sert à signaler un dépassement.
ALTER TABLE "Camion" ADD COLUMN "capaciteTonnes" DECIMAL(8,2);

-- Compteur relevé à chaque étape : la distance se déduit, ne se saisit plus.
ALTER TABLE "Voyage" ADD COLUMN "kmArriveeChargement" INTEGER;
ALTER TABLE "Voyage" ADD COLUMN "kmChargement" INTEGER;
ALTER TABLE "Voyage" ADD COLUMN "kmArriveeDestination" INTEGER;
ALTER TABLE "Voyage" ADD COLUMN "kmDechargement" INTEGER;

-- Imputation d'une dépense à la marge de la mission.
ALTER TABLE "Depense" ADD COLUMN "imputerAMission" BOOLEAN NOT NULL DEFAULT true;

-- Les dépenses de véhicule déjà saisies sur une mission sortent de sa marge :
-- une pièce de rechange sert au camion pendant des mois, pas à ce trajet.
UPDATE "Depense" SET "imputerAMission" = false
WHERE "voyageId" IS NOT NULL AND "categorie" = 'VEHICULE';
