-- L'espace chauffeur devient un réglage, coupé par défaut.
--
-- L'exploitation démarre sans saisie de bord : le chauffeur reçoit un forfait
-- de voyage dont il ne rend pas compte. L'application mobile et l'exigence de
-- justificatifs s'ouvriront ensemble, le jour où c'est utile.
--
-- Le défaut à `false` vaut aussi pour la ligne déjà en place : une
-- exploitation qui n'a jamais ouvert l'espace ne le voit pas s'ouvrir seul au
-- déploiement.

ALTER TABLE "Parametres" ADD COLUMN "espaceChauffeurActif" BOOLEAN NOT NULL DEFAULT false;
