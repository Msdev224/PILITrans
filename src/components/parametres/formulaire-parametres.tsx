"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { enregistrerParametres, type EtatParametres } from "@/actions/parametres";
import { ChampTelephone } from "@/components/champ-telephone";
import { ChampPhoto } from "@/components/equipe/champ-photo";
import { ACCUEIL_DEFAUT } from "@/lib/accueil-defaut";

export interface ParametresEditables {
  raisonSociale: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  nif: string | null;
  logoUrl: string | null;
  iconeUrl: string | null;
  orangeMoney: string | null;
  banque: string | null;
  compteBancaire: string | null;
  prefixeFacture: string;
  tvaTaux: number;
  delaiPaiementJours: number;
  conditionsPaiement: string | null;
  deviseBase: string;
  transportPersonnesActif: boolean;
  soldeCaisseInitial: number | null;
  dateSoldeInitial: string | null;
  tauxReferenceXof: number | null;
  consigneFroidDefaut: number | null;
  toleranceFroid: number | null;
  rappelEcheanceJours: number;
  seuilConsoAnormale: number | null;
  smsActif: boolean;
  whatsappActif: boolean;
  accueilSurtitre: string | null;
  accueilTitre: string | null;
  accueilTexte: string | null;
  accueilMention: string | null;
  connexionSousTitre: string | null;
  accueilAfficherDemo: boolean;
  afficherCodeLivraison: boolean;
  smsExpediteur: string | null;
  urlApplication: string | null;
  smsChauffeurAffectation: boolean;
  smsClientDepart: boolean;
  smsClientArrivee: boolean;
  smsClientLivraison: boolean;
  smsClientFacture: boolean;
  smsClientRelance: boolean;
}

