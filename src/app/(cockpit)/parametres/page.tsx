import { sessionRequise } from "@/auth";
import { BarreHaut } from "@/components/barre-haut";
import { IconeInfo } from "@/components/icones";
import {
  FormulaireParametres,
  type ParametresEditables,
} from "@/components/parametres/formulaire-parametres";
import { SuiviSms } from "@/components/parametres/suivi-sms";
import { smsConfigure } from "@/lib/sms/nimba";
import { compterParSeverite, alertes as filAlertes } from "@/lib/donnees/alertes";
import { indicatifsPays } from "@/lib/donnees/pays";
import { prisma } from "@/lib/prisma";
import { n, nOuNull } from "@/lib/utils";
import { HistoriqueTaux } from "@/components/parametres/historique-taux";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres — PILITrans" };

export default async function ParametresPage() {
  const [session, parametres, fil, notifications, enAttente, indicatifs] = await Promise.all([
    sessionRequise(),
    prisma.parametres.findFirst(),
    filAlertes(),
    prisma.notificationSms.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.notificationSms.count({ where: { statut: { in: ["EN_ATTENTE", "ECHEC"] } } }),
    indicatifsPays(),
  ]);

  // Première ouverture : la ligne de paramètres n'existe pas encore.
  const valeurs: ParametresEditables = {
    raisonSociale: parametres?.raisonSociale ?? "",
    adresse: parametres?.adresse ?? null,
    telephone: parametres?.telephone ?? null,
    email: parametres?.email ?? null,
    rccm: parametres?.rccm ?? null,
    nif: parametres?.nif ?? null,
    logoUrl: parametres?.logoUrl ?? null,
    orangeMoney: parametres?.orangeMoney ?? null,
    banque: parametres?.banque ?? null,
    compteBancaire: parametres?.compteBancaire ?? null,
    prefixeFacture: parametres?.prefixeFacture ?? "FAC",
    tvaTaux: nOuNull(parametres?.tvaTaux) ?? 0,
    delaiPaiementJours: parametres?.delaiPaiementJours ?? 14,
    conditionsPaiement: parametres?.conditionsPaiement ?? null,
    deviseBase: parametres?.deviseBase ?? "GNF",
    transportPersonnesActif: parametres?.transportPersonnesActif ?? false,
    soldeCaisseInitial: nOuNull(parametres?.soldeCaisseInitial) ?? null,
    dateSoldeInitial: parametres?.dateSoldeInitial
      ? parametres.dateSoldeInitial.toISOString().slice(0, 10)
      : null,
    tauxReferenceXof: nOuNull(parametres?.tauxReferenceXof) ?? null,
    consigneFroidDefaut: nOuNull(parametres?.consigneFroidDefaut) ?? null,
    toleranceFroid: nOuNull(parametres?.toleranceFroid) ?? null,
    rappelEcheanceJours: parametres?.rappelEcheanceJours ?? 30,
    seuilConsoAnormale: nOuNull(parametres?.seuilConsoAnormale) ?? null,
    smsActif: parametres?.smsActif ?? false,
    smsExpediteur: parametres?.smsExpediteur ?? null,
    urlApplication: parametres?.urlApplication ?? null,
    smsChauffeurAffectation: parametres?.smsChauffeurAffectation ?? true,
    smsClientDepart: parametres?.smsClientDepart ?? true,
    smsClientArrivee: parametres?.smsClientArrivee ?? true,
    smsClientLivraison: parametres?.smsClientLivraison ?? true,
    smsClientFacture: parametres?.smsClientFacture ?? true,
    smsClientRelance: parametres?.smsClientRelance ?? false,
    whatsappActif: parametres?.whatsappActif ?? false,
    accueilSurtitre: parametres?.accueilSurtitre ?? null,
    accueilTitre: parametres?.accueilTitre ?? null,
    accueilTexte: parametres?.accueilTexte ?? null,
    accueilMention: parametres?.accueilMention ?? null,
    connexionSousTitre: parametres?.connexionSousTitre ?? null,
    accueilAfficherDemo: parametres?.accueilAfficherDemo ?? false,
  };

  return (
    <>
      <BarreHaut
        titre="Paramètres"
        sousTitre="Configuration de la plateforme"
        nbAlertesUrgentes={compterParSeverite(fil).urgent}
        tauxReferenceXof={parametres?.tauxReferenceXof ? n(parametres.tauxReferenceXof) : null}
        utilisateur={session.user.name ?? "Utilisateur"}
      />

      <div className="wrap max-w-[880px]">
        <div className="note">
          <IconeInfo strokeWidth={2} />
          <span>
            Rien n&apos;est codé en dur : identité, seuils d&apos;alerte, consigne de froid et taux de
            référence sont lus ici par les factures, les alertes et les conversions.
          </span>
        </div>

        <FormulaireParametres
          indicatifs={indicatifs}
          historique={<HistoriqueTaux />} parametres={valeurs} identifiantsPresents={smsConfigure()} />

        <SuiviSms notifications={notifications} enAttente={enAttente} />
      </div>
    </>
  );
}
