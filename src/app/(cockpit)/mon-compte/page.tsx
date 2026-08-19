import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { MonMotDePasse } from "@/components/mon-mot-de-passe";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { LIBELLE_ROLE, DESCRIPTION_ROLE } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatTelephone } from "@/lib/telephone";
import { n } from "@/lib/utils";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon compte — PILITrans" };

export default async function MonComptePage() {
  const session = await sessionRequise();
  const [compte, parametres, fil] = await Promise.all([
    prisma.utilisateur.findUnique({
      where: { id: session.user.id },
      select: { nom: true, telephone: true, email: true, role: true },
    }),
    prisma.parametres.findFirst(),
    filAlertes(),
  ]);

  return (
    <>
      <BarreHaut
        titre="Mon compte"
        sousTitre={compte ? LIBELLE_ROLE[compte.role] : ""}
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap">
        <div className="card panel mb-5">
          <h3>Identité</h3>
          <LigneInfo libelle="Nom" valeur={compte?.nom ?? "—"} />
          <LigneInfo libelle="Téléphone" valeur={formatTelephone(compte?.telephone)} mono />
          <LigneInfo libelle="E-mail" valeur={compte?.email ?? "—"} />
          <LigneInfo libelle="Rôle" valeur={compte ? LIBELLE_ROLE[compte.role] : "—"} />
          <p className="aide-role mt-2">
            {compte ? DESCRIPTION_ROLE[compte.role as Role] : ""}
          </p>
          <p className="note-bas">
            Nom, téléphone et rôle sont modifiés par le gérant depuis l&apos;écran Comptes.
          </p>
        </div>

        <div className="card panel">
          <h3>Mot de passe</h3>
          <p className="note-methode">
            Le mot de passe actuel est demandé : c&apos;est ce qui empêche quelqu&apos;un ayant
            trouvé une session ouverte de vous verrouiller hors de votre propre compte.
          </p>
          <MonMotDePasse />
        </div>
      </div>
    </>
  );
}

function LigneInfo({ libelle, valeur, mono }: { libelle: string; valeur: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--line-soft)] py-2 text-[12.5px] last:border-0">
      <span className="text-[var(--muted)]">{libelle}</span>
      <b className={mono ? "mono" : undefined}>{valeur}</b>
    </div>
  );
}
