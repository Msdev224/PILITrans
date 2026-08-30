import Link from "next/link";
import { notFound } from "next/navigation";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { ActionsEntretien } from "@/components/camions/actions-entretien";
import { SiPeut } from "@/components/si-peut";
import { ActionsReparation } from "@/components/camions/actions-reparation";
import { DialogueEntretien } from "@/components/camions/dialogue-entretien";
import { DialogueReparation } from "@/components/camions/dialogue-reparation";
import { IconeInfo, IconePlus } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { ficheCamion, recuperationCapital } from "@/lib/donnees/camions";
import { moisCourant } from "@/lib/periode";
import { prisma } from "@/lib/prisma";
import {
  formatDecimal,
  formatGnf,
  formatDate,
  formatMoisAnnee,
  formatNombre,
  formatSigne,
  formatMois,
  LIBELLE_CATEGORIE_REPARATION,
  LIBELLE_STATUT_CAMION,
  LIBELLE_STATUT_REPARATION,
  LIBELLE_STATUT_VOYAGE,
  LIBELLE_TYPE_DEPENSE,
  LIBELLE_TYPE_ECHEANCE,
  LIBELLE_TYPE_ENTRETIEN,
  LIBELLE_TYPE_VEHICULE,
  n,
} from "@/lib/utils";
import { ActionsEcheance } from "@/components/flotte/actions-echeance";
import { DialogueEcheance } from "@/components/flotte/dialogue-echeance";

export const dynamic = "force-dynamic";

const CLASSE_BADGE: Record<string, string> = {
  EN_VOYAGE: "b-go",
  DISPONIBLE: "b-idle",
  IMMOBILISE: "b-down",
  HORS_SERVICE: "b-down",
};

const BADGE_REPARATION: Record<string, string> = {
  A_FAIRE: "b-idle",
  EN_COURS: "b-warn",
  TERMINEE: "b-go",
};

const BADGE_FROID: Record<string, string> = {
  CONFORME: "b-go",
  ALERTE: "b-warn",
  RUPTURE: "b-down",
};

