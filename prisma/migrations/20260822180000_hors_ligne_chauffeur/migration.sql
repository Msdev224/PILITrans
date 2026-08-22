-- Saisies hors ligne du chauffeur : garde-fou contre le double rejeu.
CREATE TABLE "OperationChauffeur" (
    "id" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "saisieLe" TIMESTAMP(3) NOT NULL,
    "traiteeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationChauffeur_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationChauffeur_chauffeurId_traiteeLe_idx"
    ON "OperationChauffeur"("chauffeurId", "traiteeLe");

ALTER TABLE "OperationChauffeur"
    ADD CONSTRAINT "OperationChauffeur_chauffeurId_fkey"
    FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Affichage du code de retrait à l'écran, pour une démonstration sans SMS.
ALTER TABLE "Parametres"
    ADD COLUMN "afficherCodeLivraison" BOOLEAN NOT NULL DEFAULT false;
