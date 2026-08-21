import Link from "next/link";

import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { ActionsClient } from "@/components/clients/actions-client";
import { DialogueClient, type ClientEditable } from "@/components/clients/dialogue-client";
import { IconePlus } from "@/components/icones";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { vueClients, type LigneClient } from "@/lib/donnees/clients";
import { prisma } from "@/lib/prisma";
import { formatNombre, n } from "@/lib/utils";
import { SiPeut } from "@/components/si-peut";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients — PILITrans" };

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function ClientsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const recherche = (q ?? "").trim().toLowerCase();

  const [session, toutes, parametres, fil] = await Promise.all([
    sessionRequise(),
    vueClients(),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  // Recherche : sert aussi de cible aux liens venant des factures.
  const lignes = recherche
    ? toutes.filter((l) => l.client.nom.toLowerCase().includes(recherche))
    : toutes;

  return (
    <>
      <BarreHaut
        titre="Clients"
        sousTitre={`${lignes.length} client${lignes.length > 1 ? "s" : ""} enregistré${lignes.length > 1 ? "s" : ""}`}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        {recherche ? (
          <div className="searchbar">
            <div className="chips">
              <Link href="/clients" className="chip-f on">
                « {q} » — tout afficher
              </Link>
            </div>
          </div>
        ) : null}

        <div className="head-row">
          <h3>Clients</h3>
          <SiPeut droit="clients.ecrire">
            <DialogueClient
              declencheur={
                <button type="button" className="btn-add">
                  <IconePlus />
                  Ajouter un client
                </button>
              }
            />
          </SiPeut>
        </div>

        {lignes.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Ville</th>
                  <th>Contact</th>
                  <th className="num">Voyages</th>
                  <th className="num">Encours</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => (
                  <LigneTableau key={ligne.client.id} ligne={ligne} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card panel">
            <p className="vide-msg">Aucun client enregistré.</p>
          </div>
        )}
      </div>
    </>
  );
}

function LigneTableau({ ligne }: { ligne: LigneClient }) {
  const { client } = ligne;

  return (
    <tr>
      <td>
        {/* Le nom mène à la fiche : missions, factures et encours du client. */}
        <Link href={`/clients/${client.id}`} className="lien-fiche">
          <span className="t-title">{client.nom}</span>
        </Link>
        {client.nif ? <div className="t-sub">NIF {client.nif}</div> : null}
      </td>
      <td>{client.ville ?? <span className="text-[var(--muted-2)]">—</span>}</td>
      <td className="tel">
        {client.telephone ?? <span className="text-[var(--muted-2)]">—</span>}
        {client.contact ? <div className="t-sub">{client.contact}</div> : null}
      </td>
      <td className="num">{ligne.nbVoyages}</td>
      {/* Un encours en retard se lit d'un coup d'œil. */}
      <td className={`num ${ligne.enRetardGnf > 0 ? "neg" : ligne.encoursGnf > 0 ? "" : "vide"}`}>
        {ligne.encoursGnf > 0 ? formatNombre(ligne.encoursGnf) : "0"}
        {ligne.enRetardGnf > 0 ? (
          <div className="t-sub text-[var(--neg)]">dont {formatNombre(ligne.enRetardGnf)} en retard</div>
        ) : null}
      </td>
      <td>
        <ActionsClient client={aplatir(client)} aDesFactures={ligne.nbFactures > 0} />
      </td>
    </tr>
  );
}

function aplatir(client: LigneClient["client"]): ClientEditable {
  return {
    id: client.id,
    nom: client.nom,
    telephone: client.telephone,
    ville: client.ville,
    adresse: client.adresse,
    email: client.email,
    contact: client.contact,
    nif: client.nif,
    whatsapp: client.whatsapp,
    whatsappNumero: client.whatsappNumero,
  };
}
