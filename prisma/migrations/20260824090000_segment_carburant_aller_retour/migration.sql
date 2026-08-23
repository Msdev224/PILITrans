-- À quel segment du trajet une dépense se rapporte : aller, retour, ou les deux.
CREATE TYPE "SegmentTrajet" AS ENUM ('ALLER', 'RETOUR', 'ALLER_RETOUR');

ALTER TABLE "Depense" ADD COLUMN "segment" "SegmentTrajet";

-- Une mission peut comporter un retour : il ne se déduit pas du trajet, car
-- Conakry → Dakar → Conakry s'enregistre comme une seule mission.
ALTER TABLE "Voyage" ADD COLUMN "allerRetour" BOOLEAN NOT NULL DEFAULT false;
