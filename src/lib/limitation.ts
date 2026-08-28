import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Verrou anti-force-brute, tenu en base.
 *
 * Il vivait dans une `Map` du processus, avec ce commentaire : « suffisant pour
 * une instance unique, ce qui est le cas ici ». La prémisse a cessé d'être
 * vraie au passage sur un hébergement sans état — chaque fonction s'exécute
 * dans un processus qui peut être neuf, et plusieurs tournent en parallèle. Un
 * attaquant obtenait donc cinq tentatives **par instance**, et les instances se
 * multipliaient d'elles-mêmes sous la charge qu'il générait.
 *
 * La base est le seul état partagé entre les instances : le compteur y vit
 * désormais, sur la fiche de l'utilisateur.
 */

/*
 * Réglages lus dans les Paramètres.
 *
 * Cinq essais et quinze minutes étaient des constantes du code. Le bon
 * arbitrage dépend de qui se connecte : un chauffeur qui tape au pouce sur un
 * téléphone de bord se trompe plus souvent qu'un gérant au clavier. Les
 * valeurs de repli servent si la ligne de paramètres n'existe pas encore.
 */
const MAX_ECHECS_DEFAUT = 5;
const BLOCAGE_MIN_DEFAUT = 15;

async function reglages() {
  const p = await prisma.parametres
    .findFirst({ select: { maxEchecsConnexion: true, blocageConnexionMin: true } })
    .catch(() => null);
  return {
    maxEchecs: p?.maxEchecsConnexion ?? MAX_ECHECS_DEFAUT,
    fenetreMs: (p?.blocageConnexionMin ?? BLOCAGE_MIN_DEFAUT) * 60_000,
  };
}

export interface EtatLimitation {
  bloque: boolean;
  minutesRestantes: number;
  essaisRestants: number;
}

const libre: EtatLimitation = { bloque: false, minutesRestantes: 0, essaisRestants: MAX_ECHECS_DEFAUT };

function etat(echecs: number, bloqueJusqua: Date | null, maxEchecs: number): EtatLimitation {
  const reste = bloqueJusqua ? bloqueJusqua.getTime() - Date.now() : 0;
  if (reste <= 0) return { ...libre, essaisRestants: maxEchecs };
  return {
    bloque: echecs >= maxEchecs,
    minutesRestantes: Math.max(1, Math.ceil(reste / 60_000)),
    essaisRestants: Math.max(0, maxEchecs - echecs),
  };
}

/** Consulte le verrou sans rien incrémenter. */
export async function verifierLimitation(utilisateurId: string): Promise<EtatLimitation> {
  const u = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { echecsConnexion: true, bloqueJusqua: true },
  });
  if (!u) return libre;
  const { maxEchecs } = await reglages();
  return etat(u.echecsConnexion, u.bloqueJusqua, maxEchecs);
}

/**
 * Enregistre un échec.
 *
 * Chaque échec repousse la fenêtre : insister prolonge le blocage au lieu de
 * l'épuiser. Le compteur repart de zéro si la fenêtre précédente est expirée,
 * pour ne pas punir indéfiniment quelqu'un qui se trompe une fois par mois.
 */
export async function enregistrerEchec(utilisateurId: string): Promise<EtatLimitation> {
  const u = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { echecsConnexion: true, bloqueJusqua: true },
  });
  if (!u) return libre;

  const { maxEchecs, fenetreMs } = await reglages();
  const fenetreOuverte = !!u.bloqueJusqua && u.bloqueJusqua.getTime() > Date.now();
  const echecs = (fenetreOuverte ? u.echecsConnexion : 0) + 1;
  const bloqueJusqua = new Date(Date.now() + fenetreMs);

  await prisma.utilisateur.update({
    where: { id: utilisateurId },
    data: { echecsConnexion: echecs, bloqueJusqua },
  });

  return etat(echecs, bloqueJusqua, maxEchecs);
}

/** Remet le compteur à zéro et horodate la connexion réussie. */
export async function reinitialiserLimitation(utilisateurId: string): Promise<void> {
  await prisma.utilisateur.update({
    where: { id: utilisateurId },
    data: { echecsConnexion: 0, bloqueJusqua: null, derniereConnexion: new Date() },
  });
}