export default async function FicheCamionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const periode = moisCourant();

  const [session, fiche, capital, parametres, fil] = await Promise.all([
    sessionRequise(),
    ficheCamion(id, periode),
    recuperationCapital(id),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  if (!fiche) notFound();

  const { camion } = fiche;
  const tauxReferenceXof = parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null;
  // Seuil de rappel par défaut, réglé dans les Paramètres.
  const rappelDefaut = parametres?.rappelEcheanceJours ?? 30;
  const enMission = fiche.voyageEnCours !== null && camion.statut !== "IMMOBILISE" && camion.statut !== "HORS_SERVICE";
  const coutAcquisition = camion.coutAcquisition ? n(camion.coutAcquisition) : null;

  // Détail des dépenses hors gasoil, pour la ligne « douane · per diem · divers ».
  const autresPostes = fiche.postesDepenses.filter(
    (p) => p.type !== "GASOIL_TRACTEUR" && p.type !== "GASOIL_GROUPE_FROID",
  );

  return (
    <>
      <BarreHaut
        titre={`${camion.nom} — fiche camion`}
        sousTitre={`${LIBELLE_TYPE_VEHICULE[camion.typeVehicule]} · ${camion.immatTracteur} · ${periode.libelle}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={tauxReferenceXof}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/camions" className="link text-[13px]">
            ← Retour aux camions
          </Link>
          {/* Le P&L résume ; la liste des missions permet d'aller voir le détail. */}
          <Link href={`/voyages?q=${encodeURIComponent(camion.nom)}`} className="link text-[13px]">
            Voir ses {fiche.nbVoyages > 0 ? fiche.nbVoyages : ""} voyage
            {fiche.nbVoyages > 1 ? "s" : ""} →
          </Link>
        </div>

        {/* ---------- Bandeau vitals ---------- */}
        <div className={`card truck mb-5${camion.statut === "IMMOBILISE" ? " down" : ""}`}>
          <div className="vitals">
            <span className="plate">{camion.nom}</span>
            <div className="who">
              <div className="nm">{camion.marqueTracteur ?? camion.nom}</div>
              <div className="gf">
                {[camion.marqueGroupeFroid, camion.immatTracteur, camion.immatRemorque]
                  .filter(Boolean)
                  .join(" · ")}
                {/* Les numéros de bord passent à la trappe sur écran étroit. */}
                <span className="masquer-etroit">
                  {[camion.telephoneBord1, camion.telephoneBord2].filter(Boolean).map((tel) => ` · ${tel}`)}
                </span>
              </div>
            </div>
            {camion.refrigere ? (
              <div className="temp">
                <span className="led" />
                {fiche.froid?.dernierReleve != null ? `${formatDecimal(fiche.froid.dernierReleve)} °C` : "—"}
              </div>
            ) : (
              <div className="temp text-[#7EA2AA]">non frigo</div>
            )}
          </div>
          <div className="body">
            <div className="st-row !mb-0">
              {/* En mission, l'état du voyage prime sur le statut du camion. */}
              <span
                className={`badge ${enMission ? "b-go" : (CLASSE_BADGE[camion.statut] ?? "b-idle")}`}
              >
                <span className="led" />
                {enMission
                  ? `${LIBELLE_STATUT_VOYAGE[fiche.voyageEnCours!.statut]} · ${fiche.voyageEnCours!.villeDepart} → ${fiche.voyageEnCours!.villeArrivee}`
                  : LIBELLE_STATUT_CAMION[camion.statut]}
              </span>
              <div className="meters">
                {camion.refrigere ? (
                  <div>
                    Groupe
                    <b>{formatNombre(camion.heuresGroupeFroid)} h</b>
                  </div>
                ) : null}
                <div>
                  Compteur
                  <b>{formatNombre(camion.kilometrage)} km</b>
                </div>
                <div>
                  Conso moy.
                  <b>
                    {fiche.consoMoyenneL100 != null ? `${formatDecimal(fiche.consoMoyenneL100)} L/100` : "—"}
                  </b>
                </div>
                <div>
                  Km du mois
                  <b>{formatNombre(fiche.km)} km</b>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- P&L + acquisition ---------- */}
        <div className="fiche-cols mb-5 grid grid-cols-[1fr_340px] gap-4">
          <div className="card panel !m-0">
            <h3>
              Suivi complet des coûts <span className="sec-sub">— {periode.libelle}</span>
            </h3>
            <table className="tbl mt-0.5">
              <tbody>
                <tr>
                  <td>
                    Recette <span className="t-sub">({fiche.nbVoyages} voyage{fiche.nbVoyages > 1 ? "s" : ""})</span>
                  </td>
                  <td className={`num ${fiche.recetteGnf > 0 ? "pos" : "vide"}`}>
                    {formatSigne(fiche.recetteGnf)}
                  </td>
                </tr>
                <LigneCout libelle="Carburant (tracteur + groupe froid)" montant={fiche.gasoilGnf} />
                <LigneCout
                  libelle="Rémunération chauffeur"
                  precision="(variable)"
                  montant={fiche.remunerationGnf}
                />
                <LigneCout libelle="Réparations" montant={fiche.reparationsGnf} />
                <LigneCout libelle="Entretien" montant={fiche.entretiensGnf} />
                <LigneCout
                  libelle={
                    autresPostes.length > 0
                      ? autresPostes.map((p) => LIBELLE_TYPE_DEPENSE[p.type] ?? p.type).join(" · ")
                      : "Autres frais de voyage"
                  }
                  montant={fiche.autresDepensesGnf}
                />
                {/* Le prix d'achat n'entre pas dans le résultat du mois : il est
                    engagé une fois et suivi comme capital à rembourser, dans le
                    panneau « Acquisition ». */}
                <tr className="font-bold">
                  <td>Marge d&apos;exploitation</td>
                  <td className={`num ${fiche.margeExploitation >= 0 ? "pos" : "neg"}`}>
                    {formatSigne(fiche.margeExploitation)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3.5 flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--line-soft)] pt-3.5 text-[11.5px] text-[var(--muted)]">
              <div>
                Coût par km
                <b className="mono mt-0.5 block text-[13px] text-[var(--ink)]">
                  {fiche.km > 0 ? `${formatNombre(fiche.coutKm)} GNF` : "—"}
                </b>
              </div>
              <div>
                Recette par km
                <b className="mono mt-0.5 block text-[13px] text-[var(--ink)]">
                  {fiche.km > 0 ? `${formatNombre(fiche.recetteKm)} GNF` : "—"}
                </b>
              </div>
              <div>
                Marge par km
                <b
                  className={`mono mt-0.5 block text-[13px] ${fiche.margeKm >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}
                >
                  {fiche.km > 0 ? `${formatSigne(fiche.margeKm)} GNF` : "—"}
                </b>
              </div>
              <div>
                Km à vide
                <b className="mono mt-0.5 block text-[13px] text-[var(--ink)]">
                  {fiche.km > 0 ? `${formatDecimal(fiche.tauxAVidePct)} %` : "—"}
                </b>
              </div>
            </div>
          </div>

          <div className="card panel !m-0">
            <h3>Acquisition &amp; possession</h3>
            {coutAcquisition !== null ? (
              <>
                <LigneInfo libelle="Coût d'acquisition" valeur={formatGnf(coutAcquisition)} mono />
                <LigneInfo
                  libelle="Acquis"
                  valeur={camion.dateAcquisition ? formatMoisAnnee(camion.dateAcquisition) : "—"}
                />
                <LigneInfo
                  libelle="Récupéré à ce jour"
                  valeur={formatGnf(capital.cumuleGnf)}
                  mono
                />
                <LigneInfo libelle="Reste à récupérer" valeur={formatGnf(capital.resteGnf)} mono />

                <div className="mb-1.5 mt-3.5 text-[11.5px] text-[var(--muted)]">
                  Remboursé : {capital.avancementPct} % sur {capital.moisRenseignes} mois
                  d&apos;activité enregistrée
                </div>
                <div className="jauge">
                  <i
                    className={capital.rembourse ? "full" : undefined}
                    style={{ width: `${capital.avancementPct}%` }}
                  />
                </div>

                {/* L'achat est un capital à rembourser, pas une charge du mois :
                    la marge d'exploitation ci-contre reste donc intacte. */}
                <div className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  {capital.rembourse ? (
                    <>
                      Ce camion a <b>fini de se payer</b>. Tout ce qu&apos;il dégage désormais
                      revient à l&apos;exploitation.
                    </>
                  ) : capital.horizonDepasse ? (
                    <>
                      À sa moyenne de {formatNombre(capital.moyenneMensuelleGnf)} GNF par mois
                      travaillé, le remboursement dépasserait <b>dix ans</b> : trop loin pour
                      qu&apos;une date ait du sens.
                    </>
                  ) : capital.moisRestants !== null ? (
                    <>
                      À sa moyenne de {formatNombre(capital.moyenneMensuelleGnf)} GNF par mois
                      travaillé, il finit de se rembourser dans <b>~{capital.moisRestants} mois</b>
                      {capital.dateRemboursement ? <> (vers {formatMois(capital.dateRemboursement)})</> : null}.
                    </>
                  ) : (
                    <>
                      Sa marge d&apos;exploitation moyenne est nulle ou négative : au rythme
                      actuel, l&apos;investissement ne se rembourse pas.
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="vide-msg">
                Coût d&apos;acquisition non renseigné — le suivi de remboursement de ce camion
                ne peut pas être calculé. La marge d&apos;exploitation, elle, reste juste :
                elle n&apos;a jamais inclus le prix d&apos;achat.
              </p>
            )}
          </div>
        </div>

        {/* ---------- Chaîne du froid (seulement si frigorifique) ---------- */}
        {camion.refrigere ? (
          <div className="card panel mb-5">
            <h3>
              Chaîne du froid
              {fiche.froid ? (
                <span className={`badge ${BADGE_FROID[fiche.froid.statut]} ml-1.5`}>
                  <span className="led" />
                  {fiche.froid.statut === "CONFORME"
                    ? "Conforme"
                    : fiche.froid.statut === "ALERTE"
                      ? "Proche du seuil"
                      : "Rupture"}
                </span>
              ) : null}
            </h3>
            {fiche.froid ? (
              <>
                <div className="flex flex-wrap gap-8 text-xs text-[var(--muted)]">
                  <div>
                    Consigne
                    <b className="mono mt-0.5 block text-base text-[var(--ink)]">
                      {fiche.froid.consigne != null ? `${formatDecimal(fiche.froid.consigne)} °C` : "—"}
                    </b>
                  </div>
                  <div>
                    Dernier relevé
                    <b className="mono mt-0.5 block text-base text-[var(--ink)]">
                      {formatDecimal(fiche.froid.dernierReleve ?? 0)} °C
                    </b>
                  </div>
                  <div>
                    Relevés conformes
                    <b
                      className={`mono mt-0.5 block text-base ${fiche.froid.nbConformes === fiche.froid.nbReleves ? "text-[var(--pos)]" : "text-[var(--warn)]"}`}
                    >
                      {fiche.froid.nbConformes} / {fiche.froid.nbReleves}
                    </b>
                  </div>
                </div>
                <div className="mt-3 text-[11.5px] text-[var(--muted)]">
                  Un dépassement du seuil déclenche une alerte ; le relevé sert de{" "}
                  <b>preuve de chaîne du froid</b> pour le client.
                </div>
              </>
            ) : (
              <p className="vide-msg">Aucun relevé de température enregistré pour ce camion.</p>
            )}
          </div>
        ) : null}

        {/* ---------- Réparations ---------- */}
        <div className="card panel mb-5">
          <div className="head-row !mb-3">
            <h3>
              Réparations <span className="sec-sub">— historique complet du camion</span>
            </h3>
            <DialogueReparation
              camionId={camion.id}
              refrigere={camion.refrigere}
              tauxReferenceXof={tauxReferenceXof}
              declencheur={
                <button type="button" className="btn primary px-3 py-[7px] text-[12.5px]">
                  + Nouvelle réparation
                </button>
              }
            />
          </div>
          {fiche.reparations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Réparation</th>
                    <th>Garage</th>
                    <th className="num">Coût</th>
                    <th>Statut</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fiche.reparations.map((r) => {
                    const cout = n(r.coutTotalGnf);
                    return (
                      <tr key={r.id}>
                        <td>
                          <b>
                            {LIBELLE_CATEGORIE_REPARATION[r.categorie]} — {r.description}
                          </b>
                          {r.immobiliseDu && !r.immobiliseAu ? (
                            <div className="t-sub">Camion immobilisé depuis le {r.immobiliseDu.getDate()}</div>
                          ) : null}
                          {/* Le détail des pièces, quand il a été saisi. Il répond à la
                              question que pose un total : ce qui a été acheté, ce qui a
                              été remis en état, et ce qui est parti au forfait. */}
                          {r.pieces.length > 0 ? (
                            <ul className="pieces-detail">
                              {r.pieces.map((p) => {
                                const achat = n(p.coutAchat);
                                const remise = n(p.coutReparation);
                                return (
                                  <li key={p.id}>
                                    <span>{p.designation}</span>
                                    <span className="pieces-chiffres">
                                      {achat > 0 ? `achat ${formatNombre(achat)}` : null}
                                      {achat > 0 && (remise > 0 || p.auForfait) ? " · " : null}
                                      {p.auForfait
                                        ? "réparation au forfait"
                                        : remise > 0
                                          ? `réparation ${formatNombre(remise)}`
                                          : null}
                                    </span>
                                  </li>
                                );
                              })}
                              {n(r.coutForfait) > 0 ? (
                                <li className="pieces-forfait">
                                  <span>Forfait</span>
                                  <span className="pieces-chiffres">{formatNombre(n(r.coutForfait))}</span>
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </td>
                        <td className={r.garage ? undefined : "text-[var(--muted-2)]"}>{r.garage ?? "—"}</td>
                        <td className={`num ${cout > 0 ? "" : "vide"}`}>
                          {cout > 0 ? formatNombre(cout) : "—"}
                        </td>
                        <td>
                          <span className={`badge ${BADGE_REPARATION[r.statut]}`}>
                            {LIBELLE_STATUT_REPARATION[r.statut]}
                          </span>
                        </td>
                        <td>
                          <ActionsReparation
                            camionId={camion.id}
                            refrigere={camion.refrigere}
                            tauxReferenceXof={tauxReferenceXof}
                            reparation={{
                              id: r.id,
                              camionId: r.camionId,
                              categorie: r.categorie,
                              description: r.description,
                              garage: r.garage,
                              coutPieces: n(r.coutPieces),
                              coutMainOeuvre: n(r.coutMainOeuvre),
                              coutForfait: n(r.coutForfait),
                              pieces: r.pieces.map((p) => ({
                                designation: p.designation,
                                coutAchat: n(p.coutAchat),
                                coutReparation: n(p.coutReparation),
                                auForfait: p.auForfait,
                              })),
                              devise: r.devise,
                              coutTotalGnf: cout,
                              kilometrage: r.kilometrage,
                              heuresGroupe: r.heuresGroupe,
                              immobiliseDu: r.immobiliseDu ? r.immobiliseDu.toISOString().slice(0, 10) : null,
                              immobiliseAu: r.immobiliseAu ? r.immobiliseAu.toISOString().slice(0, 10) : null,
                              statut: r.statut,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="vide-msg">Aucune réparation enregistrée pour ce camion.</p>
          )}
        </div>

        {/* ---------- Documents du véhicule ---------- */}
        {/* Tenus ici plutôt que seulement dans la liste générale : c'est en
            regardant un camion qu'on se demande s'il est en règle. */}
        <div className="card panel mb-5">
          <div className="head-row !mb-3">
            <h3>
              Documents &amp; assurances{" "}
              <span className="sec-sub">— alerte automatique à l&apos;approche de l&apos;expiration</span>
            </h3>
            <SiPeut droit="flotte.ecrire">
              <DialogueEcheance
                camions={[{ id: camion.id, nom: camion.nom }]}
                rappelDefaut={rappelDefaut}
                declencheur={
                  <button type="button" className="btn-add">
                    <IconePlus />
                    Ajouter un document
                  </button>
                }
              />
            </SiPeut>
          </div>

          {fiche.echeances.length > 0 ? (
            <table className="tbl mt-0.5">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>N° / organisme</th>
                  <th>Expire le</th>
                  <th className="num">Coût</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fiche.echeances.map((e) => {
                  const restants = Math.ceil(
                    (e.dateExpiration.getTime() - Date.now()) / 86_400_000,
                  );
                  const seuil = e.rappelJours || rappelDefaut;
                  const carteBrune = e.type === "CARTE_BRUNE_CEDEAO";

                  return (
                    <tr key={e.id}>
                      <td className="t-title">
                        {LIBELLE_TYPE_ECHEANCE[e.type] ?? e.type}
                        {carteBrune ? (
                          <div className="t-sub">Bloquant pour tout départ international</div>
                        ) : null}
                      </td>
                      <td className="t-sub">
                        {[e.numero, e.organisme].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className={restants < 0 ? "font-semibold text-[var(--neg)]" : undefined}>
                        {formatDate(e.dateExpiration)}
                        {e.dateDebut ? (
                          <div className="t-sub">depuis {formatDate(e.dateDebut)}</div>
                        ) : null}
                      </td>
                      <td className={`num ${e.montantGnf != null ? "" : "vide"}`}>
                        {e.montantGnf != null ? formatNombre(n(e.montantGnf)) : "—"}
                      </td>
                      <td>
                        {restants < 0 ? (
                          <span className="badge b-down">Expiré</span>
                        ) : restants <= 7 ? (
                          <span className="badge b-down">Urgent · {restants} j</span>
                        ) : restants <= seuil ? (
                          <span className="badge b-warn">À renouveler · {restants} j</span>
                        ) : (
                          <span className="badge b-go">Valide</span>
                        )}
                      </td>
                      <td>
                        <SiPeut droit="flotte.ecrire">
                          <ActionsEcheance
                            echeance={{
                              id: e.id,
                              camionId: e.camionId,
                              type: e.type,
                              numero: e.numero,
                              organisme: e.organisme,
                              dateDebut: e.dateDebut
                                ? e.dateDebut.toISOString().slice(0, 10)
                                : null,
                              montantGnf: e.montantGnf != null ? n(e.montantGnf) : null,
                              dateExpiration: e.dateExpiration.toISOString().slice(0, 10),
                              rappelJours: e.rappelJours,
                            }}
                            camions={[{ id: camion.id, nom: camion.nom }]}
                            rappelDefaut={rappelDefaut}
                          />
                        </SiPeut>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="vide-msg">
              Aucun document enregistré. Assurance, visite technique, vignette, autorisation de
              transport, carte brune CEDEAO : ajoutez-les pour être prévenu avant expiration.
            </p>
          )}
        </div>

        {/* ---------- Entretien préventif ---------- */}
        <div className="card panel mb-5">
          <div className="head-row !mb-3">
            <h3>
              Entretien préventif{" "}
              <span className="sec-sub">— déclenche une alerte à l&apos;approche de l&apos;échéance</span>
            </h3>
            <DialogueEntretien
              camionId={camion.id}
              refrigere={camion.refrigere}
              kilometrage={camion.kilometrage}
              heuresGroupeFroid={camion.heuresGroupeFroid}
              tauxReferenceXof={tauxReferenceXof}
              declencheur={
                <button type="button" className="btn primary px-3 py-1.5 text-[12.5px]">
                  + Nouvel entretien
                </button>
              }
            />
          </div>

          {fiche.entretiens.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Entretien</th>
                    <th>Réalisé</th>
                    <th>Prochaine échéance</th>
                    <th className="num">Coût</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fiche.entretiens.map((e) => {
                    const echeances = [
                      e.prochainKm != null ? `${formatNombre(e.prochainKm)} km` : null,
                      e.prochainHeures != null ? `${formatNombre(e.prochainHeures)} h` : null,
                      e.prochaineDate ? formatDate(e.prochaineDate) : null,
                    ].filter(Boolean);

                    // Une échéance dépassée se voit immédiatement.
                    const depasse =
                      (e.prochainKm != null && camion.kilometrage >= e.prochainKm) ||
                      (e.prochainHeures != null && camion.heuresGroupeFroid >= e.prochainHeures) ||
                      (e.prochaineDate != null && e.prochaineDate < new Date());

                    return (
                      <tr key={e.id}>
                        <td className="t-title">{LIBELLE_TYPE_ENTRETIEN[e.type] ?? e.type}</td>
                        <td className="t-sub">
                          {e.dateFait ? formatDate(e.dateFait) : "—"}
                          {e.kmFait != null ? ` · ${formatNombre(e.kmFait)} km` : ""}
                        </td>
                        <td className={depasse ? "font-semibold text-[var(--neg)]" : undefined}>
                          {echeances.length > 0 ? echeances.join(" · ") : "—"}
                          {depasse ? <div className="t-sub text-[var(--neg)]">dépassée</div> : null}
                        </td>
                        <td className={`num ${n(e.coutGnf) > 0 ? "" : "vide"}`}>
                          {n(e.coutGnf) > 0 ? formatNombre(n(e.coutGnf)) : "—"}
                        </td>
                        <td>
                          <ActionsEntretien
                            entretien={{
                              id: e.id,
                              camionId: e.camionId,
                              type: e.type,
                              dateFait: e.dateFait ? e.dateFait.toISOString().slice(0, 10) : null,
                              kmFait: e.kmFait,
                              heuresFait: e.heuresFait,
                              prochainKm: e.prochainKm,
                              prochainHeures: e.prochainHeures,
                              prochaineDate: e.prochaineDate
                                ? e.prochaineDate.toISOString().slice(0, 10)
                                : null,
                              cout: n(e.cout),
                              devise: e.devise,
                              coutGnf: n(e.coutGnf),
                            }}
                            refrigere={camion.refrigere}
                            kilometrage={camion.kilometrage}
                            heuresGroupeFroid={camion.heuresGroupeFroid}
                            tauxReferenceXof={tauxReferenceXof}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="vide-msg">
              Aucun entretien planifié. En enregistrer un permet d&apos;être alerté avant
              l&apos;échéance plutôt qu&apos;après la panne.
            </p>
          )}
        </div>

        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            La <b>marge d&apos;exploitation</b> retranche les coûts courants du mois : carburant,
            rémunération, réparations, entretien, frais de voyage. Le prix d&apos;achat n&apos;y
            entre pas — il a été payé une fois, et le panneau <b>Acquisition</b> suit ce qu&apos;il
            reste à récupérer dessus.
          </span>
        </div>
      </div>
    </>
  );
}

function LigneCout({
  libelle,
  precision,
  montant,
}: {
  libelle: string;
  precision?: string;
  montant: number;
}) {
  return (
    <tr>
      <td>
        {libelle}
        {precision ? <span className="t-sub"> {precision}</span> : null}
      </td>
      <td className={`num ${montant > 0 ? "neg" : "vide"}`}>
        {montant > 0 ? `−${formatNombre(montant)}` : "—"}
      </td>
    </tr>
  );
}

function LigneInfo({ libelle, valeur, mono }: { libelle: string; valeur: string; mono?: boolean }) {
  return (
    <div className="mb-1.5 flex justify-between gap-3 text-[12.5px] text-[var(--muted)]">
      <span>{libelle}</span>
      <b className={`text-right text-[var(--ink)] ${mono ? "mono" : ""}`}>{valeur}</b>
    </div>
  );
}
