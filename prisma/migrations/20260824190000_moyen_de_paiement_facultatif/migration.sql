-- Le moyen devient facultatif : une écriture dérivée — le carburant remis
-- avec la mission — n'en a pas, et inventer « espèces » ferait entrer une
-- donnée fausse dans la caisse. Les formulaires, eux, continuent de l'exiger.
ALTER TABLE "Paiement"        ALTER COLUMN "moyenId" DROP NOT NULL;
ALTER TABLE "MouvementCaisse" ALTER COLUMN "moyenId" DROP NOT NULL;
ALTER TABLE "Depense"         ALTER COLUMN "moyenId" DROP NOT NULL;
