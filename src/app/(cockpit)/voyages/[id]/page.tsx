import Link from "next/link";
import { notFound } from "next/navigation";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconeInfo, IconePlus } from "@/components/icones";
import { ActionsEtape } from "@/components/voyages/actions-etape";
import {
  DialogueEtape,
  type RavitaillementOption,
} from "@/components/voyages/dialogue-etape";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { soldeCaisse } from "@/lib/calculs";
import { retablirVoyage } from "@/actions/voyages";
import { BoutonConfirme } from "@/components/bouton-confirme";
import { DialogueCaisse } from "@/components/equipe/dialogue-caisse";
import { DialogueAnnulation } from "@/components/voyages/dialogue-annulation";
import { ficheVoyage, type TronconVue } from "@/lib/donnees/voyages";
import { moyensActifs } from "@/lib/donnees/moyens-paiement";
import { prisma } from "@/lib/prisma";
import {
  LIBELLE_MOUVEMENT,
  LIBELLE_SEGMENT,
  LIBELLE_STATUT_VOYAGE,
  LIBELLE_TYPE_DEPENSE,
  LIBELLE_TYPE_ETAPE,
  formatDate,
  formatDecimal,
  formatGnf,
  formatNombre,
  formatSigne,
  n,
} from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";
import { formatQuantite } from "@/lib/donnees/unites";
import { supprimerPrelevement } from "@/actions/douane";
import { ActionsCodeLivraison } from "@/components/voyages/actions-code-livraison";
import {
  DialogueFacture,
  type OptionVoyageFacturable,
} from "@/components/factures/dialogue-facture";
import { IconeFacture } from "@/components/icones";
import { paysActifs } from "@/lib/donnees/pays";

export const dynamic = "force-dynamic";

