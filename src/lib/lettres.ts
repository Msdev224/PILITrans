/**
 * Écriture des montants en toutes lettres (français), pour la mention
 * « Arrêtée la présente facture à la somme de… » exigée sur une facture.
 * Orthographe classique : « quatre-vingts » prend un s seul, « cent » s'accorde
 * s'il n'est pas suivi d'un autre nombre.
 */

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const DIZAINES = [
  "", "", "vingt", "trente", "quarante", "cinquante",
  "soixante", "soixante", "quatre-vingt", "quatre-vingt",
];

/**
 * `accord` : « cent » et « quatre-vingt » prennent un s quand ils sont
 * multipliés et terminent le nombre, ou sont suivis d'un nom (millions,
 * milliards). Devant « mille », qui est un adjectif numéral, ils restent
 * invariables : deux cents, mais deux cent mille.
 */
function sousCent(n: number, accord = true): string {
  if (n < 20) return UNITES[n];

  const d = Math.floor(n / 10);
  const u = n % 10;

  // 70-79 et 90-99 se construisent sur soixante et quatre-vingt.
  if (d === 7 || d === 9) {
    const reste = sousCent(10 + u);
    const base = DIZAINES[d];
    return u === 1 && d === 7 ? `${base} et onze` : `${base}-${reste}`;
  }

  if (u === 0) return d === 8 && accord ? "quatre-vingts" : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

function sousMille(n: number, accord = true): string {
  if (n < 100) return sousCent(n, accord);

  const c = Math.floor(n / 100);
  const reste = n % 100;
  const prefixe = c === 1 ? "cent" : `${UNITES[c]} cent`;

  if (reste === 0) return c === 1 || !accord ? (c === 1 ? "cent" : prefixe) : `${prefixe}s`;
  return `${prefixe} ${sousCent(reste, accord)}`;
}

const ECHELLES: { valeur: number; singulier: string; pluriel: string }[] = [
  { valeur: 1_000_000_000, singulier: "milliard", pluriel: "milliards" },
  { valeur: 1_000_000, singulier: "million", pluriel: "millions" },
  { valeur: 1_000, singulier: "mille", pluriel: "mille" },
];

/** `14200000` → « quatorze millions deux cent mille ». */
export function enLettres(valeur: number): string {
  const n = Math.round(Math.abs(valeur));
  if (n === 0) return "zéro";

  const morceaux: string[] = [];
  let reste = n;

  for (const echelle of ECHELLES) {
    const quotient = Math.floor(reste / echelle.valeur);
    if (quotient === 0) continue;
    reste %= echelle.valeur;

    // « mille » est invariable et ne prend pas « un » devant ; il bloque
    // aussi l'accord de cent et quatre-vingt qui le précèdent.
    if (echelle.valeur === 1_000) {
      morceaux.push(quotient === 1 ? "mille" : `${sousMille(quotient, false)} mille`);
    } else {
      const nom = quotient > 1 ? echelle.pluriel : echelle.singulier;
      morceaux.push(`${sousMille(quotient)} ${nom}`);
    }
  }

  if (reste > 0) morceaux.push(sousMille(reste));

  const texte = morceaux.join(" ");
  return valeur < 0 ? `moins ${texte}` : texte;
}

/** `14200000` → « quatorze millions deux cent mille francs guinéens ». */
export function montantEnLettres(valeur: number, devise: "GNF" | "XOF" = "GNF"): string {
  const unite = devise === "XOF" ? "francs CFA" : "francs guinéens";
  return `${enLettres(valeur)} ${unite}`;
}
