import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { auteursDuJournal, journal, objetsDuJournal } from "@/lib/donnees/journal";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNombre, n } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historique" };

/** Nom lisible d'un type d'objet tracé. */
const LIBELLE_OBJET: Record<string, string> = {
  Facture: "Factures",
  MouvementCaisse: "Caisse",
  Depense: "Dépenses",
  Voyage: "Missions",
  Utilisateur: "Comptes",
  Chauffeur: "Chauffeurs",
};

interface Props {
  searchParams: Promise<{ objet?: string; auteur?: string; argent?: string }>;
}

export default async function HistoriquePage({ searchParams }: Props) {
  const { objet, auteur, argent } = await searchParams;

  const [session, parametres, fil, lignes, auteurs, objets] = await Promise.all([
    sessionRequise(),
    prisma.parametres.findFirst(),
    filAlertes(),
    journal({
      objet: objet || undefined,
      auteurId: auteur || undefined,
      argentSeulement: argent === "1",
    }),
    auteursDuJournal(),
    objetsDuJournal(),
  ]);

  const totalArgent = lignes.reduce((t, l) => t + (l.montantGnf != null ? n(l.montantGnf) : 0), 0);

  /** Conserve les autres filtres en changeant celui-ci. */
  const lien = (cle: string, valeur: string | null) => {
    const p = new URLSearchParams();
    if (objet && cle !== "objet") p.set("objet", objet);
    if (auteur && cle !== "auteur") p.set("auteur", auteur);
    if (argent && cle !== "argent") p.set("argent", argent);
    if (valeur) p.set(cle, valeur);
    const q = p.toString();
    return q ? `/historique?${q}` : "/historique";
  };

  return (
    <>
      <BarreHaut
        titre="Historique"
        sousTitre="Toutes les opérations, dans l'ordre où elles ont eu lieu"
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {/* ---------- Filtres ---------- */}
        <div className="searchbar">
          <div className="chips">
            <Link href={lien("objet", null)} className={`chip-f ${!objet ? "on" : ""}`}>
              Tout
            </Link>
            {objets.map((o) => (
              <Link key={o} href={lien("objet", o)} className={`chip-f ${objet === o ? "on" : ""}`}>
                {LIBELLE_OBJET[o] ?? o}
              </Link>
            ))}
            <Link href={lien("argent", argent === "1" ? null : "1")} className={`chip-f ${argent === "1" ? "on" : ""}`}>
              Mouvements d&apos;argent
            </Link>
          </div>
        </div>

        {auteurs.length > 1 ? (
          <div className="searchbar">
            <div className="chips">
              <Link href={lien("auteur", null)} className={`chip-f ${!auteur ? "on" : ""}`}>
                Tout le monde
              </Link>
              {auteurs.map((a) => (
                <Link
                  key={a.auteurId}
                  href={lien("auteur", a.auteurId)}
                  className={`chip-f ${auteur === a.auteurId ? "on" : ""}`}
                >
                  {a.auteurNom}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="head-row">
          <h3>
            Opérations{" "}
            <span className="sec-sub">
              — {lignes.length}
              {totalArgent > 0 ? ` · ${formatNombre(totalArgent)} GNF concernés` : ""}
            </span>
          </h3>
        </div>

        {lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Quand</th>
                  <th>Qui</th>
                  <th>Opération</th>
                  <th className="num">Montant</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td className="tel">
                      {formatDate(l.date)}
                      <div className="t-sub">
                        {l.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td>
                      <span className="t-title">{l.auteurNom}</span>
                      <div className="t-sub">{l.auteurRole.toLowerCase()}</div>
                    </td>
                    <td>
                      {l.libelle}
                      {/* Le détail avant/après n'a de sens que sur une
                          modification : on ne l'affiche que s'il existe. */}
                      {l.avant || l.apres ? (
                        <div className="t-sub">{resume(l.avant, l.apres)}</div>
                      ) : null}
                    </td>
                    <td className="num">
                      {l.montantGnf != null ? formatNombre(n(l.montantGnf)) : <span className="vide">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">
              Aucune opération enregistrée pour ce filtre. Le journal démarre à sa mise en service :
              les opérations antérieures n&apos;y figurent pas.
            </p>
          </div>
        )}

        <p className="mt-4 text-[11.5px] text-[var(--muted-2)]">
          Les 200 opérations les plus récentes sont affichées. Une ligne de journal ne peut être ni
          modifiée ni supprimée.
        </p>
      </div>
    </>
  );
}

/** Résumé lisible d'un avant/après, sans afficher tout l'objet. */
function resume(avant: unknown, apres: unknown): string {
  const a = (avant ?? {}) as Record<string, unknown>;
  const b = (apres ?? {}) as Record<string, unknown>;

  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return cles
    .map((cle) => {
      const ancien = a[cle];
      const nouveau = b[cle];
      if (ancien != null && nouveau != null && ancien !== nouveau) {
        return `${cle} : ${String(ancien)} → ${String(nouveau)}`;
      }
      return `${cle} : ${String(nouveau ?? ancien ?? "—")}`;
    })
    .join(" · ");
}
