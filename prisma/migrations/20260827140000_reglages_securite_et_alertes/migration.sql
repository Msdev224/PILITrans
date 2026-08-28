-- Réglages d'exploitation sortis du code.
--
-- Nombre d'essais avant blocage, durée du blocage, profondeur d'historique
-- des alertes et durée de session étaient des constantes. Ce sont des
-- arbitrages qui dépendent de la taille de l'exploitation, pas du code.
ALTER TABLE "Parametres" ADD COLUMN "maxEchecsConnexion"  INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Parametres" ADD COLUMN "blocageConnexionMin" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Parametres" ADD COLUMN "fenetreAlertesJours" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "Parametres" ADD COLUMN "dureeSessionJours"   INTEGER NOT NULL DEFAULT 7;