export default async function FicheVoyagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, fiche, parametres, fil, pays, clients, moyens] = await Promise.all([
    sessionRequise(),
    ficheVoyage(id),
    prisma.parametres.findFirst(),
    filAlertes(),
    paysActifs(),
    prisma.client.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }),
    moyensActifs(),
  ]);

  if (!fiche) notFound();
  const { voyage } = fiche;

  /*
   * Une mission annulée se consulte, mais n'accepte plus rien.
   *
   * Le serveur refuse déjà toute écriture ; masquer les boutons évite de
   * proposer une action qui échouera, et rend visible qu'il faut d'abord
   * rétablir la mission.
   */
  const annulee = voyage.statut === "ANNULE";

  /*
   * Solde de caisse du chauffeur, toutes missions confondues.
   *
   * Il sert de contexte au moment de lui remettre de l'argent : recharger
   * quelqu'un qui détient déjà de quoi finir la route n'a pas le même sens
   * que recharger une caisse à sec.
   */
  const mouvementsChauffeur = await prisma.mouvementCaisse.findMany({
    where: { chauffeurId: voyage.chauffeurId },
    select: { type: true, montant: true, devise: true, montantGnf: true },
  });
  const caisseChauffeur = soldeCaisse(
    mouvementsChauffeur.map((m) => ({
      type: m.type,
      montant: n(m.montant),
      devise: m.devise,
      montantGnf: n(m.montantGnf),
    })),
  );

  // Une mission déjà facturée mène à sa facture ; sinon on propose de la
  // créer, avec ce que la mission sait déjà.
  const factureExistante = voyage.factures[0] ?? null;
  const optionFacturable: OptionVoyageFacturable = {
    id: voyage.id,
    libelle: `${voyage.villeDepart} → ${voyage.villeArrivee} (${voyage.reference})`,
    client: voyage.client?.nom ?? null,
    clientId: voyage.clientId,
    marchandise: fiche.chargement === "—" ? null : fiche.chargement,
    recette: n(voyage.recette),
    devise: voyage.devise,
    recetteGnf: fiche.recetteGnf,
    dejaFacture: fiche.facture,
  };

  /*
   * Carburant de la mission, ventilé par segment.
   *
   * Sur un aller-retour, un total unique ne dit rien : c'est en comparant ce
   * que l'aller et le retour ont coûté qu'on voit un retour à vide trop cher
   * ou un plein annoncé pour les deux sens qui n'a servi qu'à l'aller. Les
   * dépenses sans segment renseigné restent comptées à part, sans être
   * réparties arbitrairement.
   */
  const carburantParSegment = fiche.postes
    .filter((d) => d.type === "GASOIL_TRACTEUR" || d.type === "GASOIL_GROUPE_FROID")
    .reduce<Record<string, { litres: number; montantGnf: number }>>((acc, d) => {
      const cle = d.segment ?? "NON_PRECISE";
      acc[cle] ??= { litres: 0, montantGnf: 0 };
      acc[cle].litres += n(d.litres);
      acc[cle].montantGnf += n(d.montantGnf);
      return acc;
    }, {});
  const segmentsCarburant = Object.entries(carburantParSegment);

  // Pleins saisis en litres : rattachables à un tronçon.
  const dejaRattaches = new Set(
    fiche.troncons.flatMap((t) => t.etape.ravitaillements.map((r) => r.id)),
  );
  const ravitaillements: RavitaillementOption[] = fiche.postes
    .filter((d) => d.litres != null && n(d.litres) > 0)
    .map((d) => ({
      id: d.id,
      libelle: `${LIBELLE_TYPE_DEPENSE[d.type] ?? d.type}${d.description ? ` — ${d.description}` : ""}`,
      litres: n(d.litres),
      prisAilleurs: false,
    }));

  /*
   * Une mission déjà réglée ne s'annule pas : l'annulation efface la recette
   * alors que l'argent, lui, reste en trésorerie. Le serveur le refuse ; on
   * le dit ici pour ne pas proposer un geste voué à l'échec.
   */
  const facturesReglees = voyage.factures.filter((f) => n(f.montantPayeGnf) > 0);
  const reglementRecu = facturesReglees.length > 0;
  const motifBlocage = reglementRecu
    ? `Règlement encaissé sur ${facturesReglees.map((f) => f.numero).join(", ")}. ` +
      "Retirez d'abord le règlement de la facture, ou passez un avoir."
    : null;

  return (
    <>
      <BarreHaut
        titre={`${voyage.villeDepart} → ${voyage.villeArrivee}`}
        sousTitre={`${voyage.reference} · ${voyage.camion.nom} · ${voyage.chauffeur.nom} · ${formatDate(voyage.dateDepart)}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <Link href="/voyages" className="link text-[13px]">
            ← Retour aux voyages
          </Link>

          {/* Le rapport de mission réunit sur une feuille ce que le cockpit
              répartit sur cet écran : quantités, carburant, froid, argent. Il
              s'ouvre dans la coquille d'impression, sans rail ni barre haute. */}
          <Link
            href={`/voyages/${voyage.id}/rapport`}
            className="btn ghost sm ml-auto mr-2"
            prefetch={false}
          >
            Rapport de mission
          </Link>

          {/* Annuler n'efface rien : les frais engagés et l'argent déjà remis
              restent au compte du camion. Seule la recette attendue disparaît.
              Une mission rétablie repart de l'état planifié. */}
          <SiPeut droit="voyages.ecrire">
            {voyage.statut === "ANNULE" ? (
              <BoutonConfirme
                action={retablirVoyage.bind(null, voyage.id)}
                titre={`Rétablir la mission ${voyage.reference} ?`}
                detail="Elle repart de l'état planifié : à toi de reprendre son avancement, rien ne dit que le camion est encore où il était."
                confirmer="Oui, rétablir"
                declencheur={
                  <button type="button" className="btn ghost sm">
                    Rétablir la mission
                  </button>
                }
              />
            ) : (
              reglementRecu ? (
                /* Le refus est prononcé côté serveur ; l'afficher ici évite
                   d'ouvrir un dialogue pour n'y proposer qu'un échec. */
                <span className="mention-bloquee" title={motifBlocage ?? undefined}>
                  Annulation impossible — règlement encaissé
                </span>
              ) : (
                <DialogueAnnulation
                  voyageId={voyage.id}
                  reference={voyage.reference}
                  trajet={`${voyage.villeDepart} → ${voyage.villeArrivee}`}
                  aDesEcritures={fiche.postes.length > 0 || fiche.facture || fiche.troncons.length > 0}
                  declencheur={
                    <button type="button" className="btn ghost sm">
                      Annuler la mission
                    </button>
                  }
                />
              )
            )}
          </SiPeut>

          {/* La facture se crée DEPUIS la mission (CLAUDE.md) : le client, la
              marchandise et le montant en sont repris tels quels. La proposer
              ici évite d'aller la chercher ailleurs et de ressaisir des
              chiffres déjà connus — donc de les saisir différemment. */}
          <SiPeut droit="facturation.ecrire">
            {annulee ? null : factureExistante ? (
              <Link href={`/factures?q=${encodeURIComponent(factureExistante.numero)}`} className="btn ghost sm">
                <IconeFacture width={14} height={14} />
                Facture {factureExistante.numero}
              </Link>
            ) : fiche.recetteGnf > 0 ? (
              <DialogueFacture
                clients={clients}
                voyages={[optionFacturable]}
                delaiPaiementJours={parametres?.delaiPaiementJours ?? 14}
                tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
                voyageImpose={voyage.id}
                declencheur={
                  <button type="button" className="btn-add">
                    <IconeFacture width={14} height={14} />
                    Générer la facture
                  </button>
                }
              />
            ) : (
              // Sans montant facturé, une facture partirait à zéro.
              <span className="text-[11.5px] text-[var(--muted-2)]">
                Renseigne le montant convenu avec le client pour pouvoir facturer.
              </span>
            )}
          </SiPeut>
        </div>

        {/* Sans ce bandeau, une fiche sans aucun bouton passerait pour un
            écran cassé plutôt que pour une mission volontairement figée. */}
        {annulee ? (
          <div className="bandeau-annule mb-5">
            <b>Mission annulée{voyage.annuleLe ? ` le ${formatDate(voyage.annuleLe)}` : ""}.</b>
            <p>
              {voyage.motifAnnulation
                ? `Motif : ${voyage.motifAnnulation}.`
                : "Aucun motif n'a été noté."}{" "}
              Elle reste consultable, mais n&apos;accepte plus aucune saisie — ni dépense, ni
              étape, ni facture, ni remise d&apos;argent. Rétablis-la pour reprendre la main.
            </p>
          </div>
        ) : null}

        {/* ---------- Résumé de la mission ---------- */}
        <div className="vstats">
          <div className="vstat">
            <div className="vs-lab">Recette</div>
            <div className="vs-val pos">{formatNombre(fiche.recetteGnf)}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Frais de voyage</div>
            <div className="vs-val">{formatNombre(fiche.fraisGnf)}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Rémunération chauffeur</div>
            <div className="vs-val">{formatNombre(fiche.remunerationGnf)}</div>
          </div>
          <div className="vstat">
            <div className="vs-lab">Marge de la mission</div>
            <div className={`vs-val ${fiche.margeGnf >= 0 ? "pos" : "warn"}`}>
              {formatSigne(fiche.margeGnf)}
            </div>
          </div>
        </div>

        <div className="card panel mb-5">
          <h3>Mission</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-[var(--muted)]">
            <Info libelle="État" valeur={LIBELLE_STATUT_VOYAGE[voyage.statut]} />
            <Info
              libelle="Trajet"
              valeur={`${voyage.paysDepart?.nom ?? "—"} → ${voyage.paysArrivee?.nom ?? "—"}`}
            />
            <Info libelle="Client" valeur={voyage.client?.nom ?? "—"} />
            {/* Le trajet à vide vers un chargement n'est pas un
                repositionnement : la course appartient au client. */}
            {voyage.aVide ? (
              <Info
                libelle="À vide"
                valeur={voyage.vaChercher ? "Va chercher la marchandise" : "Repositionnement"}
              />
            ) : null}
            <Info libelle="Distance" valeur={fiche.km > 0 ? `${formatNombre(fiche.km)} km` : "—"} mono />
            <Info
              libelle="Conso moyenne"
              valeur={fiche.consoMoyenneL100 != null ? `${formatDecimal(fiche.consoMoyenneL100)} L/100` : "—"}
              mono
            />
            {fiche.joursAttente > 0 ? (
              <Info libelle="Attente au chargement" valeur={`${fiche.joursAttente} j`} mono />
            ) : null}
          </div>

        </div>

        {/* ---------- Coût complet ---------- */}
        {fiche.coutComplet ? (
          <div className="card panel mb-5">
            <h3>
              Coût complet <span className="sec-sub">— quote-part du camion comprise</span>
            </h3>
            <table className="tbl mt-0.5">
              <tbody>
                <tr>
                  <td>Recette</td>
                  <td className={`num ${fiche.coutComplet.recetteGnf > 0 ? "pos" : "vide"}`}>
                    {formatSigne(fiche.coutComplet.recetteGnf)}
                  </td>
                </tr>
                <tr>
                  <td className="muted">Charges du trajet (frais + rémunération)</td>
                  <td className="num">−{formatNombre(fiche.coutComplet.coutsDirectsGnf)}</td>
                </tr>
                <tr className="font-semibold">
                  <td>Marge de route</td>
                  <td className={`num ${fiche.coutComplet.margeOperationnelleGnf >= 0 ? "pos" : "neg"}`}>
                    {formatSigne(fiche.coutComplet.margeOperationnelleGnf)}
                  </td>
                </tr>
                <tr>
                  <td className="muted">
                    Quote-part du camion
                    <div className="t-sub">
                      Réparations et entretien du mois, au prorata des kilomètres
                    </div>
                  </td>
                  <td className="num">−{formatNombre(fiche.coutComplet.quotePartVehiculeGnf)}</td>
                </tr>
                <tr className="font-bold">
                  <td>Marge réelle</td>
                  <td className={`num ${fiche.coutComplet.margeReelleGnf >= 0 ? "pos" : "neg"}`}>
                    {formatSigne(fiche.coutComplet.margeReelleGnf)}
                    {fiche.coutComplet.margeReellePct !== null ? (
                      <span className="t-sub"> · {formatDecimal(fiche.coutComplet.margeReellePct)} %</span>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3.5 flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--line-soft)] pt-3.5 text-[11.5px] text-[var(--muted)]">
              <div>
                Revenu par km
                <b className="mono mt-0.5 block text-[13px] text-[var(--ink)]">
                  {formatNombre(fiche.coutComplet.revenuKmGnf)} GNF
                </b>
              </div>
              <div>
                Coût complet par km
                <b className="mono mt-0.5 block text-[13px] text-[var(--ink)]">
                  {formatNombre(fiche.coutComplet.coutKmGnf)} GNF
                </b>
              </div>
              <div>
                Marge par km
                <b className={`mono mt-0.5 block text-[13px] ${fiche.coutComplet.margeKmGnf >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}>
                  {formatSigne(fiche.coutComplet.margeKmGnf)} GNF
                </b>
              </div>
            </div>
          </div>
        ) : null}

        {/* ---------- Argent remis au chauffeur ---------- */}
        {/* Une mission ne se finance pas en une fois : on remet une somme au
            départ, puis on recharge en route quand un poste coûte plus cher
            que prévu. Les remises s'ajoutent, elles ne se corrigent pas — et
            le reste à justifier doit se lire sans quitter la mission. */}
        <div className="head-row">
          <h3>
            Remis au chauffeur{" "}
            <span className="sec-sub">
              — {fiche.avances.length} mouvement{fiche.avances.length > 1 ? "s" : ""}
            </span>
          </h3>
          <SiPeut droit="depenses.ecrire">
            {annulee ? null : <DialogueCaisse
              chauffeurId={fiche.voyage.chauffeurId}
              nom={fiche.voyage.chauffeur.nom}
              soldeGnf={caisseChauffeur.parDevise.GNF}
              soldeXof={caisseChauffeur.parDevise.XOF}
              tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
              missions={[]}
              moyens={moyens}
              voyageImpose={fiche.voyage.id}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Remettre de l&apos;argent
                </button>
              }
            />}
          </SiPeut>
        </div>

        <div className="card panel mb-5">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              Remis en tout
              <b className="mono mt-0.5 block text-[13px]">{formatNombre(fiche.remisGnf)} GNF</b>
            </div>
            <div>
              Justifié ou rendu
              <b className="mono mt-0.5 block text-[13px]">{formatNombre(fiche.justifieGnf)} GNF</b>
            </div>
            <div>
              Reste à justifier
              <b
                className={`mono mt-0.5 block text-[13px] ${
                  fiche.resteAJustifierGnf > 0 ? "text-[var(--warn-ink,#8a5d06)]" : "text-[var(--pos)]"
                }`}
              >
                {formatNombre(fiche.resteAJustifierGnf)} GNF
              </b>
            </div>
          </div>

          {fiche.avances.length > 0 ? (
            <div className="mt-3 border-t border-[var(--line-soft)] pt-2">
              {fiche.avances.map((m) => (
                <div key={m.id} className="row !py-2">
                  <div className="corps">
                    <div className="t">
                      {LIBELLE_MOUVEMENT[m.type] ?? m.type}
                      {/* L'objet prime sur le motif libre : c'est lui qui dit
                          sur quelle enveloppe le chauffeur pioche. */}
                      {m.objet ? (
                        <span className="s"> — {LIBELLE_TYPE_DEPENSE[m.objet] ?? m.objet}</span>
                      ) : m.motif ? (
                        <span className="s"> — {m.motif}</span>
                      ) : null}
                    </div>
                    <div className="s">
                      {formatDate(m.date)}
                      {m.moyen ? ` · ${m.moyen.nom}` : ""}
                      {m.devise === "XOF" ? ` · ${formatNombre(n(m.montant))} CFA` : ""}
                      {m.fraisGnf ? ` · frais ${formatNombre(n(m.fraisGnf))} GNF` : ""}
                    </div>
                  </div>
                  <b className={`mono ${m.type === "AVANCE" ? "" : "text-[var(--pos)]"}`}>
                    {m.type === "AVANCE" ? "" : "−"}
                    {formatNombre(n(m.montantGnf))}
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <p className="vide-msg mt-2">
              Rien n&apos;a encore été remis au chauffeur pour cette mission.
            </p>
          )}
        </div>

        {/* ---------- Marchandises ---------- */}
        {/* Un voyage groupe souvent plusieurs marchandises, dans des unités
            différentes et parfois pour des destinataires différents. Chacune
            porte son propre suivi : c'est le seul niveau où un manquant a un
            sens. */}
        <div className="head-row">
          <h3>
            Marchandises{" "}
            <span className="sec-sub">
              — {fiche.lignes.length} article{fiche.lignes.length > 1 ? "s" : ""}
            </span>
          </h3>
        </div>

        {fiche.lignes.length > 0 ? (
          <div className="card overflow-x-auto mb-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Marchandise</th>
                  <th className="num">À charger</th>
                  <th className="num">Reçu</th>
                  <th className="num">Douane</th>
                  <th className="num">Livré</th>
                  <th className="num">Écart</th>
                  <th>Preuve de livraison</th>
                </tr>
              </thead>
              <tbody>
                {fiche.lignes.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.designation}</b>
                      <div className="t-sub">
                        {l.unite}
                        {l.client ? ` · ${l.client}` : ""}
                      </div>
                    </td>
                    <td className="num">{formatQuantite(l.quantiteACharger, l.symbole)}</td>
                    <td className="num">{formatQuantite(l.quantiteRecue, l.symbole)}</td>
                    <td className={`num ${l.prelevementQuantite > 0 ? "" : "vide"}`}>
                      {l.prelevementQuantite > 0
                        ? formatQuantite(l.prelevementQuantite, l.symbole)
                        : "—"}
                    </td>
                    <td className="num">{formatQuantite(l.quantiteLivree, l.symbole)}</td>
                    <td className={`num ${l.ecart == null ? "vide" : l.ecart.manquant > 0 ? "neg" : "pos"}`}>
                      {l.ecart == null
                        ? "—"
                        : l.ecart.manquant > 0
                          ? `−${formatQuantite(l.ecart.manquant, l.symbole)}`
                          : "conforme"}
                    </td>
                    <td>
                      <SiPeut droit="voyages.ecrire">
                        <ActionsCodeLivraison
                          ligneId={l.id}
                          designation={l.designation}
                          codeEnvoye={l.codeEnvoye}
                          codeConfirme={l.codeConfirme}
                          codeEnvois={l.codeEnvois}
                          bloque={l.codeBloque}
                        />
                        {/* Démonstration : le code s'affiche pour être dicté au
                            chauffeur sans passer par un SMS réel. Il reste
                            masqué tant que l'option n'est pas cochée. */}
                        {l.codeVisible ? (
                          <div className="code-demo">
                            <span>démo</span>
                            <b className="mono">{l.codeVisible}</b>
                          </div>
                        ) : null}
                      </SiPeut>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel mb-5">
            <p className="vide-msg">
              Aucune marchandise déclarée sur cette mission.
            </p>
          </div>
        )}

        {/* ---------- Prélèvements de douane ---------- */}
        {/* Ce que les postes ont retenu, déclaré par le chauffeur en route.
            Le gérant doit pouvoir le relire et le corriger : une déclaration
            erronée fausse l'écart de livraison, donc l'alerte de vol. */}
        {fiche.lignes.some((l) => l.prelevements.length > 0) ? (
          <>
            <div className="head-row">
              <h3>
                Prélèvements de douane{" "}
                {fiche.prelevementGnf > 0 ? (
                  <span className="sec-sub">— {formatGnf(fiche.prelevementGnf)} réclamés</span>
                ) : null}
              </h3>
            </div>

            <div className="card overflow-x-auto mb-5">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Marchandise</th>
                    <th className="num">Quantité</th>
                    <th>Poste</th>
                    <th>Motif</th>
                    <th>Reçu</th>
                    <th className="num">Contrepartie</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {fiche.lignes.flatMap((l) =>
                    l.prelevements.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <b>{l.designation}</b>
                          <div className="t-sub">{formatDate(new Date(p.date))}</div>
                        </td>
                        <td className="num">{formatQuantite(p.quantite, l.symbole)}</td>
                        <td>
                          {p.lieu}
                          <div className="t-sub">{p.pays}</div>
                        </td>
                        <td className="muted">{p.motif ?? "—"}</td>
                        <td className="mono">{p.reference ?? "—"}</td>
                        <td className={`num ${p.montantGnf ? "" : "vide"}`}>
                          {p.montantGnf ? formatNombre(p.montantGnf) : "—"}
                        </td>
                        <td className="actions-cell">
                          <SiPeut droit="voyages.ecrire">
                            <form action={supprimerPrelevement.bind(null, p.id)}>
                              <button type="submit" className="btn ghost sm">
                                Supprimer
                              </button>
                            </form>
                          </SiPeut>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {/* Manquants inexpliqués, article par article : un total serait faux
            dès que les unités diffèrent. */}
        {fiche.lignesEnEcart.map((l) => (
          <div key={l.id} className="flag mb-3">
            Écart de livraison sur <b>{l.designation}</b> :{" "}
            {formatQuantite(l.ecart!.manquant, l.symbole)} manquants sur{" "}
            {formatQuantite(Math.max((l.quantiteRecue ?? 0) - l.prelevementQuantite, 0), l.symbole)}{" "}
            ({formatDecimal(l.ecart!.pct)} %)
            {l.prelevementQuantite > 0
              ? `, après déduction de ${formatQuantite(l.prelevementQuantite, l.symbole)} prélevés en douane`
              : ""}
            .
          </div>
        ))}

        {/* ---------- Tronçons ---------- */}
        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Le carburant est le <b>niveau restant dans le réservoir</b>. Quand on{" "}
            <b>rajoute du carburant en route</b> (colonne Plein), la conso en tient compte :
            restant départ + pleins − restant arrivée.
          </span>
        </div>

        {/* Carburant par segment : seulement quand il y a quelque chose à
            comparer — un aller-retour, ou un segment explicitement renseigné. */}
        {segmentsCarburant.length > 0 && (voyage.allerRetour || segmentsCarburant.some(([c]) => c !== "NON_PRECISE")) ? (
          <div className="card panel mb-5">
            <h3>Carburant {voyage.allerRetour ? "· aller-retour" : ""}</h3>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
              {segmentsCarburant.map(([cle, v]) => (
                <div key={cle}>
                  <div className="text-[var(--muted)]">
                    {cle === "NON_PRECISE" ? "Segment non précisé" : (LIBELLE_SEGMENT[cle] ?? cle)}
                  </div>
                  <b className="mono mt-0.5 block text-[13px]">
                    {formatNombre(v.montantGnf)} GNF
                    {v.litres > 0 ? (
                      <span className="text-[var(--muted-2)]"> · {formatDecimal(v.litres)} L</span>
                    ) : null}
                  </b>
                </div>
              ))}
            </div>
            {/* La consommation réelle ne se saisit pas : elle se déduit des
                niveaux relevés dans le réservoir, tronçon par tronçon. */}
            {fiche.consoMoyenneL100 != null ? (
              <p className="mt-3 text-[11.5px] text-[var(--muted)]">
                Consommation réelle calculée sur les relevés de réservoir :{" "}
                <b>{formatDecimal(fiche.consoMoyenneL100)} L/100 km</b>.
              </p>
            ) : (
              <p className="mt-3 text-[11.5px] text-[var(--muted-2)]">
                Renseigne le niveau du réservoir au départ et à l&apos;arrivée de chaque tronçon :
                la consommation se calcule toute seule.
              </p>
            )}
          </div>
        ) : null}

        <div className="head-row">
          <h3>
            Étapes du trajet <span className="sec-sub">— {fiche.troncons.length} tronçon
            {fiche.troncons.length > 1 ? "s" : ""}</span>
          </h3>
          <SiPeut droit="voyages.ecrire">
            {annulee ? null : <DialogueEtape
              voyageId={voyage.id}
              pays={pays}
              ravitaillements={ravitaillements}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Ajouter une étape
                </button>
              }
            />}
          </SiPeut>
        </div>

        {fiche.troncons.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Étape</th>
                  <th className="num">Km dép.</th>
                  <th className="num">Km arr.</th>
                  <th className="num">Dist.</th>
                  <th className="num">Réservoir dép.</th>
                  <th className="num">Plein</th>
                  <th className="num">Réservoir arr.</th>
                  <th className="num">Conso</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fiche.troncons.map((troncon) => (
                  <LigneTroncon
                    key={troncon.etape.id}
                    troncon={troncon}
                    voyageId={voyage.id}
                    pays={pays}
                    ravitaillements={ravitaillements}
                    dejaRattaches={dejaRattaches}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucune étape saisie. Ajoute les tronçons pour suivre la distance réelle et la
              consommation.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function Info({ libelle, valeur, mono }: { libelle: string; valeur: string; mono?: boolean }) {
  return (
    <div>
      {libelle}
      <b className={`mt-0.5 block text-[13px] text-[var(--ink)] ${mono ? "mono" : ""}`}>{valeur}</b>
    </div>
  );
}

function LigneTroncon({
  troncon,
  voyageId,
  pays,
  ravitaillements,
  dejaRattaches,
}: {
  troncon: TronconVue;
  voyageId: string;
  pays: { id: string; nom: string }[];
  ravitaillements: RavitaillementOption[];
  dejaRattaches: Set<string>;
}) {
  const { etape } = troncon;
  const propres = new Set(etape.ravitaillements.map((r) => r.id));

  return (
    <tr>
      <td className="t-title">
        {etape.villeDepart} → {etape.villeArrivee}
        <div className="t-sub">
          {[LIBELLE_TYPE_ETAPE[etape.type], etape.motif].filter(Boolean).join(" · ")}
        </div>
      </td>
      <Num valeur={etape.kmDepart} />
      <Num valeur={etape.kmArrivee} />
      <Num valeur={troncon.distance} />
      <Num valeur={etape.carburantRestantDepart != null ? n(etape.carburantRestantDepart) : null} unite=" L" />
      <td className={`num ${troncon.pleinsL > 0 ? "" : "vide"}`}>
        {troncon.pleinsL > 0 ? (
          <span className="text-[var(--accent-ink)]">+{formatNombre(troncon.pleinsL)} L</span>
        ) : (
          "—"
        )}
      </td>
      <Num valeur={etape.carburantRestantArrivee != null ? n(etape.carburantRestantArrivee) : null} unite=" L" />
      <td className={`num ${troncon.litresPer100km != null ? "" : "vide"}`}>
        {troncon.litresPer100km != null ? `${formatDecimal(troncon.litresPer100km)} L/100` : "—"}
      </td>
      <td>
        <span className={`badge ${troncon.termine ? "b-idle" : "b-go"}`}>
          {troncon.termine ? "Terminée" : <><span className="led" />En cours</>}
        </span>
      </td>
      <td>
        <ActionsEtape
          voyageId={voyageId}
          pays={pays}
          etape={{
            id: etape.id,
            type: etape.type,
            villeDepart: etape.villeDepart,
            villeArrivee: etape.villeArrivee,
            paysDepartId: etape.paysDepartId,
            paysArriveeId: etape.paysArriveeId,
            kmDepart: etape.kmDepart,
            kmArrivee: etape.kmArrivee,
            carburantRestantDepart:
              etape.carburantRestantDepart != null ? n(etape.carburantRestantDepart) : null,
            carburantRestantArrivee:
              etape.carburantRestantArrivee != null ? n(etape.carburantRestantArrivee) : null,
            motif: etape.motif,
            departLe: etape.departLe ? etape.departLe.toISOString().slice(0, 10) : null,
            arriveeLe: etape.arriveeLe ? etape.arriveeLe.toISOString().slice(0, 10) : null,
            ravitaillements: [...propres],
          }}
          // Un plein rattaché à un autre tronçon ne doit pas être proposé ici.
          ravitaillements={ravitaillements.map((r) => ({
            ...r,
            prisAilleurs: dejaRattaches.has(r.id) && !propres.has(r.id),
          }))}
        />
      </td>
    </tr>
  );
}

function Num({ valeur, unite = "" }: { valeur: number | null | undefined; unite?: string }) {
  return (
    <td className={`num ${valeur != null ? "" : "vide"}`}>
      {valeur != null ? `${formatNombre(valeur)}${unite}` : "—"}
    </td>
  );
}
