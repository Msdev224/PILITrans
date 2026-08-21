import { sessionRequise } from "@/auth";
import { BoutonDeconnexion } from "@/components/chauffeur/bouton-deconnexion";
import { EnregistrementServiceWorker } from "@/components/chauffeur/enregistrement-sw";
import { EtatReseau } from "@/components/chauffeur/etat-reseau";
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
  formatDate,
  formatNombre,
  LIBELLE_STATUT_VOYAGE,
  LIBELLE_TYPE_DEPENSE,
  LIBELLE_TYPE_ETAPE,
  n,
} from "@/lib/utils";
import { vueLignes } from "@/lib/donnees/marchandises";
import { formatQuantite } from "@/lib/donnees/unites";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace chauffeur — PILITrans" };

/** Libellé du bouton d'avancement, selon l'état de la mission. */
const PROCHAINE_ETAPE: Record<string, string> = {
  PLANIFIE: "Je suis arrivé au chargement",
  EN_ATTENTE_CHARGEMENT: "Chargé — je pars",
  EN_COURS: "Je suis arrivé à destination",
  ARRIVE_DESTINATION: "Début du déchargement",
  EN_DECHARGEMENT: "Mission terminée",
};

export default async function EspaceChauffeurPage() {
  const session = await sessionRequise();

  // Le gérant peut ouvrir l'écran, mais il n'a pas de fiche chauffeur.
  const espace = session.user.chauffeurId ? await espaceChauffeur(session.user.chauffeurId) : null;

  if (!espace) {
    return (
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
    );
  }

  const { chauffeur, mission, prochaine, caisse, parametres } = espace;
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
  const dernierReleve = dernier
    ? {
        temperature: n(dernier.temperature),
        conformite: dernier.conformite,
        releveLe: dernier.releveLe.toISOString(),
      }
    : null;

  return (
    <div className="ph-app">
      <EnregistrementServiceWorker />

      <div className="ph-top">
        <div className="hi">Bonjour, {chauffeur.nom.split(" ")[0]}</div>
        <div className="tk">
          {mission
            ? [mission.camion.nom, mission.camion.marqueGroupeFroid].filter(Boolean).join(" · ")
            : prochaine
              ? `Prochaine mission · ${prochaine.camion.nom}`
              : "Aucune mission en cours"}
        </div>
      </div>

      <div className="ph-body">
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
        </div>

        {mission ? (
          <>
            {/* ---------- Mission en cours ---------- */}
            <div className="ph-card">
              <div className="lab">Trajet en cours</div>
              <div className="ph-trajet">
                {mission.villeDepart} → {mission.villeArrivee}
                {mission.paysDepart !== mission.paysArrivee ? (
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
                <BoutonAvancer voyageId={mission.id} libelle={PROCHAINE_ETAPE[mission.statut]} />
              ) : null}
            </div>

            {/* Rotations : uniquement quand la mission en compte plusieurs
                ou que le camion est une benne. */}
            {mission.camion.carrosserie === "BENNE" || mission.nbRotations > 1 ? (
              <div className="ph-card">
                <div className="lab">Rotations du jour</div>
                <BoutonRotation
                  voyageId={mission.id}
                  nbRotations={mission.nbRotations}
                  tarifRotation={mission.tarifRotation != null ? n(mission.tarifRotation) : null}
                />
              </div>
            ) : null}

            {/* Chaîne du froid — seulement sur un camion frigorifique. */}
            {mission.camion.refrigere ? (
              <div className="ph-card">
                <div className="lab">Chaîne du froid</div>
                <FormulaireReleve
                  voyageId={mission.id}
                  consigne={consigneFroid}
                  dernier={dernierReleve}
                />
              </div>
            ) : null}

            {/* ---------- Arrêt / changement de destination ---------- */}
            <div className="ph-card">
              <div className="lab">Signaler un arrêt</div>
              <FormulaireArret voyageId={mission.id} villeActuelle={mission.villeArrivee} />
            </div>

            {/* ---------- Chargement & livraison ---------- */}
            {marchandises.map((m) => (
              <div key={m.id} className="ph-card">
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

                <div className="ph-separateur" />

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

            {/* Prélèvement de douane — à déclarer sur le trajet, pas au retour. */}
            <div className="ph-card">
              <div className="lab">Prélèvement de douane</div>
              <p className="ph-aide">
                Si un poste retient une partie de la marchandise, déclare-le ici. Sans cette
                déclaration, la quantité manquante te serait imputée à l&apos;arrivée.
              </p>
              <FormulairePrelevement
                voyageId={mission.id}
                paysDefaut={mission.paysArrivee}
                marchandises={marchandises.map((m) => ({
                  id: m.id,
                  designation: m.designation,
                  symbole: m.symbole,
                  dejaPreleve: m.prelevementQuantite,
                }))}
              />
            </div>

            {/* ---------- Dépense ---------- */}
            <div className="ph-card">
              <div className="lab">Nouvelle dépense</div>
              <FormulaireDepense voyageId={mission.id} tauxReferenceXof={tauxReferenceXof} />
            </div>

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
        ) : prochaine ? (
          <div className="ph-card">
            <div className="lab">Prochaine mission</div>
            <div className="ph-trajet">
              {prochaine.villeDepart} → {prochaine.villeArrivee}
            </div>
            <p className="ph-aide">Départ prévu le {formatDate(prochaine.dateDepart)}.</p>
            <BoutonAvancer voyageId={prochaine.id} libelle="Je suis arrivé au chargement" />
          </div>
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
  );
}


