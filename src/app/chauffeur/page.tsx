import { sessionRequise } from "@/auth";
import { BoutonDeconnexion } from "@/components/chauffeur/bouton-deconnexion";
import { EnregistrementServiceWorker } from "@/components/chauffeur/enregistrement-sw";
import { EtatReseau } from "@/components/chauffeur/etat-reseau";
import { InviteInstallation } from "@/components/chauffeur/invite-installation";
import { Volet } from "@/components/chauffeur/volet";
import { actionAttendue, voletsOuverts } from "@/lib/chauffeur/etapes-utiles";
import { marqueEntreprise } from "@/lib/donnees/accueil";
import { FournisseurFile } from "@/components/chauffeur/file-attente";
import {
  BoutonAvancer,
  BoutonRotation,
  FormulaireArret,
  FormulaireDepense,
  FormulairePrelevement,
  FormulaireCodeLivraison,
  FormulaireQuantite,
  FormulaireReleve,
} from "@/components/chauffeur/formulaires";
import { espaceChauffeur } from "@/lib/donnees/chauffeur";
import {
  LIBELLE_STATUT_VOYAGE,
  LIBELLE_TYPE_DEPENSE,
  LIBELLE_TYPE_ETAPE,
  formatDate,
  formatDecimal,
  formatNombre,
  n,
} from "@/lib/utils";
import { vueLignes } from "@/lib/donnees/marchandises";
import { formatQuantite } from "@/lib/donnees/unites";
import { paysActifs } from "@/lib/donnees/pays";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace chauffeur" };

/** Libellé du bouton d'avancement, selon l'état de la mission. */
const PROCHAINE_ETAPE: Record<string, string> = {
  PLANIFIE: "Je pars pour la mission",
  EN_ROUTE_CHARGEMENT: "Je suis arrivé au chargement",
  EN_ATTENTE_CHARGEMENT: "Chargé — je pars",
  EN_COURS: "Je suis arrivé à destination",
  ARRIVE_DESTINATION: "Début du déchargement",
  EN_DECHARGEMENT: "Mission terminée",
};

/**
 * Dernier compteur relevé sur la mission.
 *
 * Sert de plancher à la saisie suivante : un compteur ne recule pas, et une
 * valeur en dessous donnerait une distance négative sur le segment.
 */
function dernierCompteur(v: {
  kmDepart: number | null;
  kmArriveeChargement: number | null;
  kmChargement: number | null;
  kmArriveeDestination: number | null;
  kmDechargement: number | null;
  kmArrivee: number | null;
}): number | null {
  return (
    [
      v.kmArrivee,
      v.kmDechargement,
      v.kmArriveeDestination,
      v.kmChargement,
      v.kmArriveeChargement,
      v.kmDepart,
    ].find((km) => km != null) ?? null
  );
}

