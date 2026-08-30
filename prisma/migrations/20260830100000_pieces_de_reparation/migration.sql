-- Détail des pièces d'une réparation.
--
-- Jusqu'ici une intervention portait deux nombres : pièces et main d'œuvre.
-- L'exploitation en veut le détail — ce qui a été acheté, ce qui a été remis
-- en état — sans perdre la façon dont le garage facture réellement : une
-- pièce chiffrée à part, les autres dans un montant global.
--
-- Rien n'est perdu ni recalculé pour les réparations déjà saisies : elles
-- n'ont aucune ligne de pièce, `coutForfait` vaut zéro, et `coutPieces` reste
-- exactement le nombre entré à l'époque.

ALTER TABLE "Reparation" ADD COLUMN "coutForfait" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "PieceReparation" (
    "id"             TEXT NOT NULL,
    "reparationId"   TEXT NOT NULL,
    "designation"    TEXT NOT NULL,
    "coutAchat"      DECIMAL(14,2) NOT NULL DEFAULT 0,
    "coutReparation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "auForfait"      BOOLEAN NOT NULL DEFAULT false,
    "ordre"          INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PieceReparation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PieceReparation_reparationId_ordre_idx" ON "PieceReparation"("reparationId", "ordre");

-- La cascade est voulue : les lignes ne décrivent que cette réparation, elles
-- n'ont aucun sens si elle disparaît.
ALTER TABLE "PieceReparation"
    ADD CONSTRAINT "PieceReparation_reparationId_fkey"
    FOREIGN KEY ("reparationId") REFERENCES "Reparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
