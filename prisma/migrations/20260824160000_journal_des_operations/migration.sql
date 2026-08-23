-- Journal des opérations : qui a fait quoi, quand. Les lignes ne se modifient
-- ni ne se suppriment — un journal réinscriptible ne prouve rien.
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT,
    "auteurNom" TEXT NOT NULL,
    "auteurRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "objetId" TEXT,
    "libelle" TEXT NOT NULL,
    "montantGnf" DECIMAL(16,2),
    "avant" JSONB,
    "apres" JSONB,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Journal_date_idx" ON "Journal"("date");
CREATE INDEX "Journal_objet_objetId_idx" ON "Journal"("objet", "objetId");
CREATE INDEX "Journal_auteurId_date_idx" ON "Journal"("auteurId", "date");

-- Le compte peut disparaître ; la trace reste, avec le nom figé.
ALTER TABLE "Journal"
    ADD CONSTRAINT "Journal_auteurId_fkey"
    FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
