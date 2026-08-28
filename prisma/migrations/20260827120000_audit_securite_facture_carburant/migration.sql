-- ============================================================
--  Corrections issues de la revue du 27/08/2026
--  SEC-2, SEC-3, CPT-1, CPT-2, LOG-1
-- ============================================================

-- ---------- SEC-3 : recherche de connexion indexée ----------
ALTER TABLE "Utilisateur" ADD COLUMN "telephoneNormalise" TEXT;

-- Reprise : E.164 à partir du numéro affiché. Les numéros stockés portent
-- déjà l'indicatif « + » ; il suffit de retirer espaces et ponctuation.
UPDATE "Utilisateur"
SET "telephoneNormalise" = regexp_replace("telephone", '[^0-9+]', '', 'g')
WHERE "telephone" IS NOT NULL;

CREATE UNIQUE INDEX "Utilisateur_telephoneNormalise_key"
  ON "Utilisateur"("telephoneNormalise");

-- ---------- SEC-2 : verrou anti-force-brute partagé ----------
ALTER TABLE "Utilisateur" ADD COLUMN "echecsConnexion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Utilisateur" ADD COLUMN "bloqueJusqua" TIMESTAMP(3);
ALTER TABLE "Utilisateur" ADD COLUMN "derniereConnexion" TIMESTAMP(3);

-- ---------- CPT-1 : la TVA appartient au document ----------
ALTER TABLE "Facture" ADD COLUMN "tauxTva" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "montantTvaGnf" DECIMAL(16,2) NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "totalTtcGnf" DECIMAL(16,2) NOT NULL DEFAULT 0;

-- ---------- CPT-2 : identité de l'émetteur figée ----------
ALTER TABLE "Facture" ADD COLUMN "emetteurRaisonSociale" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurAdresse" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurTelephone" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurEmail" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurRccm" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurNif" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurOrangeMoney" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurBanque" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurCompte" TEXT;
ALTER TABLE "Facture" ADD COLUMN "emetteurConditions" TEXT;

-- Reprise des factures déjà émises.
--
-- Le taux appliqué à ces documents était celui des Paramètres au moment de
-- l'impression : c'est la seule valeur qui ait jamais été montrée au client,
-- on la fige telle quelle. Le total TTC en découle.
UPDATE "Facture" f
SET "tauxTva"       = COALESCE(p."tvaTaux", 0),
    "montantTvaGnf" = ROUND(f."montantGnf" * COALESCE(p."tvaTaux", 0) / 100, 2),
    "totalTtcGnf"   = f."montantGnf" + ROUND(f."montantGnf" * COALESCE(p."tvaTaux", 0) / 100, 2),
    "emetteurRaisonSociale" = p."raisonSociale",
    "emetteurAdresse"       = p."adresse",
    "emetteurTelephone"     = p."telephone",
    "emetteurEmail"         = p."email",
    "emetteurRccm"          = p."rccm",
    "emetteurNif"           = p."nif",
    "emetteurOrangeMoney"   = p."orangeMoney",
    "emetteurBanque"        = p."banque",
    "emetteurCompte"        = p."compteBancaire",
    "emetteurConditions"    = p."conditionsPaiement"
FROM "Parametres" p;

-- Filet : une base sans ligne Paramètres laisserait le TTC à zéro, ce qui
-- ferait disparaître toutes les créances.
UPDATE "Facture" SET "totalTtcGnf" = "montantGnf" WHERE "totalTtcGnf" = 0;

-- ---------- LOG-1 : bornes de consommation ----------
ALTER TABLE "Parametres" ALTER COLUMN "seuilConsoAnormale" SET DEFAULT 55;
ALTER TABLE "Parametres" ADD COLUMN "seuilConsoBasse" DECIMAL(5,1) DEFAULT 15;

-- Les exploitations déjà en service n'avaient aucun seuil : sans valeur, le
-- contrôle ne s'exécutait pas et aucune alerte carburant n'existait.
UPDATE "Parametres" SET "seuilConsoAnormale" = 55 WHERE "seuilConsoAnormale" IS NULL;
UPDATE "Parametres" SET "seuilConsoBasse" = 15 WHERE "seuilConsoBasse" IS NULL;
