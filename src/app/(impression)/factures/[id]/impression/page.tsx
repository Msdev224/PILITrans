import { notFound } from "next/navigation";

import { sessionRequise } from "@/auth";
import { conformiteFroid } from "@/lib/calculs";
import { ficheFacture } from "@/lib/donnees/factures";
import { montantEnLettres } from "@/lib/lettres";
import { prisma } from "@/lib/prisma";
import { formatDecimal, formatNombre, n, nOuNull } from "@/lib/utils";

import { BoutonImprimer } from "./bouton-imprimer";
import { urlLogo } from "@/lib/images";
import { vueLignes } from "@/lib/donnees/marchandises";
import { formatQuantite } from "@/lib/donnees/unites";
import { NOM_APPLICATION } from "@/lib/marque";

export const dynamic = "force-dynamic";

const jjmmaaaa = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;

export default async function ImpressionFacturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await sessionRequise();

  const fiche = await ficheFacture(id);
  if (!fiche) notFound();

  const { ligne, parametres } = fiche;
  const { facture } = ligne;
  const voyage = facture.voyage;
  const marchandises = voyage ? vueLignes(voyage.lignes) : [];

  // Chaîne du froid : uniquement pour un camion frigorifique, et seulement si
  // des relevés existent — sinon on n'affiche aucune attestation.
  const releves = voyage?.camion.refrigere
    ? await prisma.releveTemperature.findMany({ where: { voyageId: voyage.id } })
    : [];
  const tolerance = nOuNull(parametres?.toleranceFroid) ?? 1;
  const conformes = releves.filter((r) => {
    const consigne = nOuNull(r.consigne);
    return consigne === undefined
      ? r.conformite === "CONFORME"
      : conformiteFroid(n(r.temperature), consigne, tolerance) === "CONFORME";
  });
  const froidConforme = releves.length > 0 && conformes.length === releves.length;
  const consigneFroid = releves.length > 0 ? nOuNull(releves[0].consigne) : undefined;

  const tva = nOuNull(parametres?.tvaTaux) ?? 0;
  const montantTva = Math.round((ligne.montantGnf * tva) / 100);
  const total = ligne.montantGnf + montantTva;

  // Équivalent CFA : direct si la facture est libellée en CFA, sinon converti
  // au taux de référence — c'est une indication, pas le montant dû.
  const tauxReference = nOuNull(parametres?.tauxReferenceXof);
  const equivalentCfa =
    facture.devise === "XOF"
      ? n(facture.montant)
      : tauxReference && tauxReference > 0
        ? Math.round(total / tauxReference)
        : null;

  const identite = [parametres?.rccm ? `RCCM : ${parametres.rccm}` : null, parametres?.nif ? `NIF : ${parametres.nif}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <BoutonImprimer />

      <div className="feuille">
        <div className="feuille-bande" />
        <div className="feuille-pad">
          {/* ---------- En-tête ---------- */}
          <div className="fac-head">
            <div>
              {/*
                Avec un logo, il porte seul l'identité.
                Le garder à côté de la raison sociale en gros la répétait — le
                logo la contient déjà — et la poussait sur deux lignes. Le nom
                complet reste juste en dessous, dans le bloc émetteur.
              */}
              <div className="fac-brand">
                {parametres?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urlLogo(parametres.logoUrl, 320) ?? parametres.logoUrl}
                    alt={parametres.raisonSociale ?? "Logo"}
                    className="fac-logo"
                  />
                ) : (
                  <>
                    <span className="dot" />
                    <div>
                      <h1>{parametres?.raisonSociale ?? NOM_APPLICATION}</h1>
                      <span>Transport frigorifique</span>
                    </div>
                  </>
                )}
              </div>
              <div className="fac-emet">
                <b>{parametres?.raisonSociale ?? NOM_APPLICATION}</b>
                <br />
                {parametres?.adresse ?? "Conakry, Guinée"}
                <br />
                {[parametres?.telephone, parametres?.email].filter(Boolean).join(" · ")}
                {identite ? (
                  <>
                    <br />
                    {identite}
                  </>
                ) : null}
              </div>
            </div>

            <div className="fac-doc">
              <h2 className="fac-titre">FACTURE</h2>
              <div className="fac-meta">
                <div>
                  <span className="k">N° facture</span>
                  <span className="v">{facture.numero}</span>
                </div>
                <div>
                  <span className="k">Date d&apos;émission</span>
                  <span className="v">{jjmmaaaa(facture.dateEmission)}</span>
                </div>
                {facture.echeance ? (
                  <div className="due">
                    <span className="k">Échéance</span>
                    <span className="v">{jjmmaaaa(facture.echeance)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* ---------- Parties ---------- */}
          <div className="fac-parties">
            <div>
              <div className="lab">Facturé à</div>
              <div className="nm">{facture.client.nom}</div>
              <div className="li">
                {[facture.client.adresse, facture.client.ville].filter(Boolean).join(", ")}
                {facture.client.telephone ? (
                  <>
                    <br />
                    Tél : {facture.client.telephone}
                  </>
                ) : null}
                {facture.client.contact ? (
                  <>
                    <br />
                    Contact : {facture.client.contact}
                  </>
                ) : null}
                {facture.client.nif ? (
                  <>
                    <br />
                    NIF : {facture.client.nif}
                  </>
                ) : null}
              </div>
            </div>

            <div className="text-right">
              <div className="lab">Référence</div>
              <div className="nm">{voyage ? `Voyage ${voyage.reference}` : facture.numero}</div>
              {voyage ? (
                <div className="li">
                  {voyage.dateArriveeDestination
                    ? `Livraison : ${jjmmaaaa(voyage.dateArriveeDestination)} · ${voyage.villeArrivee}`
                    : `Départ : ${jjmmaaaa(voyage.dateDepart)}`}
                </div>
              ) : null}
            </div>
          </div>

          {/* ---------- Bandeau voyage ---------- */}
          {voyage ? (
            <div className="fac-voyage">
              <Cellule
                libelle="Trajet"
                valeur={`${voyage.villeDepart} (${voyage.paysDepart?.code ?? ""}) → ${voyage.villeArrivee} (${voyage.paysArrivee?.code ?? ""})`}
                route
              />
              {/* Le client reconnaît sa marchandise par son nom, pas par un
                  décompte : « 2 articles » ne lui dit rien sur ce qu'il a
                  confié. Le détail chiffré suit dans le tableau. */}
              <Cellule
                libelle="Marchandise transportée"
                valeur={marchandises.length > 0 ? marchandises.map((m) => m.designation).join(" · ") : "—"}
              />
              <Cellule
                libelle="Camion"
                valeur={[voyage.camion.nom, voyage.camion.marqueGroupeFroid].filter(Boolean).join(" · ")}
              />
              <Cellule libelle="Chauffeur" valeur={voyage.chauffeur.nom} />
              <Cellule
                libelle="Départ → arrivée"
                valeur={`${jjmmaaaa(voyage.dateDepart)}${
                  voyage.dateArriveeDestination ? ` → ${jjmmaaaa(voyage.dateArriveeDestination)}` : ""
                }`}
              />
            </div>
          ) : null}

          {/* ---------- Prestation ---------- */}
          {/* La prestation facturée est le transport, pas la marchandise : le
              montant reste sur une seule ligne. Les marchandises transportées
              sont détaillées en dessous, avec leur unité — c'est ce que le
              client recoupe avec son bon de livraison. */}
          <table className="fac-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th className="r">Qté</th>
                <th className="r">Prix unitaire</th>
                <th className="r">Montant ({facture.devise === "XOF" ? "CFA" : "GNF"})</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="it-title">
                    {voyage
                      ? `Transport ${voyage.camion.refrigere ? "frigorifique" : "de marchandises"} — ${voyage.villeDepart} → ${voyage.villeArrivee}`
                      : "Prestation de transport"}
                  </div>
                  <div className="it-sub">
                    {voyage
                      ? `Prestation de transport ${
                          voyage.paysDepart !== voyage.paysArrivee ? "international" : "national"
                        }${voyage.camion.refrigere ? " sous température dirigée" : ""}, corridor ${voyage.villeDepart}–${voyage.villeArrivee}.`
                      : "Prestation facturée hors voyage."}
                  </div>
                </td>
                <td className="r">1</td>
                <td className="r">{formatNombre(n(facture.montant))}</td>
                <td className="r">{formatNombre(n(facture.montant))}</td>
              </tr>

              {/* Détail du chargement, article par article. Chaque marchandise
                  porte son unité : un total serait faux dès qu'elles diffèrent. */}
              {marchandises.map((m) => (
                <tr key={m.id} className="fac-detail">
                  <td>
                    <span className="it-puce">↳</span> {m.designation}
                    {m.client ? <span className="it-sub"> — {m.client}</span> : null}
                    {/* Une retenue de douane explique un manquant : sans elle
                        écrite sur la facture, le client la prendrait pour une
                        livraison incomplète. */}
                    {m.prelevementQuantite > 0 ? (
                      <div className="it-sub">
                        dont {formatQuantite(m.prelevementQuantite, m.symbole)} prélevés en douane
                      </div>
                    ) : null}
                  </td>
                  <td className="r">
                    {formatQuantite(m.quantiteLivree ?? m.quantiteACharger, m.symbole)}
                    {m.quantiteLivree == null && m.quantiteACharger != null ? (
                      <span className="it-sub"> (prévu)</span>
                    ) : null}
                  </td>
                  <td className="r" colSpan={2}>
                    {m.statutLivraison === "CONFORME" ? (
                      <span className="fac-livre">Livrée · conforme</span>
                    ) : m.statutLivraison === "NON_CONFORME" ? (
                      <span className="fac-ecart">
                        Livrée · écart de {formatQuantite(m.ecart?.manquant ?? 0, m.symbole)}
                      </span>
                    ) : (
                      <span className="it-sub">Livraison non confirmée</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---------- Paiement & totaux ---------- */}
          <div className="fac-bottom">
            <div className="fac-pay">
              <h4>Modalités de paiement</h4>
              <div className="line">
                {facture.echeance ? (
                  <>
                    <b>Échéance :</b> {jjmmaaaa(facture.echeance)} (net {parametres?.delaiPaiementJours ?? 14}{" "}
                    jours)
                    <br />
                  </>
                ) : null}
                {parametres?.orangeMoney ? (
                  <>
                    <b>Orange Money :</b> {parametres.orangeMoney}
                    <br />
                  </>
                ) : null}
                {parametres?.banque || parametres?.compteBancaire ? (
                  <>
                    <b>Virement :</b> {[parametres.banque, parametres.compteBancaire].filter(Boolean).join(" · ")}
                    <br />
                  </>
                ) : null}
                <b>Référence à rappeler :</b> {facture.numero}
              </div>

              {/* Payée ou non : la mention figure sur le document, pour que le
              client sache ce qu'il lui reste à régler sans avoir à comparer
              ses relevés. */}
          {ligne.resteGnf <= 0 ? (
            <div className="fac-cachet fac-cachet-paye">Facture réglée</div>
          ) : ligne.payeGnf > 0 ? (
            <div className="fac-cachet fac-cachet-partiel">
              Réglée partiellement — reste {formatNombre(ligne.resteGnf)} GNF
            </div>
          ) : (
            <div className="fac-cachet fac-cachet-impaye">
              Non réglée — {formatNombre(ligne.resteGnf)} GNF dus
            </div>
          )}

          {/* Règlements déjà reçus, avec leur moyen : le client doit
                  pouvoir rapprocher la facture de ses propres relevés. */}
              {facture.paiements && facture.paiements.length > 0 ? (
                <div className="fac-reglements">
                  <b>Règlements reçus</b>
                  {facture.paiements.map((p) => (
                    <div key={p.id} className="line">
                      {jjmmaaaa(p.date)} — {formatNombre(n(p.montantGnf))} GNF ·{" "}
                      {p.moyen?.nom ?? "moyen non précisé"}
                      {p.reference ? ` · réf. ${p.reference}` : ""}
                    </div>
                  ))}
                </div>
              ) : null}

              <h4 className="fac-conditions">Conditions</h4>
              <div className="line">
                {facture.tauxPenaliteRetard != null ? (
                  <>
                    Pénalité de retard : {formatDecimal(n(facture.tauxPenaliteRetard))} %/mois au-delà de
                    l&apos;échéance.
                    <br />
                  </>
                ) : null}
                {facture.marchandiseAssuree
                  ? "Marchandise assurée pendant le transport."
                  : "Marchandise non assurée par le transporteur."}
                {parametres?.conditionsPaiement ? (
                  <>
                    <br />
                    {parametres.conditionsPaiement}
                  </>
                ) : null}
              </div>
            </div>

            <div className="fac-totaux">
              <div className="r">
                <span>Sous-total</span>
                <span className="v">{formatNombre(ligne.montantGnf)}</span>
              </div>
              <div className="r">
                <span>TVA{tva === 0 ? " — transport international" : ` (${formatDecimal(tva)} %)`}</span>
                <span className="v">{tva === 0 ? "Exonéré" : formatNombre(montantTva)}</span>
              </div>
              {ligne.payeGnf > 0 ? (
                <div className="r">
                  <span>Déjà réglé</span>
                  <span className="v">−{formatNombre(ligne.payeGnf)}</span>
                </div>
              ) : null}

              <div className="fac-grand">
                <span className="lab">{ligne.payeGnf > 0 ? "Reste à payer" : "Total à payer"}</span>
                <span className="amt">
                  {formatNombre(ligne.payeGnf > 0 ? ligne.resteGnf : total)} GNF
                </span>
              </div>

              {/* Option portée par la facture elle-même. */}
              {facture.afficherEquivalentCfa && equivalentCfa ? (
                <div className="fac-cfa">
                  Équivalent ≈ <b>{formatNombre(equivalentCfa)} CFA</b>
                  {facture.devise === "GNF" && tauxReference
                    ? ` (taux ${formatDecimal(tauxReference, 2)})`
                    : ""}
                </div>
              ) : null}
            </div>
          </div>

          <div className="fac-lettres">
            Arrêtée la présente facture à la somme de :{" "}
            <b>{montantEnLettres(total, facture.devise === "XOF" ? "XOF" : "GNF")}</b>.
          </div>

          {/* Attestation de chaîne du froid — seulement si elle est vraie. */}
          {froidConforme ? (
            <div className="fac-froid">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M12 6l4-3M12 6L8 3M12 12l5-2.5M12 12L7 9.5M12 18l4 2.5M12 18l-4 2.5" />
              </svg>
              Chaîne du froid maintenue
              {consigneFroid !== undefined ? ` à ${formatDecimal(consigneFroid)} °C` : ""} sur
              l&apos;intégralité du trajet — {conformes.length} relevé
              {conformes.length > 1 ? "s" : ""} conforme{conformes.length > 1 ? "s" : ""}. Certificat
              disponible sur demande.
            </div>
          ) : null}

          <div className="fac-sign">
            <div className="stamp">
              <div className="rule" />
              Cachet &amp; signature — {parametres?.raisonSociale ?? NOM_APPLICATION}
            </div>
          </div>

          <div className="fac-foot">
            {[parametres?.raisonSociale, "Transport frigorifique", parametres?.adresse, identite]
              .filter(Boolean)
              .join(" · ")}
            <br />
            Merci de votre confiance.
            {parametres?.email ? ` Pour toute question relative à cette facture : ${parametres.email}` : ""}
          </div>
        </div>
      </div>
    </>
  );
}


function Cellule({ libelle, valeur, route }: { libelle: string; valeur: string; route?: boolean }) {
  return (
    <div className="cell">
      <div className="l">{libelle}</div>
      <div className={`val${route ? " route" : ""}`}>{valeur}</div>
    </div>
  );
}

export const metadata = { title: "Facture" };
