/**
 * Seed PILITrans — données de démonstration alignées sur la maquette.
 * Lancer sur une base vide :  npm run db:push && npm run db:seed
 */
import { Devise, PrismaClient } from "@prisma/client";
import { hacherMotDePasse } from "../src/lib/mots-de-passe";
import { UNITES_INITIALES } from "../src/lib/unites";
import { synchroniserCamion } from "../src/lib/donnees/synchronisation";

const db = new PrismaClient();

async function main() {
  // Nettoyage (ordre des dépendances) pour permettre les reruns
  await db.reclamation.deleteMany();
  await db.prelevementDouane.deleteMany();
  await db.ligneMarchandise.deleteMany();
  await db.releveTemperature.deleteMany();
  await db.facture.deleteMany();
  await db.mouvementCaisse.deleteMany();
  await db.depense.deleteMany();
  await db.etapeVoyage.deleteMany();
  await db.echeance.deleteMany();
  await db.entretien.deleteMany();
  await db.alerte.deleteMany();
  await db.reparation.deleteMany();
  await db.voyage.deleteMany();
  await db.client.deleteMany();
  await db.utilisateur.deleteMany();
  await db.chauffeur.deleteMany();
  await db.camion.deleteMany();
  await db.unite.deleteMany();
  await db.pays.deleteMany();
  await db.tauxChange.deleteMany();
  await db.parametres.deleteMany();

  // --- Paramètres (identité + config) ---
  await db.parametres.create({
    data: {
      raisonSociale: "PILITrans SARL",
      adresse: "Conakry, Guinée",
      // Jeu de démonstration : on affiche les identifiants sur l'écran de
      // connexion. À décocher dans les Paramètres avant toute mise en service.
      accueilAfficherDemo: true,
      telephone: "+224620000000",
      email: "contact@pilitrans.gn",
      orangeMoney: "+224 6XX XX XX XX",
      prefixeFacture: "FAC",
      tvaTaux: 0,
      delaiPaiementJours: 14,
      deviseBase: Devise.GNF,
      tauxReferenceXof: 14.35,
      consigneFroidDefaut: 2,
      toleranceFroid: 1,
      rappelEcheanceJours: 30,
      seuilConsoAnormale: 40,
    },
  });

  // --- Parc ---
  const pili01 = await db.camion.create({
    data: {
      nom: "PILI-01", typeVehicule: "TRACTEUR_REMORQUE", carrosserie: "FRIGO", refrigere: true,
      immatTracteur: "RC-4821-A", immatRemorque: "RC-4821-R", marqueTracteur: "Renault",
      telephoneBord1: "+224620111111", telephoneBord2: "+221771111111",
      marqueGroupeFroid: "Thermo King", heuresGroupeFroid: 4200, kilometrage: 129050,
      coutAcquisition: 420_000_000, dateAcquisition: new Date("2024-03-01"),
      dureeAmortissementMois: 60, statut: "EN_VOYAGE",
    },
  });
  const pili02 = await db.camion.create({
    data: {
      nom: "PILI-02", typeVehicule: "TRACTEUR_REMORQUE", carrosserie: "FRIGO", refrigere: true,
      immatTracteur: "RC-5537-B", marqueTracteur: "Mercedes",
      marqueGroupeFroid: "Carrier", kilometrage: 98700, statut: "IMMOBILISE",
    },
  });
  const pili03 = await db.camion.create({
    data: {
      nom: "PILI-03", typeVehicule: "PORTEUR", carrosserie: "BACHE", refrigere: false,
      immatTracteur: "RC-6910-C", marqueTracteur: "Isuzu",
      telephoneBord1: "+224624332211", kilometrage: 54300, statut: "DISPONIBLE",
    },
  });

  // Parc à venir : benne pour les matériaux, semi-remorque bâchée non frigo.
  const pili04 = await db.camion.create({
    data: {
      nom: "PILI-04", typeVehicule: "PORTEUR", carrosserie: "BENNE", refrigere: false,
      immatTracteur: "RC-7420-D", marqueTracteur: "Howo",
      telephoneBord1: "+224625112233", kilometrage: 8400, statut: "DISPONIBLE",
      coutAcquisition: 180_000_000, dateAcquisition: new Date("2026-06-01"),
      dureeAmortissementMois: 60,
    },
  });

  // --- Chauffeurs ---
  const mamadou = await db.chauffeur.create({
    data: { nom: "Mamadou Diallo", telephone: "+224620222222", categoriePermis: "CE",
      permisExpire: new Date("2027-04-01"), modeRemuneration: "FORFAIT_VOYAGE", tauxRemuneration: 350_000 },
  });
  const ibrahima = await db.chauffeur.create({
    data: { nom: "Ibrahima Bah", telephone: "+224620333333", categoriePermis: "CE",
      modeRemuneration: "COMMISSION", tauxRemuneration: 8 },
  });
  const ousmane = await db.chauffeur.create({
    data: { nom: "Ousmane Camara", telephone: "+224620444444", modeRemuneration: "FORFAIT_VOYAGE", tauxRemuneration: 250_000 },
  });

  // --- Clients ---
  const balde = await db.client.create({
    data: { nom: "Établissements Baldé", ville: "Dakar", telephone: "+221775554433", email: "achats@balde.sn", contact: "Service achats" },
  });
  const pharma = await db.client.create({
    data: { nom: "Pharmacie Centrale", ville: "Labé", telephone: "+224622102030" },
  });
  const madina = await db.client.create({
    data: { nom: "Marché Madina", ville: "Conakry", telephone: "+224622405060" },
  });

  // --- Pays desservis ---
  // Saisis par l'exploitation : ouvrir un corridor n'exige pas de redéployer.
  await db.pays.createMany({
    data: [
      { nom: "Guinée", code: "GN", indicatif: "+224", longueurTelephone: 9, ordre: 10 },
      { nom: "Sénégal", code: "SN", indicatif: "+221", longueurTelephone: 9, ordre: 20 },
      { nom: "Mali", code: "ML", indicatif: "+223", longueurTelephone: 8, ordre: 30 },
      { nom: "Guinée-Bissau", code: "GW", indicatif: "+245", longueurTelephone: 9, ordre: 40 },
      { nom: "Côte d'Ivoire", code: "CI", indicatif: "+225", longueurTelephone: 10, ordre: 50 },
      { nom: "Sierra Leone", code: "SL", indicatif: "+232", longueurTelephone: 8, ordre: 60 },
      { nom: "Liberia", code: "LR", indicatif: "+231", longueurTelephone: 8, ordre: 70 },
      { nom: "Mauritanie", code: "MR", indicatif: "+222", longueurTelephone: 8, ordre: 80 },
    ],
  });
  const pays = Object.fromEntries(
    (await db.pays.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );

  // --- Taux GNF ⇄ CFA observés ---
  // Le taux se relève tout seul sur les transactions en devise. On en pose
  // quelques-uns pour que l'historique soit lisible dès la première ouverture,
  // au lieu d'attendre la première dépense en CFA.
  await db.tauxChange.createMany({
    data: [
      { devise: Devise.XOF, tauxEnGnf: 13.9, dateEffet: new Date("2026-06-12") },
      { devise: Devise.XOF, tauxEnGnf: 14.1, dateEffet: new Date("2026-07-04") },
      { devise: Devise.XOF, tauxEnGnf: 14.0, dateEffet: new Date("2026-07-28") },
      { devise: Devise.XOF, tauxEnGnf: 14.35, dateEffet: new Date("2026-08-15") },
    ],
  });

  // --- Unités de mesure ---
  // Point de départ ; l'exploitation ajoute les siennes depuis l'écran Unités.
  await db.unite.createMany({ data: [...UNITES_INITIALES] });
  const unites = Object.fromEntries(
    (await db.unite.findMany({ select: { id: true, symbole: true } })).map((u) => [u.symbole, u.id]),
  );

  // --- Voyages ---
  const vDakar = await db.voyage.create({
    data: {
      reference: "KD-2026-041", camionId: pili01.id, chauffeurId: mamadou.id,
      paysDepartId: pays["GN"], villeDepart: "Koundara", paysArriveeId: pays["SN"], villeArrivee: "Dakar",
      clientId: balde.id,
      distanceKm: 650, dateDepart: new Date("2026-08-14"), kmDepart: 128400, kmArrivee: 129050,
      dateArriveeDestination: new Date("2026-08-16"),
      recette: 14_200_000, devise: Devise.GNF, recetteGnf: 14_200_000, remunerationChauffeur: 2_100_000,
      statut: "EN_DECHARGEMENT",
      // Chargement mixte : deux marchandises, deux unités différentes.
      lignes: {
        create: [
          { designation: "Produits frais", uniteId: unites["t"], ordre: 10,
            quantiteACharger: 12, quantiteRecue: 12, quantiteLivree: 11.4 },
          { designation: "Riz importé", uniteId: unites["sac"], ordre: 20,
            // Destinataire distinct du client principal : un même camion
            // livre deux clients sur le trajet.
            clientId: madina.id,
            quantiteACharger: 240, quantiteRecue: 240, quantiteLivree: 240 },
        ],
      },
    },
    include: { lignes: true },
  });
  const ligneFrais = vDakar.lignes.find((l) => l.designation === "Produits frais")!;
  const vLabe = await db.voyage.create({
    data: {
      reference: "CL-2026-037", camionId: pili01.id, chauffeurId: mamadou.id,
      villeDepart: "Conakry", villeArrivee: "Labé", clientId: pharma.id,
      distanceKm: 420,
      lignes: {
        create: [
          { designation: "Médicaments", uniteId: unites["carton"], ordre: 10,
            quantiteACharger: 180, quantiteRecue: 180, quantiteLivree: 180 },
        ],
      },
      dateDepart: new Date("2026-08-09"), dateArrivee: new Date("2026-08-10"),
      recette: 6_500_000, recetteGnf: 6_500_000, statut: "TERMINE",
    },
  });
  await db.voyage.create({
    data: {
      reference: "CB-2026-045", camionId: pili03.id, chauffeurId: ousmane.id,
      villeDepart: "Conakry", villeArrivee: "Boké",
      // Départ à vide pour aller CHERCHER la marchandise d'un client :
      // le camion roule vide, mais la course lui est bien imputable.
      clientId: madina.id, aVide: true, vaChercher: true,
      lignes: { create: [{ designation: "Ciment", uniteId: unites["sac"], quantiteACharger: 200, ordre: 10 }] },
      dateDepart: new Date("2026-08-15"), dateArriveeChargement: new Date("2026-08-15"),
      statut: "EN_ATTENTE_CHARGEMENT",
    },
  });

  // Journée de rotations en benne : le trajet vaut pour UNE rotation,
  // la recette se déduit du tarif unitaire.
  await db.voyage.create({
    data: {
      reference: "CS-2026-050", camionId: pili04.id, chauffeurId: ousmane.id,
      villeDepart: "Conakry", villeArrivee: "Coyah", clientId: madina.id,
      lignes: { create: [{ designation: "Sable", uniteId: unites["m³"], quantiteACharger: 8, ordre: 10 }] },
      distanceKm: 45,
      nbRotations: 6, tarifRotation: 450_000,
      recette: 2_700_000, recetteGnf: 2_700_000,
      dateDepart: new Date("2026-08-17"), dateArrivee: new Date("2026-08-17"),
      statut: "TERMINE",
    },
  });

  // --- Frais / dépenses du voyage Dakar ---
  // Le gasoil est un ravitaillement en route : litres saisis, rattaché à l'étape
  // plus bas — c'est ce qui permet le calcul de consommation (consoTroncon).
  const pleinDakar = await db.depense.create({
    data: { type: "GASOIL_TRACTEUR", montant: 8_000_000, montantGnf: 8_000_000,
      litres: 150, releveCompteur: 128_800, description: "Plein à Tambacounda",
      date: new Date("2026-08-15"), voyageId: vDakar.id, camionId: pili01.id },
  });
  await db.depense.createMany({
    data: [
      { type: "DOUANE", montant: 1_000_000, montantGnf: 1_000_000, voyageId: vDakar.id, camionId: pili01.id },
      { type: "PER_DIEM", montant: 500_000, montantGnf: 500_000, voyageId: vDakar.id, camionId: pili01.id },
    ],
  });

  // --- Étapes du voyage Dakar (tronçons km + carburant) ---
  // conso = restant départ + pleins − restant arrivée
  //       = 480 + 150 − 403 = 227 L sur 650 km → 34,9 L/100 km
  await db.etapeVoyage.create({
    data: {
      voyageId: vDakar.id, ordre: 1, type: "ETAPE",
      villeDepart: "Koundara", villeArrivee: "Dakar",
      paysDepartId: pays["GN"], paysArriveeId: pays["SN"],
      kmDepart: 128_400, kmArrivee: 129_050,
      carburantRestantDepart: 480, carburantRestantArrivee: 403,
      departLe: new Date("2026-08-14"), arriveeLe: new Date("2026-08-16"),
      ravitaillements: { connect: { id: pleinDakar.id } },
    },
  });

  // Historique du corridor Conakry–Labé : alimente la suggestion de trajet.
  await db.etapeVoyage.create({
    data: {
      voyageId: vLabe.id, ordre: 1, type: "ETAPE",
      villeDepart: "Conakry", villeArrivee: "Labé",
      kmDepart: 127_980, kmArrivee: 128_400,
      carburantRestantDepart: 620, carburantRestantArrivee: 480,
      departLe: new Date("2026-08-09"), arriveeLe: new Date("2026-08-10"),
    },
  });

  // --- Réparations (plusieurs statuts sur PILI-02) ---
  await db.reparation.createMany({
    data: [
      { camionId: pili02.id, categorie: "GROUPE_FROID", description: "Compresseur groupe froid",
        garage: "Frigo-Service, Dakar", coutPieces: 2_600_000, coutMainOeuvre: 600_000, coutTotalGnf: 3_200_000,
        immobiliseDu: new Date("2026-08-14"), statut: "EN_COURS" },
      { camionId: pili02.id, categorie: "REMORQUE", description: "Plaquettes de frein arrière",
        statut: "A_FAIRE" },
      { camionId: pili01.id, categorie: "TRACTEUR", description: "Vidange", garage: "Garage Central, Conakry",
        coutPieces: 600_000, coutMainOeuvre: 250_000, coutTotalGnf: 850_000, statut: "TERMINEE" },
    ],
  });

  // --- Factures ---
  await db.facture.create({
    data: { numero: "FAC-2026-041", clientId: balde.id, voyageId: vDakar.id,
      montant: 14_200_000, montantGnf: 14_200_000,
      dateEmission: new Date("2026-08-16"), echeance: new Date("2026-08-30"),
      statut: "EMISE", marchandiseAssuree: true, tauxPenaliteRetard: 1.5, afficherEquivalentCfa: true },
  });
  await db.facture.create({
    data: { numero: "FAC-2026-037", clientId: pharma.id, voyageId: vLabe.id,
      montant: 6_500_000, montantGnf: 6_500_000,
      dateEmission: new Date("2026-08-10"), echeance: new Date("2026-08-24"),
      statut: "PAYEE", montantPayeGnf: 6_500_000, datePaiement: new Date("2026-08-15") },
  });
  await db.facture.create({
    data: { numero: "FAC-2026-035", clientId: madina.id,
      // Facture échue : émise le 22 juillet, due au 5 août, toujours impayée.
      montant: 3_100_000, montantGnf: 3_100_000,
      dateEmission: new Date("2026-07-22"), echeance: new Date("2026-08-05"), statut: "EN_RETARD" },
  });

  // --- Relevés de température (chaîne du froid) ---
  await db.releveTemperature.createMany({
    data: [
      { voyageId: vDakar.id, temperature: 2.1, consigne: 2, conformite: "CONFORME" },
      { voyageId: vDakar.id, temperature: 2.3, consigne: 2, conformite: "CONFORME" },
    ],
  });

  // --- Réclamation (quantité contestée) ---
  await db.reclamation.create({
    data: { clientId: balde.id, voyageId: vDakar.id, ligneId: ligneFrais.id,
      type: "QUANTITE", description: "Le client déclare avoir reçu 11,4 t au lieu de 12 t.",
      quantiteContestee: 11.4, statut: "OUVERTE" },
  });

  // --- Caisse chauffeur (multi-devise : GNF détenu + CFA du Sénégal) ---
  //
  // Les avances sont des mouvements de trésorerie : elles ne coûtent rien tant
  // que l'argent n'est pas dépensé. Les sorties, elles, sont toujours l'ombre
  // d'une dépense réelle — c'est ce lien qui garantit que l'argent remis au
  // chauffeur finit imputé au camion, et une seule fois.
  await db.mouvementCaisse.createMany({
    data: [
      { chauffeurId: mamadou.id, type: "AVANCE", montant: 2_000_000, devise: Devise.GNF,
        montantGnf: 2_000_000, motif: "Avance mission Dakar", date: new Date("2026-08-14") },
      { chauffeurId: mamadou.id, type: "AVANCE", montant: 200_000, devise: Devise.XOF,
        montantGnf: 2_870_000, motif: "Avance en CFA (frais au Sénégal)", date: new Date("2026-08-15") },
    ],
  });

  // Deux frais de route payés sur cette caisse, rattachés à leur dépense.
  const douaneRosso = await db.depense.findFirst({
    where: { type: "DOUANE", voyageId: vDakar.id },
  });
  const perDiemDakar = await db.depense.findFirst({
    where: { type: "PER_DIEM", voyageId: vDakar.id },
  });

  for (const [depense, motif] of [
    [douaneRosso, "Douane Rosso"],
    [perDiemDakar, "Per diem mission Dakar"],
  ] as const) {
    if (!depense) continue;
    await db.mouvementCaisse.create({
      data: {
        chauffeurId: mamadou.id,
        type: "DEPENSE",
        montant: Number(depense.montant),
        devise: depense.devise,
        montantGnf: Number(depense.montantGnf),
        motif,
        date: new Date("2026-08-16"),
        depenseId: depense.id,
      },
    });
  }

  // --- Échéances documentaires (alertes à J-30) ---
  await db.echeance.createMany({
    data: [
      { camionId: pili02.id, type: "CARTE_BRUNE_CEDEAO", dateExpiration: new Date("2026-08-24"), rappelJours: 30 },
      { camionId: pili01.id, type: "ASSURANCE", dateExpiration: new Date("2026-09-10"), rappelJours: 30 },
      { camionId: pili01.id, type: "VISITE_TECHNIQUE", dateExpiration: new Date("2027-02-01"), rappelJours: 30 },
    ],
  });

  // --- Entretien préventif ---
  await db.entretien.create({
    data: { camionId: pili01.id, type: "VIDANGE_TRACTEUR", dateFait: new Date("2026-08-02"),
      kmFait: 127_000, prochainKm: 137_000, cout: 1_000_000, coutGnf: 1_000_000 },
  });

  // --- Comptes de connexion (Auth.js) ---
  // Mots de passe de démonstration — à changer en production.
  const mdpDemo = await hacherMotDePasse("pilitrans");
  await db.utilisateur.create({
    data: { nom: "Mamadou Saïdou Bah", telephone: "+224620000000",
      email: "gerant@pilitrans.gn", motDePasse: mdpDemo, role: "GERANT" },
  });
  await db.utilisateur.create({
    data: { nom: "Mamadou Diallo", telephone: "+224620222222",
      motDePasse: mdpDemo, role: "CHAUFFEUR", chauffeurId: mamadou.id },
  });
  await db.utilisateur.create({
    data: { nom: "Ibrahima Bah", telephone: "+224620333333",
      motDePasse: mdpDemo, role: "CHAUFFEUR", chauffeurId: ibrahima.id },
  });
  // Comptes des profils à accès réduit — de quoi vérifier concrètement ce que
  // chaque rôle voit et ce qu'il ne voit pas.
  await db.utilisateur.create({
    data: { nom: "Fatoumata Sylla", telephone: "+224620555555",
      email: "exploitation@pilitrans.gn", motDePasse: mdpDemo, role: "EXPLOITANT" },
  });
  await db.utilisateur.create({
    data: { nom: "Alpha Condé", telephone: "+224620666666",
      email: "compta@pilitrans.gn", motDePasse: mdpDemo, role: "COMPTABLE" },
  });
  await db.utilisateur.create({
    data: { nom: "Aïssatou Barry", telephone: "+224620777777",
      motDePasse: mdpDemo, role: "LECTEUR" },
  });

  // Le statut et le compteur de chaque camion se déduisent des faits.
  // Les écrire à la main dans le seed les ferait naître déjà divergents :
  // PILI-03 était « Disponible » alors qu'il a une mission en cours.
  for (const c of await db.camion.findMany({ select: { id: true } })) {
    await synchroniserCamion(c.id);
  }

  console.log("Seed terminé ✔  (4 camions, 3 chauffeurs, 3 clients, 3 voyages, 3 factures, étapes, caisse, échéances, réparations, réclamation)");
  console.log("Comptes (mot de passe « pilitrans ») :");
  console.log("  +224620000000  gérant");
  console.log("  +224620555555  chef d'exploitation");
  console.log("  +224620666666  comptable");
  console.log("  +224620777777  lecture seule");
  console.log("  +224620222222  chauffeur");
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
