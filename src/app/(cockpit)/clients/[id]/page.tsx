import Link from "next/link";
import { notFound } from "next/navigation";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconePlus } from "@/components/icones";
import { SiPeut } from "@/components/si-peut";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { ficheClient } from "@/lib/donnees/fiche-client";
import { formatQuantite } from "@/lib/donnees/unites";
import { prisma } from "@/lib/prisma";
import { formatTelephone } from "@/lib/telephone";
import { formatDate, formatGnf, formatNombre, LIBELLE_STATUT_VOYAGE, n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fiche client — PILITrans" };

const BADGE_FACTURE: Record<string, string> = {
  PAYEE: "b-go",
  PARTIELLE: "b-warn",
  EMISE: "b-intl",
  EN_RETARD: "b-down",
};

export default async function FicheClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, fiche, parametres, fil] = await Promise.all([
    sessionRequise(),
    ficheClient(id),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  if (!fiche) notFound();
  const { client } = fiche;

  return (
    <>
      <BarreHaut
        titre={client.nom}
        sousTitre={[client.ville, client.contact].filter(Boolean).join(" · ") || "Client"}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {/* ---------- Chiffres clés ---------- */}
        <div className="kpis mb-5">
          <div className="card kpi">
            <div className="lab">Recette totale</div>
            <div className="val">{formatNombre(fiche.recetteTotaleGnf)}<span className="unit">GNF</span></div>
            <div className="delta flat">
              {fiche.missions.length} mission{fiche.missions.length > 1 ? "s" : ""}
            </div>
          </div>
          <div className="card kpi warnbar">
            <div className="lab">Encours à recevoir</div>
            <div className="val">{formatNombre(fiche.encoursGnf)}<span className="unit">GNF</span></div>
            <div className="delta flat">
              {fiche.enRetardGnf > 0 ? `dont ${formatNombre(fiche.enRetardGnf)} en retard` : "rien en retard"}
            </div>
          </div>
          <div className="card kpi">
            <div className="lab">Encaissé</div>
            <div className="val">{formatNombre(fiche.encaisseGnf)}<span className="unit">GNF</span></div>
            <div className="delta flat">Règlements enregistrés</div>
          </div>
          <div className="card kpi">
            <div className="lab">Réclamations ouvertes</div>
            <div className="val">{fiche.nbReclamationsOuvertes}</div>
            <div className="delta flat">
              <Link href="/reclamations">Voir les réclamations</Link>
            </div>
          </div>
        </div>

        {/* ---------- Coordonnées ---------- */}
        <div className="card panel mb-5">
          <h3>Coordonnées</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-[var(--muted)]">
            <Info libelle="Téléphone" valeur={formatTelephone(client.telephone)} mono />
            <Info libelle="WhatsApp" valeur={client.whatsapp ? "Oui" : "Non"} />
            <Info
              libelle="Contact"
              valeur={
                [client.contact, client.telephoneContact ? formatTelephone(client.telephoneContact) : null]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }
            />
            <Info libelle="E-mail" valeur={client.email ?? "—"} />
            <Info libelle="Adresse" valeur={client.adresse ?? "—"} />
            <Info libelle="NIF" valeur={client.nif ?? "—"} mono />
          </div>
        </div>

        {/* ---------- Missions ---------- */}
        <div className="head-row">
          <h3>
            Missions <span className="sec-sub">— {fiche.missions.length}</span>
          </h3>
          {/* Créer une mission depuis le client : il est déjà connu, on ne le
              ressaisit pas et on ne risque pas une seconde orthographe. */}
          <SiPeut droit="voyages.ecrire">
            <Link href={`/voyages?client=${client.id}&nouveau=1`} className="btn-add">
              <IconePlus />
              Nouvelle mission
            </Link>
          </SiPeut>
        </div>

        {fiche.missions.length > 0 ? (
          <div className="card overflow-x-auto mb-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Trajet</th>
                  <th>Marchandises</th>
                  <th>Date</th>
                  <th>État</th>
                  <th className="num">Recette</th>
                  <th>Facture</th>
                </tr>
              </thead>
              <tbody>
                {fiche.missions.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/voyages/${m.id}`} className="lien-fiche">
                        <b>{m.trajet}</b>
                      </Link>
                      <div className="t-sub">
                        {m.reference}
                        {m.vaChercher ? " · va chercher la marchandise" : m.aVide ? " · à vide" : ""}
                      </div>
                    </td>
                    <td className="muted">
                      {m.marchandises.length > 0
                        ? m.marchandises
                            .map((l) => `${l.designation} ${formatQuantite(l.quantiteACharger, l.symbole)}`)
                            .join(" · ")
                        : "—"}
                    </td>
                    <td className="muted">{formatDate(m.dateDepart)}</td>
                    <td>{LIBELLE_STATUT_VOYAGE[m.statut] ?? m.statut}</td>
                    <td className="num">{m.recetteGnf > 0 ? formatNombre(m.recetteGnf) : "—"}</td>
                    <td>
                      {m.facture ? (
                        <Link href="/factures" className="lien-fiche">
                          <span className={`badge ${BADGE_FACTURE[m.facture.statut] ?? "b-idle"}`}>
                            {m.facture.numero}
                          </span>
                        </Link>
                      ) : (
                        <SiPeut droit="facturation.ecrire" sinon={<span className="muted">—</span>}>
                          <Link href={`/factures?voyage=${m.id}&nouveau=1`} className="btn ghost sm">
                            Facturer
                          </Link>
                        </SiPeut>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel mb-5">
            <p className="vide-msg">Aucune mission pour ce client.</p>
          </div>
        )}

        {/* ---------- Factures ---------- */}
        <div className="head-row">
          <h3>
            Factures <span className="sec-sub">— {fiche.factures.length}</span>
          </h3>
        </div>

        {fiche.factures.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Émise le</th>
                  <th>Échéance</th>
                  <th className="num">Montant</th>
                  <th className="num">Réglé</th>
                  <th className="num">Reste</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {fiche.factures.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.numero}</td>
                    <td className="muted">{formatDate(f.dateEmission)}</td>
                    <td className="muted">{f.echeance ? formatDate(f.echeance) : "—"}</td>
                    <td className="num">{formatNombre(f.montantGnf)}</td>
                    <td className="num">{formatNombre(f.payeGnf)}</td>
                    <td className={`num ${f.resteGnf > 0 ? "neg" : "pos"}`}>
                      {formatNombre(f.resteGnf)}
                    </td>
                    <td>
                      <span className={`badge ${BADGE_FACTURE[f.statut] ?? "b-idle"}`}>{f.statut}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">Aucune facture pour ce client.</p>
          </div>
        )}

        <p className="note-bas">
          Encours total : <b>{formatGnf(fiche.encoursGnf)}</b>. Les marchandises livrées à ce
          client sur la mission d&apos;un autre apparaissent aussi ci-dessus.
        </p>
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
