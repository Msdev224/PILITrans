-- Annuler une mission devient une action à part entière : on garde pourquoi.
ALTER TABLE "Voyage" ADD COLUMN "motifAnnulation" TEXT;
ALTER TABLE "Voyage" ADD COLUMN "annuleLe" TIMESTAMP(3);
