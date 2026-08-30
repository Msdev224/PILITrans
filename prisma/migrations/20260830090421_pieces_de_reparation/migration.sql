-- Réalignement des clés étrangères — sans effet fonctionnel.
--
-- Ce fichier n'a pas été écrit à la main : Prisma l'a produit en comparant le
-- schéma à la base, et il ne fait que supprimer puis recréer huit contraintes
-- à l'identique (mêmes colonnes, même ON DELETE SET NULL). Il corrige un
-- décalage d'ordre de déclaration, rien d'autre : aucune donnée n'est lue,
-- déplacée ni effacée.
--
-- Il est conservé tel quel parce qu'il est déjà enregistré comme appliqué :
-- retirer le dossier ferait échouer `prisma migrate deploy`, qui refuse une
-- migration présente dans la base et absente du répertoire.

-- DropForeignKey
ALTER TABLE "Depense" DROP CONSTRAINT "Depense_compteId_fkey";

-- DropForeignKey
ALTER TABLE "Depense" DROP CONSTRAINT "Depense_moyenId_fkey";

-- DropForeignKey
ALTER TABLE "MouvementCaisse" DROP CONSTRAINT "MouvementCaisse_compteId_fkey";

-- DropForeignKey
ALTER TABLE "MouvementCaisse" DROP CONSTRAINT "MouvementCaisse_moyenId_fkey";

-- DropForeignKey
ALTER TABLE "OperationTresorerie" DROP CONSTRAINT "OperationTresorerie_compteId_fkey";

-- DropForeignKey
ALTER TABLE "OperationTresorerie" DROP CONSTRAINT "OperationTresorerie_versId_fkey";

-- DropForeignKey
ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_compteId_fkey";

-- DropForeignKey
ALTER TABLE "Paiement" DROP CONSTRAINT "Paiement_moyenId_fkey";

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_moyenId_fkey" FOREIGN KEY ("moyenId") REFERENCES "MoyenPaiement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementCaisse" ADD CONSTRAINT "MouvementCaisse_moyenId_fkey" FOREIGN KEY ("moyenId") REFERENCES "MoyenPaiement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementCaisse" ADD CONSTRAINT "MouvementCaisse_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_moyenId_fkey" FOREIGN KEY ("moyenId") REFERENCES "MoyenPaiement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationTresorerie" ADD CONSTRAINT "OperationTresorerie_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "CompteTresorerie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationTresorerie" ADD CONSTRAINT "OperationTresorerie_versId_fkey" FOREIGN KEY ("versId") REFERENCES "CompteTresorerie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
