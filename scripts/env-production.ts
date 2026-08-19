/**
 * Prépare les variables à coller dans Vercel, à partir du `.env` local.
 *
 * Trois corrections y sont faites, celles qu'on oublie systématiquement :
 *  - `DIRECT_URL` perd le `-pooler` (les migrations ne passent pas par le pool) ;
 *  - `AUTH_SECRET` est régénéré : une clé de développement n'a rien à faire
 *    en production, et celle-ci a pu circuler ;
 *  - les variables vides sont écartées, elles n'apportent rien.
 *
 * Le résultat est écrit dans un fichier — jamais affiché à l'écran, pour ne pas
 * laisser de secret dans l'historique du terminal.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const SORTIE = ".env.vercel";

const lignes = readFileSync(".env", "utf8").split("\n");
const valeurs = new Map<string, string>();

for (const ligne of lignes) {
  const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(ligne);
  if (!m) continue;
  const valeur = m[2].trim().replace(/^["']|["']$/g, "");
  if (valeur) valeurs.set(m[1], valeur);
}

const base = valeurs.get("DATABASE_URL");
if (!base) {
  console.error("DATABASE_URL introuvable dans .env");
  process.exit(1);
}

const production = new Map<string, string>([
  ["DATABASE_URL", base],
  // La directe est la poolée sans `-pooler` : même hôte, sans le pool.
  ["DIRECT_URL", base.replace("-pooler", "")],
  ["AUTH_SECRET", randomBytes(32).toString("base64")],
  ["AUTH_TRUST_HOST", "true"],
]);

// Les clés Nimba ne sont reprises que si elles existent vraiment.
for (const cle of ["NIMBA_SMS_SERVICE_ID", "NIMBA_SMS_SECRET_TOKEN"]) {
  const v = valeurs.get(cle);
  if (v) production.set(cle, v);
}

writeFileSync(SORTIE, [...production].map(([k, v]) => `${k}="${v}"`).join("\n") + "\n");

console.log(`✔ ${SORTIE} écrit — ${production.size} variables.`);
console.log("");
console.log("Contrôles :");
console.log(`  DATABASE_URL  ${base.includes("-pooler") ? "avec pooler ✔" : "SANS pooler ⚠ (attendu : avec)"}`);
console.log(`  DIRECT_URL    ${production.get("DIRECT_URL")!.includes("-pooler") ? "avec pooler ⚠" : "sans pooler ✔"}`);
console.log("  AUTH_SECRET   régénéré ✔");
console.log("");
console.log("Ouvrez ce fichier, copiez tout, collez-le dans Vercel.");
console.log("Il est ignoré par git et peut être supprimé ensuite.");
