/**
 * Crée (ou remet à niveau) un compte gérant.
 *
 * C'est le seul chemin pour ouvrir l'application en production : `db:seed`
 * vide les tables avant d'insérer sa démonstration et ne doit jamais toucher
 * une base réelle. Ce script, lui, n'écrase rien d'autre que le compte visé.
 *
 *   npm run creer-gerant
 *
 * Le numéro, le nom et le mot de passe sont demandés à la saisie. Les deux
 * premiers acceptent aussi des arguments, utiles pour rejouer la commande :
 *
 *   npm run creer-gerant -- --tel "+224620000000" --nom "Mamadou Bah"
 *
 * Le mot de passe n'est jamais un argument : il resterait lisible dans
 * l'historique du terminal. Il est saisi sans écho. Il peut aussi venir de
 * la variable MOT_DE_PASSE pour un environnement non interactif (CI, conteneur).
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { PrismaClient } from "@prisma/client";

import { hacherMotDePasse } from "../src/lib/mots-de-passe";
import { normaliserTelephone, telephoneValide } from "../src/lib/telephone";

const db = new PrismaClient();

/** Lit un argument `--nom valeur`. */
function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/**
 * Une seule interface de lecture pour tout le script.
 *
 * En ouvrir puis en refermer une par question fait perdre ce qui reste dans
 * le tampon d'entrée : la question suivante repart sur une saisie vide.
 */
let lecteur: ReturnType<typeof createInterface> | null = null;
function rl() {
  // `terminal` suit l'entrée réelle : forcé à true sur un tube (CI, tests),
  // readline réémet tout le tampon d'un coup et la question suivante repart
  // à vide.
  lecteur ??= createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
  return lecteur;
}

/** Question simple, avec une valeur par défaut si l'on valide à vide. */
async function demander(question: string, defaut = ""): Promise<string> {
  return (await rl().question(question)).trim() || defaut;
}

/** Saisie masquée : un mot de passe ne doit pas rester lisible à l'écran. */
async function demanderMotDePasse(): Promise<string> {
  if (process.env.MOT_DE_PASSE) return process.env.MOT_DE_PASSE;

  const muet = stdout.write.bind(stdout);
  let masquer = false;
  // Écriture détournée le temps de la saisie, pour que le mot de passe ne
  // reste pas lisible à l'écran ni dans l'historique du terminal.
  stdout.write = ((chunk: string, ...reste: unknown[]) =>
    masquer && typeof chunk === "string" && !chunk.includes("\n")
      ? true
      : muet(chunk, ...(reste as []))) as typeof stdout.write;

  const promesse = rl().question("Mot de passe (8 caractères minimum) : ");
  masquer = true;
  const valeur = await promesse;
  masquer = false;
  stdout.write = muet;
  stdout.write("\n");
  return valeur;
}

async function main() {
  // Les arguments restent acceptés, mais leur absence n'est pas une erreur :
  // ce script s'exécute à la main, souvent une seule fois, sur une base vide.
  // Refuser la commande obligerait à la retaper en entier.
  const telSaisi =
    argument("tel") ??
    process.env.TELEPHONE ??
    (await demander("Numéro de connexion (avec l'indicatif, ex. +224620000000) : "));

  if (!telSaisi) {
    console.error("Numéro manquant : la connexion se fait avec ce numéro.");
    process.exit(1);
  }

  // Le numéro sert d'identifiant de connexion : il doit être stocké sous la
  // même forme normalisée que partout ailleurs, sans quoi le compte resterait
  // introuvable à la connexion.
  const telephone = normaliserTelephone(telSaisi);
  if (!telephone || !telephoneValide(telephone)) {
    console.error(`Numéro invalide : « ${telSaisi} ». Indiquez l'indicatif, par exemple +224620000000.`);
    process.exit(1);
  }

  const nom = argument("nom") ?? (await demander("Nom du gérant [Gérant] : ", "Gérant"));

  const motDePasse = await demanderMotDePasse();
  if (motDePasse.length < 8) {
    console.error("Mot de passe trop court : 8 caractères minimum.");
    process.exit(1);
  }

  const existant = await db.utilisateur.findFirst({ where: { telephone } });
  const empreinte = await hacherMotDePasse(motDePasse);

  if (existant) {
    // Compte déjà présent : on le réactive et on lui rend l'accès complet,
    // plutôt que d'échouer. C'est le cas d'usage « j'ai perdu le mot de passe ».
    await db.utilisateur.update({
      where: { id: existant.id },
      data: { nom, role: "GERANT", actif: true, motDePasse: empreinte },
    });
    console.log(`✔ Compte mis à jour : ${nom} — ${telephone} (gérant, actif)`);
  } else {
    await db.utilisateur.create({
      data: { nom, telephone, role: "GERANT", actif: true, motDePasse: empreinte },
    });
    console.log(`✔ Compte créé : ${nom} — ${telephone} (gérant)`);
  }

  // Sans ligne de paramètres, l'application n'a ni identité d'entreprise ni
  // délai de paiement : les factures sortiraient vides.
  const parametres = await db.parametres.findFirst();
  if (!parametres) {
    await db.parametres.create({ data: { raisonSociale: nom } });
    console.log("✔ Paramètres initialisés — complétez-les dans l'application.");
  }

  // Les unités sont indispensables à la saisie d'un voyage.
  const nbUnites = await db.unite.count();
  if (nbUnites === 0) {
    const { UNITES_INITIALES } = await import("../src/lib/unites");
    await db.unite.createMany({ data: [...UNITES_INITIALES] });
    console.log(`✔ ${UNITES_INITIALES.length} unités de mesure créées.`);
  }

  // Sans pays, aucun trajet ni numéro de téléphone n'est saisissable :
  // les listes déroulantes sortiraient vides sur tous les écrans.
  const nbPays = await db.pays.count();
  if (nbPays === 0) {
    const { PAYS_INITIAUX } = await import("../src/lib/pays-initiaux");
    await db.pays.createMany({ data: [...PAYS_INITIAUX] });
    console.log(`✔ ${PAYS_INITIAUX.length} pays créés — ajustez la liste dans l'application.`);
  }

  console.log("\nConnectez-vous avec ce numéro et ce mot de passe.");
}

main()
  .then(() => {
    lecteur?.close();
    return db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    lecteur?.close();
    await db.$disconnect();
    process.exit(1);
  });