export default async function EspaceChauffeurPage() {
  const session = await sessionRequise();

  // Le gérant peut ouvrir l'écran, mais il n'a pas de fiche chauffeur.
  const espace = session.user.chauffeurId ? await espaceChauffeur(session.user.chauffeurId) : null;
  // Les pays viennent de la base : le chauffeur y désigne le poste de douane.
  const pays = await paysActifs();
  // L'invite d'installation porte le nom de l'exploitation, pas celui du code.
  const marque = await marqueEntreprise();

  if (!espace) {
    return (
      // Le fournisseur enveloppe aussi cette branche : la déconnexion vérifie
      // la file avant de partir, et sans lui elle plante l'écran entier.
      <FournisseurFile>
      <div className="ph-app">
        <EnregistrementServiceWorker />
        <div className="ph-top">
          <div className="hi">Bonjour {session.user.name}</div>
          <div className="tk">Aucune fiche chauffeur rattachée à ce compte</div>
        </div>
        <div className="ph-body">
          <div className="ph-card">
            <p className="text-[12.5px] text-[var(--muted)]">
              Cet écran est réservé aux comptes chauffeur. Connecte-toi avec le téléphone de bord, ou
              demande au gérant de rattacher ta fiche.
            </p>
          </div>
          <BoutonDeconnexion />
        </div>
      </div>
      </FournisseurFile>
    );
  }

  const { chauffeur, mission, carburantFourni, pasEncorePartie, caisse, avances, parametres } = espace;
  const tauxReferenceXof = parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null;

  // Consigne de froid : celle du dernier relevé, sinon celle des Paramètres.
  const dernier = mission?.relevesTemp?.[0] ?? null;
  const consigneFroid =
    dernier?.consigne != null
      ? n(dernier.consigne)
      : parametres?.consigneFroidDefaut != null
        ? n(parametres.consigneFroidDefaut)
        : null;
  // Chaque marchandise se suit séparément : unités différentes, écarts
  // différents, et un prélèvement de douane porte sur un article précis.
  const marchandises = mission ? vueLignes(mission.lignes) : [];

  /*
   * Ce qui s'ouvre dépend de l'état de la mission.
   *
   * Tout était déplié en même temps : 22 champs et 10 boutons sur quatre
   * écrans. Le voyage porte déjà sa machine à états — elle décide désormais de
   * ce qui est mis en avant, le reste restant à un geste.
   */
  const ouverts = mission ? voletsOuverts(mission.statut) : [];
  const consigneAction = mission ? actionAttendue(mission.statut) : null;
  const dernierReleve = dernier
    ? {
        temperature: n(dernier.temperature),
        conformite: dernier.conformite,
        releveLe: dernier.releveLe.toISOString(),
      }
    : null;

  return (
    // La file des saisies hors ligne enveloppe tout l'espace : le bandeau
    // comme les formulaires doivent y accéder.
    <FournisseurFile>
    <div className="ph-app">
      <EnregistrementServiceWorker />

      <div className="ph-top">
        <div className="hi">Bonjour, {chauffeur.nom.split(" ")[0]}</div>
        <div className="tk">
          {mission
            ? [
                pasEncorePartie ? "À venir" : null,
                mission.camion.nom,
                mission.camion.marqueGroupeFroid,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Aucune mission en cours"}
        </div>
        {consigneAction ? <div className="ph-consigne">{consigneAction}</div> : null}
      </div>

      <div className="ph-body">
        <InviteInstallation nom={marque.raisonSociale} />
        <EtatReseau />

        {/* ---------- Caisse ---------- */}
        <div className="ph-card">
          <div className="lab">Ma caisse</div>
          <div className="ph-caisse">
            <b className="mono">{formatNombre(caisse.parDevise.GNF)} GNF</b>
            {caisse.parDevise.XOF !== 0 ? (
              <b className="mono cfa">{formatNombre(caisse.parDevise.XOF)} CFA</b>
            ) : null}
          </div>
          <p className="ph-aide">
            Solde détenu, par devise. Consolidé : {formatNombre(caisse.consolideGnf)} GNF.
          </p>

          {/* Carburant payé directement par l'entreprise.
              Ce n'est pas son argent et il n'a rien à justifier dessus — mais
              il doit savoir que le plein est fait, sinon il le repaie sur sa
              propre caisse en croyant qu'on ne lui a rien donné. */}
          {carburantFourni.length > 0 ? (
            <>
              <div className="ph-recu-tete">Carburant payé par l&apos;entreprise</div>
              <ul className="ph-recu">
                {carburantFourni.map((d) => (
                  <li key={d.id}>
                    <span>
                      {LIBELLE_TYPE_DEPENSE[d.type] ?? d.type}
                      {d.litres != null ? <em className="ph-recu-mission"> · {formatDecimal(n(d.litres))} L</em> : null}
                    </span>
                    <b className="mono">{formatNombre(n(d.montantGnf))} GNF</b>
                  </li>
                ))}
              </ul>
              <p className="ph-aide">Réglé directement — rien à justifier là-dessus.</p>
            </>
          ) : null}

          {/* Ce qu'il a reçu et pour quoi. Un solde global ne lui dit pas sur
              quelle enveloppe il pioche ni ce qui lui reste à justifier. */}
          {avances.length > 0 ? (
            <>
              <div className="ph-recu-tete">Ce que j&apos;ai reçu</div>
              <ul className="ph-recu">
                {avances.map((a) => (
                  <li key={a.id}>
                    <span>
                      {a.objet}
                      {/* Deux enveloppes du même objet sur deux missions ne
                          doivent pas se confondre. */}
                      {a.mission && !a.pourCetteMission ? (
                        <em className="ph-recu-mission"> · {a.mission}</em>
                      ) : null}
                    </span>
                    <b className="mono">
                      {formatNombre(a.montant)} {a.devise === "GNF" ? "GNF" : "CFA"}
                    </b>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {mission ? (
          <>
            {/* ---------- Mission en cours ---------- */}
            <div className="ph-card">
              <div className="lab">Trajet en cours</div>
              <div className="ph-trajet">
                {mission.villeDepart} → {mission.villeArrivee}
                {mission.paysDepartId !== mission.paysArriveeId ? (
                  <span className="badge b-intl ml-2">INTL</span>
                ) : null}
              </div>
              <div className="ph-etat">{LIBELLE_STATUT_VOYAGE[mission.statut]}</div>

              {/* Fil du trajet réel, étape par étape. */}
              <div className="tl">
                <div className="tl-i done">
                  <span className="tl-dot" />
                  <div>
                    <b>{mission.villeDepart}</b>
                    <i>
                      Départ · {formatDate(mission.dateDepart)}
                      {mission.kmDepart ? ` · ${formatNombre(mission.kmDepart)} km` : ""}
                    </i>
                  </div>
                </div>
                {mission.etapes.map((etape) => (
                  <div key={etape.id} className={`tl-i ${etape.arriveeLe ? "done" : "now"}`}>
                    <span className="tl-dot" />
                    <div>
                      <b>{etape.villeArrivee}</b>
                      <i>
                        {[LIBELLE_TYPE_ETAPE[etape.type], etape.motif].filter(Boolean).join(" — ")}
                      </i>
                    </div>
                  </div>
                ))}
                <div className="tl-i">
                  <span className="tl-dot" />
                  <div>
                    <b>{mission.villeArrivee}</b>
                    <i>Destination</i>
                  </div>
                </div>
              </div>

              {PROCHAINE_ETAPE[mission.statut] ? (
                <BoutonAvancer
                  voyageId={mission.id}
                  libelle={PROCHAINE_ETAPE[mission.statut]}
                  dernierKm={dernierCompteur(mission)}
                />
              ) : null}
            </div>

            {/* Rotations : uniquement quand la mission en compte plusieurs
                ou que le camion est une benne. */}
            {mission.camion.carrosserie === "BENNE" || mission.nbRotations > 1 ? (
              <Volet
                titre="Rotations du jour"
                ouvert={ouverts.includes("rotations")}
                indice={`${mission.nbRotations} effectuée${mission.nbRotations > 1 ? "s" : ""}`}
              >
                <BoutonRotation
                  voyageId={mission.id}
                  nbRotations={mission.nbRotations}
                  tarifRotation={mission.tarifRotation != null ? n(mission.tarifRotation) : null}
                />
              </Volet>
            ) : null}

            {/* Chaîne du froid — seulement sur un camion frigorifique. */}
            {mission.camion.refrigere ? (
              <Volet
                titre="Chaîne du froid"
                ouvert={ouverts.includes("froid")}
                indice={
                  dernierReleve
                    ? `${formatDecimal(dernierReleve.temperature)} °C`
                    : "aucun relevé"
                }
              >
                <FormulaireReleve
                  voyageId={mission.id}
                  consigne={consigneFroid}
                  dernier={dernierReleve}
                />
              </Volet>
            ) : null}

            {/* ---------- Arrêt / changement de destination ---------- */}
            <Volet titre="Signaler un arrêt" ouvert={ouverts.includes("arret")}>
              <FormulaireArret voyageId={mission.id} villeActuelle={mission.villeArrivee} />
            </Volet>

            {/* ---------- Chargement ----------
                Séparé de la livraison : les deux se produisent à des jours et
                des lieux différents. Réunis dans une même carte, ils
                affichaient deux boutons « Confirmer » identiques à quelques
                centimètres l'un de l'autre. */}
            <Volet
              titre="Chargement"
              ouvert={ouverts.includes("chargement")}
              indice={`${marchandises.filter((m) => m.quantiteRecue != null).length}/${marchandises.length} constaté${marchandises.length > 1 ? "s" : ""}`}
            >
              {marchandises.map((m) => (
                <div key={m.id} className="ph-marchandise">
                  <div className="lab">
                    {m.designation}
                    {m.client ? <span className="ph-aide"> — {m.client}</span> : null}
                  </div>
                  {m.quantiteACharger != null ? (
                    <p className="ph-aide">
                      À charger (prévu) : <b>{formatQuantite(m.quantiteACharger, m.symbole)}</b>
                    </p>
                  ) : null}
                  <FormulaireQuantite
                    voyageId={mission.id}
                    ligneId={m.id}
                    designation="Quantité reçue"
                    symbole={m.symbole}
                    mode="chargement"
                    valeurInitiale={m.quantiteRecue}
                    prevu={m.quantiteACharger}
                    recue={null}
                  />
                </div>
              ))}
            </Volet>

            {/* ---------- Livraison ---------- */}
            <Volet
              titre="Livraison"
              ouvert={ouverts.includes("livraison")}
              indice={`${marchandises.filter((m) => m.quantiteLivree != null).length}/${marchandises.length} livré${marchandises.length > 1 ? "s" : ""}`}
            >
              {marchandises.map((m) => (
                <div key={m.id} className="ph-marchandise">
                  <div className="lab">
                    {m.designation}
                    {m.client ? <span className="ph-aide"> — {m.client}</span> : null}
                  </div>
                  {m.quantiteRecue != null ? (
                    <p className="ph-aide">
                      Reçu au chargement : <b>{formatQuantite(m.quantiteRecue, m.symbole)}</b>
                    </p>
                  ) : null}
                  <FormulaireQuantite
                    voyageId={mission.id}
                    ligneId={m.id}
                    designation="Quantité livrée"
                    symbole={m.symbole}
                    mode="livraison"
                    valeurInitiale={m.quantiteLivree}
                    prevu={null}
                    recue={m.quantiteRecue}
                  />

                  <div className="ph-separateur" />

                  {/* La quantité seule ne prouve pas la remise : c'est le code
                      dicté par le client qui l'atteste. */}
                  <FormulaireCodeLivraison
                    ligneId={m.id}
                    designation="Code remis par le client"
                    confirme={m.codeConfirme}
                    codeEnvoye={m.codeEnvoye}
                  />
                </div>
              ))}
            </Volet>

            {/* Prélèvement de douane — à déclarer sur le trajet, pas au retour. */}
            <Volet titre="Prélèvement de douane" ouvert={ouverts.includes("douane")}>
              <p className="ph-aide">
                Si un poste retient une partie de la marchandise, déclare-le ici. Sans cette
                déclaration, la quantité manquante te serait imputée à l&apos;arrivée.
              </p>
              <FormulairePrelevement
                voyageId={mission.id}
                pays={pays}
                paysDefaut={mission.paysArriveeId ?? ""}
                marchandises={marchandises.map((m) => ({
                  id: m.id,
                  designation: m.designation,
                  symbole: m.symbole,
                  dejaPreleve: m.prelevementQuantite,
                }))}
              />
            </Volet>

            {/* ---------- Dépense ---------- */}
            <Volet
              titre="Saisir une dépense"
              ouvert={ouverts.includes("depense")}
              indice={
                mission.depenses.length > 0
                  ? `${mission.depenses.length} saisie${mission.depenses.length > 1 ? "s" : ""}`
                  : null
              }
            >
              <FormulaireDepense voyageId={mission.id} tauxReferenceXof={tauxReferenceXof} />
            </Volet>

            {mission.depenses.length > 0 ? (
              <div className="ph-card">
                <div className="lab">Mes dernières saisies</div>
                {mission.depenses.map((d) => (
                  <div key={d.id} className="ph-ligne">
                    <span>
                      {LIBELLE_TYPE_DEPENSE[d.type] ?? d.type}
                      {d.litres ? ` · ${formatNombre(n(d.litres))} L` : ""}
                    </span>
                    <b className="mono">
                      {formatNombre(n(d.montant))} {d.devise === "XOF" ? "CFA" : "GNF"}
                    </b>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="ph-card">
            <p className="text-[12.5px] text-[var(--muted)]">
              Aucune mission ne t&apos;est attribuée pour le moment.
            </p>
          </div>
        )}

        <BoutonDeconnexion />
      </div>
    </div>
    </FournisseurFile>
  );
}
