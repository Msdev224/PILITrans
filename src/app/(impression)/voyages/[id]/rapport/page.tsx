import { notFound } from "next/navigation";

import { sessionRequise } from "@/auth";
import { conformiteFroid } from "@/lib/calculs";
import { ficheVoyage } from "@/lib/donnees/voyages";
import { formatQuantite } from "@/lib/donnees/unites";
import { urlLogo } from "@/lib/images";
import { NOM_APPLICATION } from "@/lib/marque";
import { prisma } from "@/lib/prisma";
import {
  LIBELLE_STATUT_VOYAGE,
  LIBELLE_TYPE_DEPENSE,
  formatDecimal,
  formatNombre,
  formatSigne,
  n,
  nOuNull,
} from "@/lib/utils";

import { BoutonImprimer } from "./bouton-imprimer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rapport de mission" };

const jjmmaaaa = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

/** Une case du bandeau d'en-tête. */
function Case({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) {
  return (
    <div className="rm-case">
      <div className="rm-l">{libelle}</div>
      <div className="rm-v">{valeur}</div>
    </div>
  );
}

/**
 * Rapport de mission — une page par voyage.
 *
 * Le cockpit montre chaque chiffre sur son écran ; ce document les réunit pour
 * qu'une mission se relise entière, longtemps après, sans machine : ce qui a
 * été chargé et ce qui est arrivé, ce que le camion a bu, ce que la course a
 * coûté et ce qu'elle a laissé.
 *
 * Contrairement à la facture, ce n'est pas une pièce opposable : l'identité de
 * l'entreprise vient donc des Paramètres courants, et non d'une copie figée.
 */
export default async function RapportMissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await sessionRequise();

  const fiche = await ficheVoyage(id);
  if (!fiche) notFound();

  const { voyage } = fiche;

  const [parametres, releves] = await Promise.all([
    prisma.parametres.findFirst(),
    // Pas de chaîne du froid sur un camion sec : on ne produit alors aucune
    // attestation, plutôt qu'un tableau vide qui ferait douter.
    voyage.camion.refrigere
      ? prisma.releveTemperature.findMany({ where: { voyageId: id }, orderBy: { releveLe: "asc" } })
      : Promise.resolve([]),
  ]);

  const tolerance = nOuNull(parametres?.toleranceFroid) ?? 1;
  const espaceOuvert = parametres?.espaceChauffeurActif ?? false;
  const etatReleve = (r: (typeof releves)[number]) => {
    const consigne = nOuNull(r.consigne);
    return consigne !== undefined
      ? conformiteFroid(n(r.temperature), consigne, tolerance)
      : r.conformite;
  };
  const nonConformes = releves.filter((r) => etatReleve(r) !== "CONFORME");

  const raison = parametres?.raisonSociale ?? NOM_APPLICATION;
  const troncons = fiche.troncons.filter((t) => t.distance !== null);
  const totalLitres = troncons.reduce((total, t) => total + (t.litresConsommes ?? 0), 0);
  const pleinsL = fiche.troncons.reduce((total, t) => total + t.pleinsL, 0);

  return (
    <>
      <BoutonImprimer />

      <div className="feuille rm">
        {/* ---------- En-tête ---------- */}
        <header className="rm-tete">
          <div>
            {parametres?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urlLogo(parametres.logoUrl, 260) ?? parametres.logoUrl}
                alt={raison}
                className="fac-logo"
              />
            ) : (
              <h1 className="rm-enseigne">{raison}</h1>
            )}
            <div className="rm-sous">
              {[parametres?.adresse, parametres?.telephone].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="rm-titre">
            <div className="rm-doc">RAPPORT DE MISSION</div>
            <div className="rm-ref">{voyage.reference}</div>
            <div className="rm-edite">Édité le {jjmmaaaa(new Date())}</div>
          </div>
        </header>

        {/* ---------- Identité de la mission ---------- */}
        <section className="rm-bandeau">
          <Case
            libelle="Trajet"
            valeur={
              <>
                {voyage.villeDepart} → {voyage.villeArrivee}
                {fiche.international ? <span className="rm-tag">International</span> : null}
                {voyage.aVide ? <span className="rm-tag vide">À vide</span> : null}
              </>
            }
          />
          <Case
            libelle="Dates"
            valeur={
              <>
                {jjmmaaaa(voyage.dateDepart)}
                {voyage.dateArrivee ? ` → ${jjmmaaaa(voyage.dateArrivee)}` : " → en cours"}
              </>
            }
          />
          <Case libelle="Camion" valeur={`${voyage.camion.nom} · ${voyage.camion.immatTracteur}`} />
          <Case libelle="Chauffeur" valeur={voyage.chauffeur.nom} />
          <Case libelle="Client" valeur={voyage.client?.nom ?? "—"} />
          <Case libelle="État" valeur={LIBELLE_STATUT_VOYAGE[voyage.statut] ?? voyage.statut} />
          <Case libelle="Distance" valeur={fiche.km > 0 ? `${formatNombre(fiche.km)} km` : "—"} />
          <Case
            libelle="Attente au chargement"
            valeur={fiche.joursAttente > 0 ? `${fiche.joursAttente} jour${fiche.joursAttente > 1 ? "s" : ""}` : "aucune"}
          />
        </section>

        {/* ---------- Marchandises ---------- */}
        <section className="rm-bloc">
          <h2>Marchandise transportée</h2>
          {fiche.lignes.length === 0 ? (
            <p className="rm-vide">Aucune marchandise déclarée sur cette mission.</p>
          ) : (
            <table className="rm-tbl">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th className="num">Prévu</th>
                  <th className="num">Reçu</th>
                  <th className="num">Livré</th>
                  <th className="num">Douane</th>
                  <th className="num">Écart</th>
                </tr>
              </thead>
              <tbody>
                {fiche.lignes.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.designation}</b>
                      {l.client ? <div className="rm-mini">{l.client}</div> : null}
                    </td>
                    <td className="num">{l.quantiteACharger != null ? formatQuantite(l.quantiteACharger, l.symbole) : "—"}</td>
                    <td className="num">{l.quantiteRecue != null ? formatQuantite(l.quantiteRecue, l.symbole) : "—"}</td>
                    <td className="num">{l.quantiteLivree != null ? formatQuantite(l.quantiteLivree, l.symbole) : "—"}</td>
                    <td className="num">{l.prelevementQuantite > 0 ? formatQuantite(l.prelevementQuantite, l.symbole) : "—"}</td>
                    <td className={`num${l.ecart && l.ecart.manquant > 0 ? " rm-alerte" : ""}`}>
                      {l.ecart && l.ecart.manquant > 0
                        ? `− ${formatQuantite(l.ecart.manquant, l.symbole)} (${formatDecimal(l.ecart.pct)} %)`
                        : l.quantiteLivree != null
                          ? "conforme"
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/*
            L'écart est présenté marchandise par marchandise, jamais additionné :
            des tonnes et des sacs ne se somment pas, et un total masquerait
            l'article réellement en cause.
          */}
          {fiche.lignesEnEcart.length > 0 ? (
            <p className="rm-note rm-alerte">
              Manquant inexpliqué sur {fiche.lignesEnEcart.length} article
              {fiche.lignesEnEcart.length > 1 ? "s" : ""}, prélèvements de douane déjà déduits.
            </p>
          ) : null}
          {fiche.prelevementGnf > 0 ? (
            <p className="rm-note">
              Contrepartie des retenues de douane : {formatNombre(fiche.prelevementGnf)} GNF.
            </p>
          ) : null}
        </section>

        {/* ---------- Carburant ---------- */}
        <section className="rm-bloc">
          <h2>Carburant &amp; parcours</h2>
          {troncons.length === 0 ? (
            <p className="rm-vide">
              Aucun tronçon exploitable : il faut un relevé de compteur au départ et à
              l&apos;arrivée pour calculer une consommation.
            </p>
          ) : (
            <table className="rm-tbl">
              <thead>
                <tr>
                  <th>Tronçon</th>
                  <th className="num">Distance</th>
                  <th className="num">Pleins</th>
                  <th className="num">Consommé</th>
                  <th className="num">L/100 km</th>
                </tr>
              </thead>
              <tbody>
                {troncons.map((t) => (
                  <tr key={t.etape.id}>
                    <td>
                      {t.etape.villeDepart} → {t.etape.villeArrivee ?? "—"}
                      {!t.termine ? <span className="rm-mini">tronçon non clos</span> : null}
                    </td>
                    <td className="num">{formatNombre(t.distance ?? 0)} km</td>
                    <td className="num">{t.pleinsL > 0 ? `${formatDecimal(t.pleinsL)} L` : "—"}</td>
                    <td className="num">{t.litresConsommes != null ? `${formatDecimal(t.litresConsommes)} L` : "—"}</td>
                    <td className="num">{t.litresPer100km != null ? formatDecimal(t.litresPer100km) : "—"}</td>
                  </tr>
                ))}
                <tr className="rm-total">
                  <td>Ensemble de la mission</td>
                  <td className="num">{formatNombre(fiche.km)} km</td>
                  <td className="num">{pleinsL > 0 ? `${formatDecimal(pleinsL)} L` : "—"}</td>
                  <td className="num">{totalLitres > 0 ? `${formatDecimal(totalLitres)} L` : "—"}</td>
                  <td className="num">
                    {fiche.consoMoyenneL100 != null ? formatDecimal(fiche.consoMoyenneL100) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* ---------- Chaîne du froid ---------- */}
        {voyage.camion.refrigere ? (
          <section className="rm-bloc">
            <h2>Chaîne du froid</h2>
            {releves.length === 0 ? (
              <p className="rm-vide">Aucun relevé enregistré sur cette mission.</p>
            ) : (
              <p className="rm-note">
                {releves.length} relevé{releves.length > 1 ? "s" : ""} · consigne{" "}
                {nOuNull(releves[0].consigne) !== undefined
                  ? `${formatDecimal(n(releves[0].consigne))} °C`
                  : "non renseignée"}{" "}
                · tolérance ± {formatDecimal(tolerance)} °C ·{" "}
                {nonConformes.length === 0 ? (
                  <b>tous conformes</b>
                ) : (
                  <b className="rm-alerte">
                    {nonConformes.length} hors tolérance
                  </b>
                )}
                .
              </p>
            )}
          </section>
        ) : null}

        {/* ---------- Argent ---------- */}
        <section className="rm-bloc">
          <h2>Résultat de la mission</h2>
          <table className="rm-tbl rm-argent">
            <tbody>
              <tr>
                <td>Recette</td>
                <td className="num">{formatNombre(fiche.recetteGnf)} GNF</td>
              </tr>
              {fiche.postes
                .filter((d) => d.imputerAMission)
                .map((d) => (
                  <tr key={d.id} className="rm-poste">
                    <td>
                      {LIBELLE_TYPE_DEPENSE[d.type] ?? d.type}
                      {d.description ? <span className="rm-mini"> · {d.description}</span> : null}
                    </td>
                    <td className="num">− {formatNombre(n(d.montantGnf))}</td>
                  </tr>
                ))}
              <tr>
                <td>Rémunération du chauffeur</td>
                <td className="num">− {formatNombre(fiche.remunerationGnf)}</td>
              </tr>
              <tr className="rm-total">
                <td>Marge de route</td>
                <td className={`num${fiche.margeGnf < 0 ? " rm-alerte" : ""}`}>
                  {formatSigne(fiche.margeGnf)} GNF
                </td>
              </tr>
            </tbody>
          </table>

          {/*
            La marge de route ignore ce que coûte le camion lui-même. Une course
            peut la dégager et laisser malgré tout l'exploitation en perte : le
            coût complet répartit les charges du véhicule au prorata des
            kilomètres du mois.
          */}
          {fiche.coutComplet ? (
            <table className="rm-tbl rm-argent">
              <tbody>
                <tr>
                  <td>Charges directes du trajet</td>
                  <td className="num">{formatNombre(fiche.coutComplet.coutsDirectsGnf)} GNF</td>
                </tr>
                <tr>
                  <td>Quote-part du camion (au prorata des km du mois)</td>
                  <td className="num">{formatNombre(fiche.coutComplet.quotePartVehiculeGnf)} GNF</td>
                </tr>
                <tr className="rm-total">
                  <td>
                    Marge réelle
                    {fiche.coutComplet.margeReellePct != null
                      ? ` (${formatDecimal(fiche.coutComplet.margeReellePct)} %)`
                      : ""}
                  </td>
                  <td className={`num${fiche.coutComplet.margeReelleGnf < 0 ? " rm-alerte" : ""}`}>
                    {formatSigne(fiche.coutComplet.margeReelleGnf)} GNF
                  </td>
                </tr>
                <tr className="rm-poste">
                  <td>Coût au kilomètre · recette au kilomètre</td>
                  <td className="num">
                    {formatNombre(fiche.coutComplet.coutKmGnf)} · {formatNombre(fiche.coutComplet.revenuKmGnf)} GNF/km
                  </td>
                </tr>
              </tbody>
            </table>
          ) : null}

          {fiche.horsMargeGnf > 0 ? (
            <p className="rm-note">
              {formatNombre(fiche.horsMargeGnf)} GNF de dépenses saisies pendant la mission mais
              imputées au camion — une réparation appartient au véhicule, pas à la course qui l&apos;a
              révélée.
            </p>
          ) : null}
        </section>

        {/* ---------- Caisse du chauffeur ---------- */}
        <section className="rm-bloc">
          <h2>Argent remis au chauffeur</h2>
          {fiche.avances.length === 0 ? (
            <p className="rm-vide">Aucune avance sur cette mission.</p>
          ) : (
            <table className="rm-tbl rm-argent">
              <tbody>
                {fiche.avances.map((m) => (
                  <tr key={m.id} className="rm-poste">
                    <td>
                      {jjmmaaaa(m.date)} · {m.motif ?? m.type}
                      {m.moyen ? <span className="rm-mini"> · {m.moyen.nom}</span> : null}
                    </td>
                    <td className="num">
                      {m.type === "AVANCE" ? "+" : "−"} {formatNombre(n(m.montantGnf))}
                      {m.devise !== "GNF" ? <span className="rm-mini"> ({formatNombre(n(m.montant))} {m.devise})</span> : null}
                    </td>
                  </tr>
                ))}
                {/* Espace chauffeur fermé : la somme est un forfait de voyage.
                    Un rapport imprimé qui réclamerait des justificatifs jamais
                    demandés circulerait, lui, sans qu'on puisse le rattraper. */}
                <tr className="rm-total">
                  <td>Total remis</td>
                  <td className="num">{formatNombre(fiche.remisGnf)} GNF</td>
                </tr>
                {espaceOuvert ? (
                  <>
                    <tr>
                      <td>Justifié ou rendu</td>
                      <td className="num">{formatNombre(fiche.justifieGnf)} GNF</td>
                    </tr>
                    <tr className="rm-total">
                      <td>Reste à justifier</td>
                      <td className={`num${fiche.resteAJustifierGnf > 0 ? " rm-alerte" : ""}`}>
                        {formatNombre(fiche.resteAJustifierGnf)} GNF
                      </td>
                    </tr>
                  </>
                ) : null}
              </tbody>
            </table>
          )}
        </section>

        {/* ---------- Facturation ---------- */}
        <section className="rm-bloc">
          <h2>Facturation</h2>
          {voyage.factures.length === 0 ? (
            <p className={`rm-vide${fiche.termine && !voyage.aVide && fiche.recetteGnf > 0 ? " rm-alerte" : ""}`}>
              {fiche.termine && !voyage.aVide && fiche.recetteGnf > 0
                ? "Mission terminée et non facturée."
                : "Aucune facture rattachée."}
            </p>
          ) : (
            <table className="rm-tbl">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Émise le</th>
                  <th className="num">Total dû</th>
                  <th className="num">Réglé</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {voyage.factures.map((f) => (
                  <tr key={f.id}>
                    <td>{f.numero}</td>
                    <td>{jjmmaaaa(f.dateEmission)}</td>
                    <td className="num">{formatNombre(n(f.totalTtcGnf) || n(f.montantGnf))} GNF</td>
                    <td className="num">{formatNombre(n(f.montantPayeGnf))} GNF</td>
                    <td>{f.statut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="rm-pied">
          <div className="rm-signature">Visa du gérant</div>
          <div className="rm-signature">Visa du chauffeur — {voyage.chauffeur.nom}</div>
        </footer>
        <p className="rm-mention">
          Document interne d&apos;exploitation, établi à partir des saisies portées sur la mission
          {voyage.reference ? ` ${voyage.reference}` : ""}. Il ne constitue ni une facture ni une
          pièce opposable à un tiers.
        </p>
      </div>
    </>
  );
}
