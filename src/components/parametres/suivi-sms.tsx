"use client";

import type { NotificationSms } from "@prisma/client";
import { useState, useTransition } from "react";

import { annulerNotification, viderFileSms } from "@/actions/sms";
import { IconeCorbeille } from "@/components/icones";
import { formatDate } from "@/lib/utils";

const LIBELLE_EVENEMENT: Record<string, string> = {
  CHAUFFEUR_AFFECTATION: "Affectation chauffeur",
  CLIENT_DEPART: "Départ",
  CLIENT_ARRIVEE: "Arrivée",
  CLIENT_LIVRAISON: "Livraison",
  CLIENT_FACTURE: "Facture",
  CLIENT_RELANCE: "Relance",
  AUTRE: "Autre",
};

const BADGE: Record<string, { classe: string; libelle: string }> = {
  EN_ATTENTE: { classe: "b-warn", libelle: "En file" },
  ENVOYE: { classe: "b-go", libelle: "Envoyé" },
  ECHEC: { classe: "b-down", libelle: "Échec" },
  ANNULE: { classe: "b-idle", libelle: "Annulé" },
};

/**
 * Suivi de la file SMS. Tant que les clés Nimba manquent, les messages
 * s'accumulent ici : on voit exactement ce qui partira, et rien n'est perdu.
 */
export function SuiviSms({
  notifications,
  enAttente,
}: {
  notifications: NotificationSms[];
  enAttente: number;
}) {
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<string | null>(null);

  return (
    <div className="card panel">
      <div className="head-row !mb-3">
        <h3>
          Suivi des SMS{" "}
          <span className="sec-sub">
            — {enAttente} message{enAttente > 1 ? "s" : ""} en attente
          </span>
        </h3>
        {enAttente > 0 ? (
          <button
            type="button"
            className="btn primary px-3 py-1.5 text-[12.5px]"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const r = await viderFileSms();
                setResultat(r.message);
              })
            }
          >
            {enCours ? "Envoi…" : "Vider la file"}
          </button>
        ) : null}
      </div>

      {resultat ? <div className="note mb-3">{resultat}</div> : null}

      {notifications.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Événement</th>
                <th>Destinataire</th>
                <th>Message</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {notifications.map((notif) => {
                const badge = BADGE[notif.statut] ?? BADGE.EN_ATTENTE;
                return (
                  <tr key={notif.id}>
                    <td className="t-title">
                      {LIBELLE_EVENEMENT[notif.evenement] ?? notif.evenement}
                      <div className="t-sub">{formatDate(notif.createdAt)}</div>
                    </td>
                    <td className="tel">
                      {notif.destinataire}
                      {notif.nom ? <div className="t-sub">{notif.nom}</div> : null}
                    </td>
                    <td className="max-w-[320px] text-[12px] text-[var(--muted)]">
                      {notif.message}
                    </td>
                    <td>
                      <span className={`badge ${badge.classe}`}>{badge.libelle}</span>
                      {notif.erreur ? (
                        <div className="t-sub text-[var(--neg)]">{notif.erreur}</div>
                      ) : null}
                    </td>
                    <td>
                      {notif.statut === "EN_ATTENTE" || notif.statut === "ECHEC" ? (
                        <div className="acts">
                          <button
                            type="button"
                            className="del"
                            title="Annuler ce message"
                            disabled={enCours}
                            onClick={() => demarrer(() => annulerNotification(notif.id))}
                          >
                            <IconeCorbeille />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="vide-msg">
          Aucun message pour le moment. Les notifications apparaîtront ici dès qu&apos;une mission
          changera d&apos;étape ou qu&apos;une facture sera émise.
        </p>
      )}
    </div>
  );
}
