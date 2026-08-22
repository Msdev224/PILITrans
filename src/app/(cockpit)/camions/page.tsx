import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { ActionsCamion } from "@/components/camions/actions-camion";
import { DialogueCamion, type CamionEditable } from "@/components/camions/dialogue-camion";
import { IconeInfo, IconePlus } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { pnlFlotte } from "@/lib/donnees/camions";
import { moisCourant } from "@/lib/periode";
import { indicatifsPays } from "@/lib/donnees/pays";
import { prisma } from "@/lib/prisma";
import { LIBELLE_CARROSSERIE, LIBELLE_STATUT_CAMION, LIBELLE_TYPE_VEHICULE, carrosseriesDisponibles, formatSigne, n } from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";

const CLASSE_BADGE: Record<string, string> = {
  EN_VOYAGE: "b-go",
  DISPONIBLE: "b-idle",
  IMMOBILISE: "b-down",
  HORS_SERVICE: "b-down",
};

export default async function CamionsPage() {
  const periode = moisCourant();
  const [session, camions, parametres, fil, ecritures, indicatifs] = await Promise.all([
    sessionRequise(),
    pnlFlotte(periode),
    prisma.parametres.findFirst(),
    filAlertes(),
    prisma.camion.findMany({
      where: { actif: true },
      select: { id: true, _count: { select: { voyages: true, depenses: true, reparations: true } } },
    }),
    indicatifsPays(),
  ]);

  // Bus et taxis n'apparaissent que si le module est activé dans les Paramètres.
  const carrosseries = carrosseriesDisponibles(parametres?.transportPersonnesActif ?? false);

  const aRoule = new Map(
    ecritures.map((c) => [c.id, c._count.voyages + c._count.depenses + c._count.reparations > 0]),
  );

  return (
    <>
      <BarreHaut
        titre="Camions"
        sousTitre={`Parc — ${camions.length} véhicule${camions.length > 1 ? "s" : ""} actif${camions.length > 1 ? "s" : ""}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Chaque camion a son <b>téléphone de bord</b>. <b>Cliquez sur un camion</b> pour ouvrir sa
            fiche : compte de résultat du mois, acquisition et amortissement, réparations.
          </span>
        </div>

        <div className="head-row">
          <h3>
            Camions <span className="sec-sub">— {periode.libelle}</span>
          </h3>
          <SiPeut droit="flotte.ecrire">
            <DialogueCamion
              indicatifs={indicatifs}
              carrosseries={carrosseries}
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Ajouter un camion
                </button>
              }
            />
          </SiPeut>
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Camion</th>
                <th>Type / froid</th>
                <th>Téléphone de bord</th>
                <th>Statut</th>
                <th className="num">Marge du mois</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {camions.map((pnl) => {
                const { camion } = pnl;
                return (
                  <tr key={camion.id}>
                    <td>
                      <Link href={`/camions/${camion.id}`} className="plate clair link">
                        {camion.nom}
                      </Link>
                      <div className="t-sub mt-1">{camion.immatTracteur}</div>
                    </td>
                    <td>
                      {LIBELLE_TYPE_VEHICULE[camion.typeVehicule]}
                      {" · "}
                      {camion.refrigere ? (
                        camion.marqueGroupeFroid ?? LIBELLE_CARROSSERIE[camion.carrosserie]
                      ) : (
                        <span className="text-[var(--muted-2)]">
                          {LIBELLE_CARROSSERIE[camion.carrosserie]} · non réfrigéré
                        </span>
                      )}
                    </td>
                    <td className="tel">
                      {camion.telephoneBord1 ?? <span className="text-[var(--muted-2)]">—</span>}
                      {camion.telephoneBord2 ? (
                        <>
                          <br />
                          <span className="two">{camion.telephoneBord2}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${CLASSE_BADGE[camion.statut] ?? "b-idle"}`}>
                        <span className="led" />
                        {LIBELLE_STATUT_CAMION[camion.statut]}
                      </span>
                    </td>
                    <td
                      className={`num ${
                        pnl.recetteManquante
                          ? "vide"
                          : pnl.margeExploitation > 0
                            ? "pos"
                            : pnl.margeExploitation < 0
                              ? "neg"
                              : "vide"
                      }`}
                    >
                      {pnl.recetteGnf === 0 && pnl.couts === 0
                        ? "—"
                        : pnl.recetteManquante
                          ? "à renseigner"
                          : formatSigne(pnl.margeExploitation)}
                    </td>
                    <td>
                      <ActionsCamion
              indicatifs={indicatifs}
                        camion={aplatir(camion)}
                        carrosseries={carrosseries}
                        aRoule={aRoule.get(camion.id) ?? false}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Les Decimal de Prisma ne traversent pas la frontière serveur → client. */
function aplatir(camion: {
  id: string;
  nom: string;
  typeVehicule: string;
  carrosserie: string;
  refrigere: boolean;
  immatTracteur: string;
  immatRemorque: string | null;
  marqueTracteur: string | null;
  photo: string | null;
  telephoneBord1: string | null;
  telephoneBord2: string | null;
  marqueGroupeFroid: string | null;
  modeleGroupeFroid: string | null;
  heuresGroupeFroid: number;
  kilometrage: number;
  coutAcquisition: unknown;
  dateAcquisition: Date | null;
  dureeAmortissementMois: number | null;
  statut: string;
}): CamionEditable {
  return {
    id: camion.id,
    nom: camion.nom,
    typeVehicule: camion.typeVehicule,
    carrosserie: camion.carrosserie,
    refrigere: camion.refrigere,
    immatTracteur: camion.immatTracteur,
    immatRemorque: camion.immatRemorque,
    marqueTracteur: camion.marqueTracteur,
    photo: camion.photo,
    telephoneBord1: camion.telephoneBord1,
    telephoneBord2: camion.telephoneBord2,
    marqueGroupeFroid: camion.marqueGroupeFroid,
    modeleGroupeFroid: camion.modeleGroupeFroid,
    heuresGroupeFroid: camion.heuresGroupeFroid,
    kilometrage: camion.kilometrage,
    coutAcquisition: camion.coutAcquisition != null ? n(camion.coutAcquisition as never) : null,
    dateAcquisition: camion.dateAcquisition ? camion.dateAcquisition.toISOString().slice(0, 10) : null,
    dureeAmortissementMois: camion.dureeAmortissementMois,
    statut: camion.statut,
  };
}
