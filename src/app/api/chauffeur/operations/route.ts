/**
 * Rejeu d'une saisie faite hors réseau.
 *
 * Le téléphone renvoie ici, une par une et dans l'ordre, les saisies qu'il a
 * gardées. Chacune porte l'identifiant produit sur l'appareil : c'est lui qui
 * empêche qu'une avance soit comptée deux fois si la réponse s'est perdue.
 *
 * Les actions appelées sont exactement celles des formulaires en ligne. Une
 * saisie différée n'emprunte donc aucun chemin de contrôle plus permissif :
 * même validation, même vérification que la mission appartient bien au
 * chauffeur connecté.
 */
import { NextResponse } from "next/server";

import { sessionRequise } from "@/auth";
import {
  ajouterRotation,
  avancerMission,
  confirmerChargement,
  confirmerLivraison,
  saisirDepense,
  signalerArret,
  type EtatChauffeur,
} from "@/actions/chauffeur";
import { declarerPrelevement } from "@/actions/douane";
import { enregistrerReleve } from "@/actions/froid";
import { CHAMP_SAISIE, estActionDifferee, type ActionDifferee } from "@/lib/chauffeur/operations";
import { prisma } from "@/lib/prisma";

/** Résultat commun aux actions de formulaire. */
type Etat = { ok?: boolean; erreur?: string; champs?: Record<string, string> };

const APPLICATEURS: Record<ActionDifferee, (donnees: FormData) => Promise<Etat>> = {
  // Les deux premières prennent l'identifiant de mission en argument lié ;
  // le formulaire suit en second, comme le fait React en ligne.
  avancerMission: async (d) => {
    await avancerMission(String(d.get("voyageId") ?? ""), d);
    return { ok: true };
  },
  ajouterRotation: async (d) => {
    await ajouterRotation(String(d.get("voyageId") ?? ""), d);
    return { ok: true };
  },
  confirmerChargement: (d) => confirmerChargement({} as EtatChauffeur, d),
  confirmerLivraison: (d) => confirmerLivraison({} as EtatChauffeur, d),
  signalerArret: (d) => signalerArret({} as EtatChauffeur, d),
  saisirDepense: (d) => saisirDepense({} as EtatChauffeur, d),
  enregistrerReleve: (d) => enregistrerReleve({}, d),
  declarerPrelevement: (d) => declarerPrelevement({}, d),
};

interface Corps {
  id?: unknown;
  action?: unknown;
  champs?: unknown;
  saisieLe?: unknown;
}

export async function POST(requete: Request) {
  const session = await sessionRequise();
  const chauffeurId = session.user.chauffeurId;
  if (session.user.role !== "CHAUFFEUR" || !chauffeurId) {
    return NextResponse.json({ ok: false, definitif: true, erreur: "Réservé au chauffeur." }, { status: 403 });
  }

  let corps: Corps;
  try {
    corps = (await requete.json()) as Corps;
  } catch {
    return NextResponse.json({ ok: false, definitif: true, erreur: "Saisie illisible." }, { status: 400 });
  }

  const id = typeof corps.id === "string" ? corps.id : "";
  const action = typeof corps.action === "string" ? corps.action : "";
  const saisieLe = typeof corps.saisieLe === "string" ? corps.saisieLe : "";
  const champs = corps.champs;

  if (!id || typeof champs !== "object" || champs === null) {
    return NextResponse.json({ ok: false, definitif: true, erreur: "Saisie incomplète." }, { status: 400 });
  }

  // La liste des actions différables est la frontière de ce qu'un téléphone
  // peut déclencher ici. Tout le reste — la confirmation par code comme une
  // action du cockpit — doit passer par son propre chemin, en ligne.
  if (!estActionDifferee(action)) {
    return NextResponse.json(
      { ok: false, definitif: true, erreur: "Cette saisie doit être faite en ligne." },
      { status: 400 },
    );
  }

  // Déjà appliquée : la réponse précédente s'était perdue en route. On répond
  // « c'est fait » pour que le téléphone la retire de sa file.
  const dejaVue = await prisma.operationChauffeur.findUnique({ where: { id } });
  if (dejaVue) return NextResponse.json({ ok: true, deja: true });

  /*
   * La trace est posée AVANT d'appliquer, et retirée si l'application échoue.
   *
   * L'ordre inverse — appliquer puis tracer — laisserait un renvoi compter
   * une dépense deux fois si le serveur s'arrêtait entre les deux. Compter
   * deux fois de l'argent est pire que faire refaire une saisie, et le
   * chauffeur voit sa file, donc il sait ce qui n'est pas passé.
   */
  await prisma.operationChauffeur.create({
    data: { id, chauffeurId, action, saisieLe: new Date(saisieLe || Date.now()) },
  });

  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs as Record<string, unknown>)) {
    if (typeof valeur === "string") donnees.set(cle, valeur);
  }
  donnees.set(CHAMP_SAISIE, saisieLe);

  try {
    const resultat = await APPLICATEURS[action](donnees);

    if (resultat.ok) return NextResponse.json({ ok: true });

    // Refus de validation : la renvoyer telle quelle donnera le même refus.
    // Le téléphone doit la sortir de sa file et le montrer au chauffeur.
    await prisma.operationChauffeur.delete({ where: { id } });
    const detail = resultat.erreur ?? Object.values(resultat.champs ?? {})[0];
    return NextResponse.json({ ok: false, definitif: true, erreur: detail ?? "Saisie refusée." });
  } catch (e) {
    await prisma.operationChauffeur.delete({ where: { id } }).catch(() => {});

    // Une mission qui n'appartient plus au chauffeur, ou déjà clôturée, ne
    // passera jamais : inutile de la renvoyer indéfiniment.
    const message = e instanceof Error ? e.message : "Envoi impossible.";
    const definitif = /ne vous est pas attribuée|déjà clôturée|introuvable|réservée au chauffeur/i.test(message);
    return NextResponse.json({ ok: false, definitif, erreur: message }, { status: definitif ? 200 : 503 });
  }
}
