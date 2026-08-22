import Link from "next/link";

import { IconeAlerteTriangle } from "@/components/icones";
import type { PnlCamion } from "@/lib/donnees/camions";
import {
  formatDecimal,
  formatMillions,
  formatMillionsSigne,
  formatNombre,
  LIBELLE_STATUT_CAMION,
  LIBELLE_TYPE_VEHICULE,
} from "@/lib/utils";

interface Props {
  pnl: PnlCamion;
  /** Température du dernier relevé, si le camion est frigorifique et en mission. */
  temperature?: number | null;
  /** Ligne d'alerte affichée en pied de carte (panne, immobilisation…). */
  signal?: string | null;
  /** Destination du voyage en cours, pour compléter le badge d'état. */
  destination?: string | null;
  /** État du voyage en cours : plus parlant que le statut du camion quand il roule. */
  statutVoyage?: string | null;
}

const CLASSE_BADGE: Record<string, string> = {
  EN_VOYAGE: "b-go",
  DISPONIBLE: "b-idle",
  IMMOBILISE: "b-down",
  HORS_SERVICE: "b-down",
};

/** Carte « signature » de la maquette : vitals sombres + P&L en pied. */
export function CarteCamion({ pnl, temperature, signal, destination, statutVoyage }: Props) {
  const { camion } = pnl;
  const enPanne = camion.statut === "IMMOBILISE" || camion.statut === "HORS_SERVICE";
  // Sous-titre : groupe froid (si frigo) + immatriculations, sans répéter le nom.
  const identite = [
    camion.refrigere ? camion.marqueGroupeFroid : LIBELLE_TYPE_VEHICULE[camion.typeVehicule],
    camion.immatTracteur,
    camion.immatRemorque,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/camions/${camion.id}`} className={`card truck${enPanne ? " down" : ""}`}>
      <div className="vitals">
        <span className="plate">{camion.nom}</span>
        <div className="who">
          <div className="nm">{camion.marqueTracteur ?? camion.immatTracteur}</div>
          <div className="gf">{identite}</div>
        </div>
        {camion.refrigere ? (
          <div className="temp">
            <span className="led" />
            {temperature != null ? `${formatDecimal(temperature)} °C` : "—"}
          </div>
        ) : (
          <div className="temp text-[#7EA2AA]">non frigo</div>
        )}
      </div>

      <div className="body">
        <div className="st-row">
          {/* En mission, l'état du voyage prime sur le statut du camion. */}
          <span
            className={`badge ${statutVoyage && !enPanne ? "b-go" : (CLASSE_BADGE[camion.statut] ?? "b-idle")}`}
          >
            <span className="led" />
            {statutVoyage && !enPanne ? statutVoyage : LIBELLE_STATUT_CAMION[camion.statut]}
            {destination && !enPanne ? ` · ${destination}` : ""}
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
          </div>
        </div>

        <div className="pnl">
          <div>
            <div className="l">Recette</div>
            <div className="n">{formatMillions(pnl.recetteGnf)} M</div>
          </div>
          <div>
            <div className="l">Coûts</div>
            <div className="n">{formatMillions(pnl.couts)} M</div>
          </div>
          <div>
            <div className="l">Marge exploit.</div>
            <div
              className={`n ${pnl.recetteManquante ? "" : pnl.margeExploitation >= 0 ? "pos" : "neg"}`}
              title={pnl.recetteManquante ? "Recette non renseignée sur au moins une mission" : undefined}
            >
              {pnl.recetteManquante ? "à renseigner" : `${formatMillionsSigne(pnl.margeExploitation)} M`}
            </div>
          </div>
        </div>

        {signal ? (
          <div className="flag">
            <IconeAlerteTriangle width={14} height={14} strokeWidth={2} />
            {signal}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
