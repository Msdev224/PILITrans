/**
 * Vérifie que Cloudinary est configuré et que la signature est acceptée.
 *
 *   npm run verifier-cloudinary
 *
 * Ne montre jamais le secret : seulement s'il est présent, et ce que
 * Cloudinary répond. Un envoi de test part réellement, puis est supprimé —
 * c'est le seul moyen de savoir que les clés fonctionnent, plutôt que de
 * constater l'échec le jour où un chauffeur ajoute sa photo.
 */
import { createHash } from "node:crypto";

const DOSSIER = "pilitrans";

/** Masque une valeur : on veut savoir qu'elle existe, pas ce qu'elle vaut. */
function masquer(v: string | undefined): string {
  if (!v) return "absente";
  return `présente (${v.length} caractères, se termine par …${v.slice(-4)})`;
}

async function main() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  console.log("CLOUDINARY_CLOUD_NAME  :", cloudName || "absente");
  console.log("CLOUDINARY_API_KEY     :", masquer(apiKey));
  console.log("CLOUDINARY_API_SECRET  :", masquer(apiSecret));
  console.log();

  if (!cloudName || !apiKey || !apiSecret) {
    console.log("→ Configuration incomplète : les photos resteront stockées en base.");
    console.log("  Renseignez les trois valeurs dans .env, puis relancez.");
    process.exit(0);
  }

  // Une image minuscule, juste pour éprouver la signature de bout en bout.
  const pixel =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha1")
    .update(`folder=${DOSSIER}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");

  const corps = new FormData();
  corps.append("file", pixel);
  corps.append("api_key", apiKey);
  corps.append("timestamp", String(timestamp));
  corps.append("folder", DOSSIER);
  corps.append("signature", signature);

  console.log("Envoi d'une image de test…");
  const reponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: corps,
    signal: AbortSignal.timeout(30_000),
  });
  const resultat = (await reponse.json()) as { public_id?: string; error?: { message: string } };

  if (!reponse.ok) {
    console.error(`✘ Refusé (HTTP ${reponse.status}) : ${resultat.error?.message ?? "raison non précisée"}`);
    console.error("  Vérifiez le cloud name, la clé et le secret — et qu'ils viennent du même compte.");
    process.exit(1);
  }

  console.log(`✔ Accepté. Image de test créée : ${resultat.public_id}`);

  // On ne laisse pas traîner le fichier de test dans le compte.
  const tsSuppression = Math.floor(Date.now() / 1000);
  const sigSuppression = createHash("sha1")
    .update(`public_id=${resultat.public_id}&timestamp=${tsSuppression}${apiSecret}`)
    .digest("hex");

  const menage = new FormData();
  menage.append("public_id", String(resultat.public_id));
  menage.append("api_key", apiKey);
  menage.append("timestamp", String(tsSuppression));
  menage.append("signature", sigSuppression);

  const suppression = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: menage,
  });
  console.log(
    suppression.ok
      ? "✔ Image de test supprimée."
      : "⚠ Image de test laissée en place : supprimez-la depuis le tableau de bord.",
  );
  console.log("\nCloudinary est opérationnel. Reste à poser les mêmes clés sur Vercel.");
}

main().catch((e) => {
  console.error("Échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