export function FormulaireParametres({ indicatifs, parametres, identifiantsPresents, historique }: {
  parametres: ParametresEditables;
  /** Historique des taux observés, rendu côté serveur. */
  historique?: React.ReactNode;
  indicatifs: { code: string; libelle: string; longueur: number | null }[];
  /** Les clés API vivent dans l'environnement, pas en base. */
  identifiantsPresents: boolean;
}) {
  const [etat, envoyer] = useActionState<EtatParametres, FormData>(enregistrerParametres, {});
  const [smsActif, setSmsActif] = useState(parametres.smsActif);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string | number | null) =>
    etat.valeurs?.[champ] ?? (origine != null ? String(origine) : "");

  return (
    <form action={envoyer}>
      {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}
      {etat.ok ? (
        <div className="note mb-4">
          <span>Paramètres enregistrés. Ils s&apos;appliquent immédiatement aux factures et aux alertes.</span>
        </div>
      ) : null}

      <Section
        titre="Identité de l'entreprise"
        aide="Ces informations apparaissent en en-tête et en pied de chaque facture."
      >
        <div className="full">
          <Champ label="Raison sociale" erreur={err("raisonSociale")}>
            <input name="raisonSociale" required defaultValue={val("raisonSociale", parametres.raisonSociale)} />
          </Champ>
        </div>
        <div className="full">
          <Champ label="Adresse">
            <input name="adresse" defaultValue={val("adresse", parametres.adresse)} />
          </Champ>
        </div>
        <Champ label="Téléphone">
          <ChampTelephone indicatifs={indicatifs} nom="telephone" valeur={val("telephone", parametres.telephone)} />
        </Champ>
        <Champ label="E-mail" erreur={err("email")}>
          <input name="email" type="email" defaultValue={val("email", parametres.email)} />
        </Champ>
        <Champ label="RCCM">
          <input name="rccm" defaultValue={val("rccm", parametres.rccm)} />
        </Champ>
        <Champ label="NIF">
          <input name="nif" defaultValue={val("nif", parametres.nif)} />
        </Champ>
        <div className="full">
          {/* Le champ demandait une URL à coller, ce qui supposait d'avoir déjà
              hébergé l'image ailleurs. Personne ne l'a jamais rempli. */}
          <Champ
            label="Logo de l'entreprise"
            aide="Affiché en tête des factures et sur l'écran de connexion. Les proportions sont conservées."
          >
            <ChampPhoto
              nom="logoUrl"
              valeur={parametres.logoUrl}
              forme="libre"
              libelle="Logo de l'entreprise"
            />
          </Champ>
        </div>

        <div className="full">
          {/* Séparée du logo : un logo large lu à seize pixels dans un onglet
              ne se distingue plus. Une icône veut un monogramme. */}
          <Champ
            label="Icône de l'application"
            aide="Carrée. Utilisée dans l'onglet du navigateur et sur l'écran d'accueil des téléphones. Laissée vide, le logo est repris."
          >
            <ChampPhoto
              nom="iconeUrl"
              valeur={parametres.iconeUrl}
              libelle="Icône de l'application"
            />
          </Champ>
        </div>
      </Section>

      <Section titre="Coordonnées de paiement" aide="Reprises dans le bloc « Modalités de paiement » des factures.">
        <Champ label="Orange Money">
          <input name="orangeMoney" defaultValue={val("orangeMoney", parametres.orangeMoney)} />
        </Champ>
        <Champ label="Banque">
          <input name="banque" defaultValue={val("banque", parametres.banque)} />
        </Champ>
        <div className="full">
          <Champ label="Numéro de compte">
            <input name="compteBancaire" defaultValue={val("compteBancaire", parametres.compteBancaire)} />
          </Champ>
        </div>
      </Section>

      <Section titre="Facturation">
        <Champ label="Préfixe des numéros" erreur={err("prefixeFacture")} aide="Ex. « FAC » → FAC-2026-001.">
          <input name="prefixeFacture" required defaultValue={val("prefixeFacture", parametres.prefixeFacture)} />
        </Champ>
        <Champ label="TVA (%)" erreur={err("tvaTaux")} aide="0 = exonéré (transport international).">
          <input name="tvaTaux" inputMode="decimal" defaultValue={val("tvaTaux", parametres.tvaTaux)} />
        </Champ>
        <Champ
          label="Délai de paiement (jours)"
          erreur={err("delaiPaiementJours")}
          aide="Échéance proposée à la création d'une facture."
        >
          <input name="delaiPaiementJours" inputMode="numeric" defaultValue={val("delaiPaiementJours", parametres.delaiPaiementJours)} />
        </Champ>
        <div className="full">
          <Champ label="Conditions de paiement">
            <input name="conditionsPaiement" defaultValue={val("conditionsPaiement", parametres.conditionsPaiement)} />
          </Champ>
        </div>
      </Section>

      <Section
        titre="Modules"
        aide="Fonctionnalités ouvertes selon ce que l'exploitation possède réellement."
      >
        <div className="full">
          <label className="case">
            <input
              type="checkbox"
              name="transportPersonnesActif"
              value="true"
              defaultChecked={
                etat.valeurs
                  ? etat.valeurs.transportPersonnesActif === "true"
                  : parametres.transportPersonnesActif
              }
            />
            <span>Transport de personnes — autoriser les bus et les taxis</span>
          </label>
          <p className="aide-role">
            À cocher le jour où ces véhicules entrent dans la flotte. Ils deviendront
            enregistrables comme carrosseries. Attention : le suivi des passagers — places,
            billets, recette au voyageur — reste à construire. Le tonnage, l&apos;écart de
            livraison et la chaîne du froid n&apos;ont aucun sens pour eux.
          </p>
        </div>
      </Section>

      <Section
        titre="Caisse"
        aide="Argent déjà détenu au démarrage. Sans lui, la trésorerie partirait de zéro et afficherait un solde négatif dès la première dépense."
      >
        <Champ label="Solde d'ouverture (GNF)" erreur={err("soldeCaisseInitial")}>
          <input
            name="soldeCaisseInitial"
            inputMode="numeric"
            defaultValue={val("soldeCaisseInitial", parametres.soldeCaisseInitial)}
          />
        </Champ>
        <Champ label="Constaté le" erreur={err("dateSoldeInitial")}>
          <input
            type="date"
            name="dateSoldeInitial"
            defaultValue={val("dateSoldeInitial", parametres.dateSoldeInitial)}
          />
        </Champ>
      </Section>

      <Section
        titre="Devises"
        aide="Le taux GNF ⇄ CFA varie. Celui-ci ne sert qu'à pré-remplir les saisies : chaque transaction fige son propre équivalent en GNF."
      >
        <Champ label="Devise de base">
          <select name="deviseBase" defaultValue={val("deviseBase", parametres.deviseBase)}>
            <option value="GNF">GNF — franc guinéen</option>
            <option value="XOF">XOF — franc CFA</option>
          </select>
        </Champ>
        <Champ label="Taux de référence (GNF pour 1 CFA)">
          <input name="tauxReferenceXof" inputMode="decimal" defaultValue={val("tauxReferenceXof", parametres.tauxReferenceXof)} />
        </Champ>
        {/* Rendu côté serveur et passé en enfant : ce formulaire est un
            composant client, il ne peut pas interroger la base lui-même. */}
        <div className="full">{historique}</div>
      </Section>

      <Section titre="Chaîne du froid & seuils d'alerte">
        <Champ label="Consigne de froid par défaut (°C)" aide="Peut être négative — ex. −18 pour du surgelé.">
          <input name="consigneFroidDefaut" inputMode="text" defaultValue={val("consigneFroidDefaut", parametres.consigneFroidDefaut)} />
        </Champ>
        <Champ label="Tolérance (°C)" aide="Au-delà : alerte, puis rupture au double de l'écart.">
          <input name="toleranceFroid" inputMode="decimal" defaultValue={val("toleranceFroid", parametres.toleranceFroid)} />
        </Champ>
        <Champ
          label="Rappel d'échéance (jours)"
          erreur={err("rappelEcheanceJours")}
          aide="Délai avant expiration d'un document pour déclencher l'alerte."
        >
          <input name="rappelEcheanceJours" inputMode="numeric" defaultValue={val("rappelEcheanceJours", parametres.rappelEcheanceJours)} />
        </Champ>
        <Champ label="Seuil de conso anormale (L/100 km)" aide="Au-delà, une alerte carburant est levée.">
          <input name="seuilConsoAnormale" inputMode="decimal" defaultValue={val("seuilConsoAnormale", parametres.seuilConsoAnormale)} />
        </Champ>
      </Section>

      <Section
        titre="Notifications SMS"
        aide="Le chauffeur est prévenu de ses missions, le client suit sa marchandise étape par étape et reçoit le lien de sa facture. Envoi assuré par Nimba SMS."
      >
        <div className="full">
          {/* Sans identifiants, rien ne part : les messages restent en file. */}
          {!identifiantsPresents ? (
            <div className="note mb-3">
              <span>
                <b>Identifiants Nimba absents.</b> Les notifications sont préparées et mises en
                file d&apos;attente, mais aucune n&apos;est envoyée. Renseigne{" "}
                <code className="mono">NIMBA_SMS_SERVICE_ID</code> et{" "}
                <code className="mono">NIMBA_SMS_SECRET_TOKEN</code> dans le fichier{" "}
                <code className="mono">.env</code>, puis vide la file depuis le suivi ci-dessous.
              </span>
            </div>
          ) : null}

          <label className="mb-3 flex cursor-pointer items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              name="smsActif"
              value="true"
              checked={smsActif}
              onChange={(e) => setSmsActif(e.target.checked)}
            />
            <b>Activer les notifications SMS</b>
          </label>
        </div>

        <Champ
          label="Nom d'expéditeur"
          aide="11 caractères maximum, sans espace ni accent. Il doit correspondre EXACTEMENT à un nom validé chez Nimba, casse comprise — sinon tous les envois sont refusés."
        >
          {/* Volontairement pas `disabled` : un champ désactivé n'est pas envoyé,
          et enregistrer avec les SMS coupés effaçait le nom d'expéditeur. */}
      <input
            name="smsExpediteur"
            defaultValue={val("smsExpediteur", parametres.smsExpediteur)}
            placeholder="MSTRANS"
            maxLength={11}
            readOnly={!smsActif}
          />
        </Champ>

        <Champ
          label="URL publique de l'application"
          aide="Sert à composer le lien de facture envoyé au client."
        >
          <input name="urlApplication" defaultValue={val("urlApplication", parametres.urlApplication)} placeholder="https://mstrans.gn" readOnly={!smsActif} />
        </Champ>

        <div className="full mt-1 border-t border-[var(--line-soft)] pt-3">
          <p className="mb-2.5 text-[11.5px] text-[var(--muted)]">
            <b>Événements notifiés</b> — chacun s&apos;active séparément.
          </p>
          <div className="flex flex-col gap-2">
            <Bascule nom="smsChauffeurAffectation" actif={smsActif} defaut={parametres.smsChauffeurAffectation} etat={etat}>
              <b>Chauffeur</b> — nouvelle mission attribuée
            </Bascule>
            <Bascule nom="smsClientDepart" actif={smsActif} defaut={parametres.smsClientDepart} etat={etat}>
              <b>Client</b> — marchandise chargée, transport en cours
            </Bascule>
            <Bascule nom="smsClientArrivee" actif={smsActif} defaut={parametres.smsClientArrivee} etat={etat}>
              <b>Client</b> — arrivée à destination
            </Bascule>
            <Bascule nom="smsClientLivraison" actif={smsActif} defaut={parametres.smsClientLivraison} etat={etat}>
              <b>Client</b> — livraison effectuée
            </Bascule>
            <Bascule nom="smsClientFacture" actif={smsActif} defaut={parametres.smsClientFacture} etat={etat}>
              <b>Client</b> — facture émise, avec son lien
            </Bascule>
            <Bascule nom="smsClientRelance" actif={smsActif} defaut={parametres.smsClientRelance} etat={etat}>
              <b>Client</b> — relance d&apos;une facture échue{" "}
              <span className="text-[var(--muted-2)]">(déclenchée à la main)</span>
            </Bascule>
          </div>

          <div className="full mt-3 border-t border-[var(--line-soft)] pt-3">
            <label className={`case ${smsActif ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                name="whatsappActif"
                value="true"
                defaultChecked={
                  etat.valeurs ? etat.valeurs.whatsappActif === "true" : parametres.whatsappActif
                }
              />
              <span>Privilégier WhatsApp quand le destinataire y est joignable</span>
            </label>
            <p className="aide-role">
              Le message part sur WhatsApp si la fiche du client ou du chauffeur l&apos;indique, avec
              repli automatique sur SMS en cas d&apos;échec. Ce canal exige des gabarits validés par
              Meta, déclarés depuis votre tableau de bord Nimba : tant qu&apos;ils ne le sont pas,
              les messages restent en file avec ce motif.
            </p>
          </div>
        </div>
      </Section>

      <Section
        titre="Écran d'accueil"
        aide="Textes affichés sur la page de connexion. Laissés vides, les libellés d'origine s'affichent."
      >
        <div className="form-grid">
          <div className="full">
            <Champ label="Surtitre" erreur={err("accueilSurtitre")}>
              <input
                name="accueilSurtitre"
                defaultValue={val("accueilSurtitre", parametres.accueilSurtitre)}
                placeholder={ACCUEIL_DEFAUT.surtitre}
              />
            </Champ>
          </div>

          <div className="full">
            <Champ label="Accroche" erreur={err("accueilTitre")}>
              <input
                name="accueilTitre"
                defaultValue={val("accueilTitre", parametres.accueilTitre)}
                placeholder={ACCUEIL_DEFAUT.titre}
              />
            </Champ>
          </div>

          <div className="full">
            <Champ label="Texte de présentation" erreur={err("accueilTexte")}>
              <textarea
                name="accueilTexte"
                rows={3}
                defaultValue={val("accueilTexte", parametres.accueilTexte)}
                placeholder={ACCUEIL_DEFAUT.texte}
              />
            </Champ>
          </div>

          <Champ label="Mention (corridor desservi)" erreur={err("accueilMention")}>
            <input
              name="accueilMention"
              defaultValue={val("accueilMention", parametres.accueilMention)}
              placeholder={ACCUEIL_DEFAUT.mention}
            />
          </Champ>

          <Champ label="Sous-titre du formulaire" erreur={err("connexionSousTitre")}>
            <input
              name="connexionSousTitre"
              defaultValue={val("connexionSousTitre", parametres.connexionSousTitre)}
              placeholder={ACCUEIL_DEFAUT.sousTitre}
            />
          </Champ>

          <div className="full">
            <label className="case">
              <input
                type="checkbox"
                name="accueilAfficherDemo"
                value="true"
                defaultChecked={
                  etat.valeurs
                    ? etat.valeurs.accueilAfficherDemo === "true"
                    : parametres.accueilAfficherDemo
                }
              />
              <span>Afficher les identifiants de démonstration sur la page de connexion</span>
            </label>
            <p className="aide-role">
              À laisser décoché en exploitation réelle : cette page est accessible sans être
              connecté, et y publier des identifiants valides revient à laisser la porte ouverte.
            </p>
          </div>

          <div className="full">
            <label className="case">
              <input
                type="checkbox"
                name="afficherCodeLivraison"
                value="true"
                defaultChecked={
                  etat.valeurs
                    ? etat.valeurs.afficherCodeLivraison === "true"
                    : parametres.afficherCodeLivraison
                }
              />
              <span>Afficher le code de retrait sur la fiche mission (démonstration)</span>
            </label>
            <p className="aide-role">
              Permet de dérouler une livraison complète sans envoi de SMS réel : le code
              s&apos;affiche et se dicte au chauffeur. À décocher en exploitation réelle — ce code
              est la preuve que le client a bien reçu sa marchandise, et le voir permet de
              confirmer une livraison à sa place.
            </p>
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <BoutonEnregistrer />
      </div>
    </form>
  );
}

function Bascule({
  nom,
  actif,
  defaut,
  etat,
  children,
}: {
  nom: string;
  actif: boolean;
  defaut: boolean;
  etat: EtatParametres;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-[12.5px] ${actif ? "" : "opacity-50"}`}>
      {/*
        Pas de `disabled` ici. Un champ désactivé n'est pas soumis : couper les
        SMS puis enregistrer remettait à zéro les six déclencheurs, et l'on
        retrouvait tout éteint en les rallumant. L'opacité suffit à dire qu'ils
        sont sans effet tant que les SMS sont coupés.
      */}
      <input
        type="checkbox"
        name={nom}
        value="true"
        defaultChecked={etat.valeurs ? etat.valeurs[nom] === "true" : defaut}
      />
      {children}
    </label>
  );
}

function Section({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card panel">
      <h3>{titre}</h3>
      {aide ? <p className="mb-3.5 text-[11.5px] leading-relaxed text-[var(--muted)]">{aide}</p> : null}
      <div className="form-grid">{children}</div>
    </div>
  );
}

function Champ({
  label,
  erreur,
  aide,
  children,
}: {
  label: string;
  erreur?: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {aide ? <span className="text-[11px] text-[var(--muted-2)]">{aide}</span> : null}
      {erreur ? <span className="text-[11.5px] text-[var(--neg)]">{erreur}</span> : null}
    </div>
  );
}

function BoutonEnregistrer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Enregistrement…" : "Enregistrer les paramètres"}
    </button>
  );
}
