-- CreateEnum
CREATE TYPE "Devise" AS ENUM ('GNF', 'XOF');

-- CreateEnum
CREATE TYPE "Pays" AS ENUM ('GUINEE', 'SENEGAL', 'MALI', 'GUINEE_BISSAU', 'COTE_IVOIRE', 'SIERRA_LEONE', 'LIBERIA', 'MAURITANIE');

-- CreateEnum
CREATE TYPE "StatutCamion" AS ENUM ('DISPONIBLE', 'EN_VOYAGE', 'IMMOBILISE', 'HORS_SERVICE');

-- CreateEnum
CREATE TYPE "TypeVehicule" AS ENUM ('TRACTEUR_REMORQUE', 'PORTEUR');

-- CreateEnum
CREATE TYPE "Carrosserie" AS ENUM ('FRIGO', 'BENNE', 'PLATEAU', 'BACHE', 'CITERNE', 'BUS', 'TAXI');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GERANT', 'EXPLOITANT', 'COMPTABLE', 'LECTEUR', 'CHAUFFEUR');

-- CreateEnum
CREATE TYPE "ModeRemuneration" AS ENUM ('FORFAIT_VOYAGE', 'COMMISSION', 'PAR_KM', 'FIXE_MENSUEL', 'MIXTE');

-- CreateEnum
CREATE TYPE "StatutVoyage" AS ENUM ('PLANIFIE', 'EN_ATTENTE_CHARGEMENT', 'EN_COURS', 'ARRIVE_DESTINATION', 'EN_DECHARGEMENT', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeDepense" AS ENUM ('GASOIL_TRACTEUR', 'GASOIL_GROUPE_FROID', 'PEAGE', 'FRONTIERE', 'DOUANE', 'PER_DIEM', 'INTERNET', 'DIVERS');

-- CreateEnum
CREATE TYPE "CategorieReparation" AS ENUM ('TRACTEUR', 'REMORQUE', 'GROUPE_FROID', 'PNEUMATIQUE');

-- CreateEnum
CREATE TYPE "StatutReparation" AS ENUM ('A_FAIRE', 'EN_COURS', 'TERMINEE');

-- CreateEnum
CREATE TYPE "TypeEntretien" AS ENUM ('VIDANGE_TRACTEUR', 'ENTRETIEN_GROUPE_FROID', 'FREINS', 'PNEUS', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('AVANCE', 'DEPENSE', 'REMBOURSEMENT');

-- CreateEnum
CREATE TYPE "TypeEcheance" AS ENUM ('ASSURANCE', 'VISITE_TECHNIQUE', 'VIGNETTE', 'AUTORISATION_TRANSPORT', 'CARTE_BRUNE_CEDEAO', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeAlerte" AS ENUM ('ECHEANCE_DOC', 'CARTE_BRUNE', 'ENTRETIEN_DU', 'RUPTURE_FROID', 'CONSO_ANORMALE', 'CAISSE', 'IMMOBILISATION', 'AUTRE');

-- CreateEnum
CREATE TYPE "SeveriteAlerte" AS ENUM ('INFO', 'ATTENTION', 'URGENT');

-- CreateEnum
CREATE TYPE "TypeEtape" AS ENUM ('ETAPE', 'ARRET', 'CHANGEMENT_DESTINATION', 'ATTENTE_CHARGEMENT', 'CHARGEMENT');

-- CreateEnum
CREATE TYPE "ConformiteFroid" AS ENUM ('CONFORME', 'ALERTE', 'RUPTURE');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('EMISE', 'PARTIELLE', 'PAYEE', 'EN_RETARD');

-- CreateEnum
CREATE TYPE "MoyenPaiement" AS ENUM ('ESPECES', 'ORANGE_MONEY', 'VIREMENT', 'CHEQUE', 'AUTRE');

-- CreateEnum
CREATE TYPE "EvenementSms" AS ENUM ('CHAUFFEUR_AFFECTATION', 'CLIENT_DEPART', 'CLIENT_ARRIVEE', 'CLIENT_LIVRAISON', 'CLIENT_FACTURE', 'CLIENT_RELANCE', 'AUTRE');

-- CreateEnum
CREATE TYPE "CanalMessage" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "StatutSms" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'ECHEC', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeReclamation" AS ENUM ('QUANTITE', 'QUALITE', 'RETARD', 'RUPTURE_FROID', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutReclamation" AS ENUM ('OUVERTE', 'EN_COURS', 'RESOLUE', 'REJETEE');

-- CreateTable
CREATE TABLE "TauxChange" (
    "id" TEXT NOT NULL,
    "devise" "Devise" NOT NULL,
    "tauxEnGnf" DECIMAL(14,4) NOT NULL,
    "dateEffet" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TauxChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camion" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "typeVehicule" "TypeVehicule" NOT NULL DEFAULT 'TRACTEUR_REMORQUE',
    "carrosserie" "Carrosserie" NOT NULL DEFAULT 'FRIGO',
    "refrigere" BOOLEAN NOT NULL DEFAULT true,
    "immatTracteur" TEXT NOT NULL,
    "immatRemorque" TEXT,
    "marqueTracteur" TEXT,
    "telephoneBord1" TEXT,
    "telephoneBord2" TEXT,
    "marqueGroupeFroid" TEXT,
    "modeleGroupeFroid" TEXT,
    "heuresGroupeFroid" INTEGER NOT NULL DEFAULT 0,
    "kilometrage" INTEGER NOT NULL DEFAULT 0,
    "coutAcquisition" DECIMAL(16,2),
    "dateAcquisition" TIMESTAMP(3),
    "dureeAmortissementMois" INTEGER DEFAULT 60,
    "statut" "StatutCamion" NOT NULL DEFAULT 'DISPONIBLE',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Camion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "motDePasse" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CHAUFFEUR',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chauffeurId" TEXT,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chauffeur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "numeroPermis" TEXT,
    "categoriePermis" TEXT DEFAULT 'CE',
    "permisExpire" TIMESTAMP(3),
    "modeRemuneration" "ModeRemuneration" NOT NULL DEFAULT 'FORFAIT_VOYAGE',
    "tauxRemuneration" DECIMAL(12,2),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumero" TEXT,

    CONSTRAINT "Chauffeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unite" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "symbole" TEXT NOT NULL,
    "facteurTonne" DECIMAL(12,6),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneMarchandise" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "uniteId" TEXT NOT NULL,
    "quantiteACharger" DECIMAL(14,3),
    "quantiteRecue" DECIMAL(14,3),
    "quantiteLivree" DECIMAL(14,3),
    "client" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LigneMarchandise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voyage" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "camionId" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "paysDepart" "Pays" NOT NULL DEFAULT 'GUINEE',
    "villeDepart" TEXT NOT NULL,
    "paysArrivee" "Pays" NOT NULL DEFAULT 'GUINEE',
    "villeArrivee" TEXT NOT NULL,
    "client" TEXT,
    "nbRotations" INTEGER NOT NULL DEFAULT 1,
    "tarifRotation" DECIMAL(14,2),
    "aVide" BOOLEAN NOT NULL DEFAULT false,
    "distanceKm" INTEGER,
    "dateDepart" TIMESTAMP(3) NOT NULL,
    "dateArrivee" TIMESTAMP(3),
    "kmDepart" INTEGER,
    "kmArrivee" INTEGER,
    "dateArriveeChargement" TIMESTAMP(3),
    "dateChargement" TIMESTAMP(3),
    "dateArriveeDestination" TIMESTAMP(3),
    "dateDechargement" TIMESTAMP(3),
    "recette" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "recetteGnf" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "remunerationChauffeur" DECIMAL(14,2),
    "statut" "StatutVoyage" NOT NULL DEFAULT 'PLANIFIE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voyage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "type" "TypeDepense" NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "montantGnf" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "litres" DECIMAL(8,2),
    "releveCompteur" INTEGER,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voyageId" TEXT,
    "camionId" TEXT,
    "etapeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reparation" (
    "id" TEXT NOT NULL,
    "camionId" TEXT NOT NULL,
    "categorie" "CategorieReparation" NOT NULL,
    "description" TEXT NOT NULL,
    "garage" TEXT,
    "coutPieces" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "coutMainOeuvre" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "coutTotalGnf" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "kilometrage" INTEGER,
    "heuresGroupe" INTEGER,
    "immobiliseDu" TIMESTAMP(3),
    "immobiliseAu" TIMESTAMP(3),
    "statut" "StatutReparation" NOT NULL DEFAULT 'EN_COURS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reparation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entretien" (
    "id" TEXT NOT NULL,
    "camionId" TEXT NOT NULL,
    "type" "TypeEntretien" NOT NULL,
    "dateFait" TIMESTAMP(3),
    "kmFait" INTEGER,
    "heuresFait" INTEGER,
    "prochainKm" INTEGER,
    "prochainHeures" INTEGER,
    "prochaineDate" TIMESTAMP(3),
    "cout" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "coutGnf" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entretien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementCaisse" (
    "id" TEXT NOT NULL,
    "chauffeurId" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "montantGnf" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "motif" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depenseId" TEXT,

    CONSTRAINT "MouvementCaisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Echeance" (
    "id" TEXT NOT NULL,
    "camionId" TEXT NOT NULL,
    "type" "TypeEcheance" NOT NULL,
    "dateExpiration" TIMESTAMP(3) NOT NULL,
    "rappelJours" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Echeance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerte" (
    "id" TEXT NOT NULL,
    "type" "TypeAlerte" NOT NULL,
    "severite" "SeveriteAlerte" NOT NULL DEFAULT 'ATTENTION',
    "message" TEXT NOT NULL,
    "resolue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "camionId" TEXT,
    "voyageId" TEXT,
    "chauffeurId" TEXT,

    CONSTRAINT "Alerte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapeVoyage" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "type" "TypeEtape" NOT NULL DEFAULT 'ETAPE',
    "villeDepart" TEXT NOT NULL,
    "villeArrivee" TEXT NOT NULL,
    "paysDepart" "Pays",
    "paysArrivee" "Pays",
    "kmDepart" INTEGER,
    "kmArrivee" INTEGER,
    "carburantRestantDepart" DECIMAL(8,2),
    "carburantRestantArrivee" DECIMAL(8,2),
    "motif" TEXT,
    "departLe" TIMESTAMP(3),
    "arriveeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EtapeVoyage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleveTemperature" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "temperature" DECIMAL(4,1) NOT NULL,
    "consigne" DECIMAL(4,1),
    "conformite" "ConformiteFroid" NOT NULL DEFAULT 'CONFORME',
    "releveLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleveTemperature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "ville" TEXT,
    "adresse" TEXT,
    "email" TEXT,
    "contact" TEXT,
    "nif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumero" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "voyageId" TEXT,
    "montant" DECIMAL(14,2) NOT NULL,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "montantGnf" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "echeance" TIMESTAMP(3),
    "statut" "StatutFacture" NOT NULL DEFAULT 'EMISE',
    "marchandiseAssuree" BOOLEAN NOT NULL DEFAULT false,
    "tauxPenaliteRetard" DECIMAL(5,2),
    "afficherEquivalentCfa" BOOLEAN NOT NULL DEFAULT true,
    "montantPayeGnf" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "datePaiement" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parametres" (
    "id" TEXT NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "adresse" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "rccm" TEXT,
    "nif" TEXT,
    "logoUrl" TEXT,
    "orangeMoney" TEXT,
    "banque" TEXT,
    "compteBancaire" TEXT,
    "prefixeFacture" TEXT NOT NULL DEFAULT 'FAC',
    "tvaTaux" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "delaiPaiementJours" INTEGER NOT NULL DEFAULT 14,
    "conditionsPaiement" TEXT,
    "deviseBase" "Devise" NOT NULL DEFAULT 'GNF',
    "tauxReferenceXof" DECIMAL(14,4),
    "consigneFroidDefaut" DECIMAL(4,1),
    "toleranceFroid" DECIMAL(3,1) DEFAULT 1.0,
    "rappelEcheanceJours" INTEGER NOT NULL DEFAULT 30,
    "seuilConsoAnormale" DECIMAL(5,1),
    "smsActif" BOOLEAN NOT NULL DEFAULT false,
    "smsExpediteur" TEXT,
    "urlApplication" TEXT,
    "smsChauffeurAffectation" BOOLEAN NOT NULL DEFAULT true,
    "smsClientDepart" BOOLEAN NOT NULL DEFAULT true,
    "smsClientArrivee" BOOLEAN NOT NULL DEFAULT true,
    "smsClientLivraison" BOOLEAN NOT NULL DEFAULT true,
    "smsClientFacture" BOOLEAN NOT NULL DEFAULT true,
    "smsClientRelance" BOOLEAN NOT NULL DEFAULT false,
    "whatsappActif" BOOLEAN NOT NULL DEFAULT false,
    "accueilSurtitre" TEXT,
    "accueilTitre" TEXT,
    "accueilTexte" TEXT,
    "accueilMention" TEXT,
    "connexionSousTitre" TEXT,
    "accueilAfficherDemo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parametres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "montantGnf" DECIMAL(16,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moyen" "MoyenPaiement" NOT NULL DEFAULT 'ESPECES',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSms" (
    "id" TEXT NOT NULL,
    "evenement" "EvenementSms" NOT NULL,
    "canal" "CanalMessage" NOT NULL DEFAULT 'SMS',
    "canalUtilise" "CanalMessage",
    "destinataire" TEXT NOT NULL,
    "nom" TEXT,
    "message" TEXT NOT NULL,
    "statut" "StatutSms" NOT NULL DEFAULT 'EN_ATTENTE',
    "referenceApi" TEXT,
    "erreur" TEXT,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "envoyeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voyageId" TEXT,
    "factureId" TEXT,
    "chauffeurId" TEXT,
    "clientId" TEXT,

    CONSTRAINT "NotificationSms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrelevementDouane" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "lieu" TEXT NOT NULL,
    "pays" "Pays" NOT NULL DEFAULT 'GUINEE',
    "motif" TEXT,
    "montant" DECIMAL(14,2),
    "devise" "Devise" NOT NULL DEFAULT 'GNF',
    "montantGnf" DECIMAL(16,2),
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrelevementDouane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reclamation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "voyageId" TEXT,
    "factureId" TEXT,
    "ligneId" TEXT,
    "type" "TypeReclamation" NOT NULL,
    "description" TEXT NOT NULL,
    "quantiteContestee" DECIMAL(14,3),
    "statut" "StatutReclamation" NOT NULL DEFAULT 'OUVERTE',
    "resolution" TEXT,
    "montantAvoirGnf" DECIMAL(16,2),
    "dateOuverture" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateResolution" TIMESTAMP(3),

    CONSTRAINT "Reclamation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Camion_immatTracteur_key" ON "Camion"("immatTracteur");

-- CreateIndex
CREATE UNIQUE INDEX "Camion_immatRemorque_key" ON "Camion"("immatRemorque");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_telephone_key" ON "Utilisateur"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_chauffeurId_key" ON "Utilisateur"("chauffeurId");

-- CreateIndex
CREATE UNIQUE INDEX "Unite_nom_key" ON "Unite"("nom");

-- CreateIndex
CREATE INDEX "LigneMarchandise_voyageId_idx" ON "LigneMarchandise"("voyageId");

-- CreateIndex
CREATE UNIQUE INDEX "Voyage_reference_key" ON "Voyage"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "MouvementCaisse_depenseId_key" ON "MouvementCaisse"("depenseId");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_numero_key" ON "Facture"("numero");

-- CreateIndex
CREATE INDEX "Paiement_factureId_date_idx" ON "Paiement"("factureId", "date");

-- CreateIndex
CREATE INDEX "NotificationSms_statut_createdAt_idx" ON "NotificationSms"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "PrelevementDouane_voyageId_idx" ON "PrelevementDouane"("voyageId");

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneMarchandise" ADD CONSTRAINT "LigneMarchandise_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneMarchandise" ADD CONSTRAINT "LigneMarchandise_uniteId_fkey" FOREIGN KEY ("uniteId") REFERENCES "Unite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voyage" ADD CONSTRAINT "Voyage_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "Camion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voyage" ADD CONSTRAINT "Voyage_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "Camion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_etapeId_fkey" FOREIGN KEY ("etapeId") REFERENCES "EtapeVoyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reparation" ADD CONSTRAINT "Reparation_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "Camion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entretien" ADD CONSTRAINT "Entretien_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "Camion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementCaisse" ADD CONSTRAINT "MouvementCaisse_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementCaisse" ADD CONSTRAINT "MouvementCaisse_depenseId_fkey" FOREIGN KEY ("depenseId") REFERENCES "Depense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Echeance" ADD CONSTRAINT "Echeance_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "Camion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "Camion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerte" ADD CONSTRAINT "Alerte_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeVoyage" ADD CONSTRAINT "EtapeVoyage_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleveTemperature" ADD CONSTRAINT "ReleveTemperature_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSms" ADD CONSTRAINT "NotificationSms_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSms" ADD CONSTRAINT "NotificationSms_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSms" ADD CONSTRAINT "NotificationSms_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSms" ADD CONSTRAINT "NotificationSms_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrelevementDouane" ADD CONSTRAINT "PrelevementDouane_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrelevementDouane" ADD CONSTRAINT "PrelevementDouane_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneMarchandise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamation" ADD CONSTRAINT "Reclamation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamation" ADD CONSTRAINT "Reclamation_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamation" ADD CONSTRAINT "Reclamation_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamation" ADD CONSTRAINT "Reclamation_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "LigneMarchandise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
