import "server-only";

import { prisma } from "@/lib/prisma";

export interface LigneUtilisateur {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  role: string;
  actif: boolean;
  /** Un compte chauffeur est rattaché à une fiche ; les autres non. */
  chauffeurId: string | null;
  chauffeurNom: string | null;
  /** Un compte sans empreinte ne peut pas se connecter tant qu'on ne lui en donne pas une. */
  motDePasseDefini: boolean;
  creeLe: Date;
}

export async function listeUtilisateurs(): Promise<LigneUtilisateur[]> {
  const lignes = await prisma.utilisateur.findMany({
    orderBy: [{ actif: "desc" }, { role: "asc" }, { nom: "asc" }],
    select: {
      id: true,
      nom: true,
      telephone: true,
      email: true,
      role: true,
      actif: true,
      motDePasse: true,
      createdAt: true,
      chauffeurId: true,
      chauffeur: { select: { nom: true } },
    },
  });

  return lignes.map((u) => ({
    id: u.id,
    nom: u.nom,
    telephone: u.telephone,
    email: u.email,
    role: u.role,
    actif: u.actif,
    chauffeurId: u.chauffeurId,
    chauffeurNom: u.chauffeur?.nom ?? null,
    // On expose l'existence de l'empreinte, jamais l'empreinte elle-même.
    motDePasseDefini: !!u.motDePasse,
    creeLe: u.createdAt,
  }));
}

/** Fiches chauffeur qui n'ont pas encore de compte, pour le rattachement. */
export async function chauffeursSansCompte(sauf?: string | null) {
  const chauffeurs = await prisma.chauffeur.findMany({
    where: { actif: true, OR: [{ utilisateur: null }, { id: sauf ?? "" }] },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });
  return chauffeurs;
}
