/**
 * Vide la base et n'y laisse que le strict nécessaire pour démarrer.
 *
 * À lancer une seule fois, avant la mise en service : il efface le jeu de
 * démonstration — camions, voyages, factures et **tous les comptes**. Le gérant
 * créé ensuite ajoutera lui-même son équipe depuis l'écran Comptes.
 *
 *   npm run reinitialiser -- --confirmer --tel "+224620000000" --nom "…"
 *
 * Sans `--confirmer`, le script montre ce qu'il détruirait et s'arrête.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { PrismaClient } from "@prisma/client";

import { hacherMotDePasse } from "../src/lib/mots-de-passe";
import { normaliserTelephone, telephoneValide } from "../src/lib/telephone";
import { UNITES_INITIALES } from "../src/lib/unites";

const db = new PrismaClient();

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function demanderMotDePasse(): Promise<string> {
  if (process.env.MOT_DE_PASSE) return process.env.MOT_DE_PASSE;

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const muet = stdout.write.bind(stdout);
  let masquer = false;
  stdout.write = ((chunk: string, ...reste: unknown[]) =>
    masquer && typeof chunk === "string" && !chunk.includes("\n")
      ? true
      : muet(chunk, ...(reste as []))) as typeof stdout.write;

  const promesse = rl.question("Mot de passe du gérant (8 caractères minimum) : ");
  masquer = true;
  const valeur = await promesse;
  masquer = false;
  stdout.write = muet;
  stdout.write("\n");
  rl.close();
  return valeur;
}

/** Recensement de ce qui sera détruit, pour que la décision soit éclairée. */
async function inventaire() {
  const [camions, voyages, factures, clients, chauffeurs, comptes, depenses] = await Promise.all([
    db.camion.count(),
    db.voyage.count(),
    db.facture.count(),
    db.client.count(),
    db.chauffeur.count(),
    db.utilisateur.count(),
    db.depense.count(),
  ]);
  return { camions, voyages, factures, clients, chauffeurs, comptes, depenses };
}

async function main() {
  const compte = await inventaire();
  const total = Object.values(compte).reduce((a, b) => a + b, 0);

  console.log("Contenu actuel de la base :");
  console.table(compte);

  if (!process.argv.includes("--confirmer")) {
    console.log(
      total > 0
        ? "\nRien n'a été touché. Relancez avec --confirmer pour tout effacer."
        : "\nLa base est déjà vide. Relancez avec --confirmer pour créer le gérant.",
    );
    process.exit(0);
  }

  const nom = argument("nom") ?? "Gérant";
  const telephone = normaliserTelephone(argument("tel") ?? process.env.TELEPHONE);
  if (!telephone || !telephoneValide(telephone)) {
    console.error("Numéro manquant ou invalide. Exemple : --tel \"+224620000000\"");
    process.exit(1);
  }

  const motDePasse = await demanderMotDePasse();
  if (motDePasse.length < 8) {
    console.error("Mot de passe trop court : 8 caractères minimum.");
    process.exit(1);
  }

  // Ordre imposé par les clés étrangères : les enfants avant les parents.
  console.log("\nEffacement…");
  await db.notificationSms.deleteMany();
  await db.reclamation.deleteMany();
  await db.paiement.deleteMany();
  await db.facture.deleteMany();
  await db.releveTemperature.deleteMany();
  await db.prelevementDouane.deleteMany();
  await db.mouvementCaisse.deleteMany();
  await db.depense.deleteMany();
  await db.ligneMarchandise.deleteMany();
  await db.etapeVoyage.deleteMany();
  await db.alerte.deleteMany();
  await db.voyage.deleteMany();
  await db.echeance.deleteMany();
  await db.entretien.deleteMany();
  await db.reparation.deleteMany();
  await db.client.deleteMany();
  await db.utilisateur.deleteMany();
  await db.chauffeur.deleteMany();
  await db.camion.deleteMany();
  await db.tauxChange.deleteMany();
  await db.unite.deleteMany();
  await db.parametres.deleteMany();

  // Le gérant est le seul compte créé : il ajoutera son équipe lui-même depuis
  // l'écran Comptes, avec les droits qu'il jugera utiles.
  await db.utilisateur.create({
    data: { nom, telephone, role: "GERANT", actif: true, motDePasse: await hacherMotDePasse(motDePasse) },
  });

  // Sans paramètres, les factures sortiraient sans identité d'entreprise.
  // `accueilAfficherDemo` reste à false : la page de connexion est publique.
  await db.parametres.create({ data: { raisonSociale: nom } });

  // Sans unités, aucun voyage n'est saisissable.
  await db.unite.createMany({ data: [...UNITES_INITIALES] });

  console.log("\n✔ Base réinitialisée.");
  console.log(`✔ Gérant : ${nom} — ${telephone}`);
  console.log(`✔ ${UNITES_INITIALES.length} unités de mesure créées.`);
  console.log("✔ Paramètres initialisés — complétez-les dans l'application.");
  console.log("\nConnectez-vous, puis créez votre équipe depuis Paramètres → Comptes.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await db.$disconnect();
    process.exit(1);
  });
