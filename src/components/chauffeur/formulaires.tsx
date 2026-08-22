"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  ajouterRotation,
  avancerMission,
  confirmerChargement,
  confirmerLivraison,
  saisirDepense,
  signalerArret,
  type EtatChauffeur,
} from "@/actions/chauffeur";
import { declarerPrelevement, type EtatPrelevement } from "@/actions/douane";
import { confirmerParCode, type EtatLivraison } from "@/actions/livraison";
import { enregistrerReleve, type EtatReleve } from "@/actions/froid";
import { formatDecimal, formatNombre, LIBELLE_TYPE_DEPENSE } from "@/lib/utils";

const TYPES_GASOIL = ["GASOIL_TRACTEUR", "GASOIL_GROUPE_FROID"];

function Bouton({ libelle, enCours }: { libelle: string; enCours: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ph-btn" disabled={pending}>
      {pending ? enCours : libelle}
    </button>
  );
}

/** Bouton d'avancement de mission — une soumission = un cran. */
export function BoutonAvancer({ voyageId, libelle }: { voyageId: string; libelle: string }) {
  return (
    <form action={avancerMission.bind(null, voyageId)}>
      <Bouton libelle={libelle} enCours="Envoi…" />
    </form>
  );
}

/**
 * Relevé de température — uniquement sur un camion frigorifique.
 * Sans cet écran, la chaîne du froid ne pouvait jamais être alimentée par
 * l'application alors qu'elle est la preuve due au client.
 */
export function FormulaireReleve({
  voyageId,
  consigne,
  dernier,
}: {
  voyageId: string;
  consigne: number | null;
  dernier: { temperature: number; conformite: string; releveLe: string } | null;
}) {
  const [etat, envoyer] = useActionState<EtatReleve, FormData>(enregistrerReleve, {});
  const [temperature, setTemperature] = useState("");

  useEffect(() => {
    if (etat.ok) setTemperature("");
  }, [etat.ok]);

  const CLASSE = { CONFORME: "ph-ok", ALERTE: "ph-erreur", RUPTURE: "ph-erreur" } as const;

  return (
    <form action={envoyer}>
      <input type="hidden" name="voyageId" value={voyageId} />
      {consigne != null ? <input type="hidden" name="consigne" value={consigne} /> : null}

      {dernier ? (
        <p className={`ph-aide ${CLASSE[dernier.conformite as keyof typeof CLASSE] ?? ""}`}>
          Dernier relevé : <b>{formatDecimal(dernier.temperature)} °C</b>
          {dernier.conformite !== "CONFORME" ? ` — ${dernier.conformite.toLowerCase()}` : " — conforme"}
        </p>
      ) : null}

      <div className="ph-champ">
        <span>Température</span>
        <span className="flex items-center gap-1">
          {/* Le surgelé se relève en négatif : pas de champ numérique borné. */}
          <input
            name="temperature"
            inputMode="text"
            required
            placeholder={consigne != null ? String(consigne) : "2"}
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            aria-label="Température relevée en °C"
          />
          <b>°C</b>
        </span>
      </div>

      {consigne != null ? (
        <p className="ph-aide">
          Consigne : <b>{formatDecimal(consigne)} °C</b>. La conformité est calculée automatiquement.
        </p>
      ) : null}

      {etat.champs?.temperature ? <p className="ph-erreur">{etat.champs.temperature}</p> : null}
      {etat.erreur ? <p className="ph-erreur">{etat.erreur}</p> : null}
      {etat.ok ? <p className="ph-ok">Relevé enregistré.</p> : null}

      <Bouton libelle="Enregistrer le relevé" enCours="Envoi…" />
    </form>
  );
}

/**
 * Prélèvement de douane en nature.
 *
 * Ce que le poste retient sur la marchandise doit être déclaré : sans cela,
 * la différence entre chargé et livré serait imputée au chauffeur comme une
 * perte ou un vol.
 */
export function FormulairePrelevement({
  voyageId,
  marchandises,
  paysDefaut,
  pays,
}: {
  voyageId: string;
  marchandises: { id: string; designation: string; symbole: string; dejaPreleve: number }[];
  paysDefaut: string;
  /** Pays proposés, tenus par l'exploitation. */
  pays: { id: string; nom: string }[];
}) {
  const [etat, envoyer] = useActionState<EtatPrelevement, FormData>(declarerPrelevement, {});
  const [quantite, setQuantite] = useState("");
  const [ligneId, setLigneId] = useState(marchandises[0]?.id ?? "");

  const marchandise = marchandises.find((m) => m.id === ligneId);

  useEffect(() => {
    if (etat.ok) setQuantite("");
  }, [etat.ok]);

  return (
    <form action={envoyer}>
      <input type="hidden" name="voyageId" value={voyageId} />
      <input type="hidden" name="devise" value="GNF" />

      {/* Le poste retient sur une marchandise précise : sans cette
          désignation, le manquant serait imputé à la mauvaise ligne. */}
      <div className="ph-champ">
        <span>Marchandise</span>
        <select
          name="ligneId"
          value={ligneId}
          onChange={(e) => setLigneId(e.target.value)}
          className="ph-select-inline"
          aria-label="Marchandise prélevée"
        >
          {marchandises.map((m) => (
            <option key={m.id} value={m.id}>
              {m.designation}
            </option>
          ))}
        </select>
      </div>

      {marchandise && marchandise.dejaPreleve > 0 ? (
        <p className="ph-aide">
          Déjà déclaré sur cette marchandise :{" "}
          <b>{formatDecimal(marchandise.dejaPreleve)} {marchandise.symbole}</b>.
        </p>
      ) : null}

      <div className="ph-champ">
        <span>Quantité prélevée</span>
        <span className="flex items-center gap-1">
          <input
            name="quantite"
            inputMode="decimal"
            required
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            aria-label="Quantité prélevée"
          />
          <b>{marchandise?.symbole ?? ""}</b>
        </span>
      </div>

      <div className="ph-champ">
        <span>Lieu / poste</span>
        <input name="lieu" required aria-label="Lieu du prélèvement" />
      </div>

      <div className="ph-champ">
        <span>Pays</span>
        <select name="paysId" defaultValue={paysDefaut} className="ph-select-inline" aria-label="Pays">
          {pays.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="ph-champ">
        <span>Motif</span>
        <input name="motif" aria-label="Motif du prélèvement" />
      </div>

      <div className="ph-champ">
        <span>N° de reçu</span>
        <input name="reference" aria-label="Référence du reçu" />
      </div>

      {etat.champs?.quantite ? <p className="ph-erreur">{etat.champs.quantite}</p> : null}
      {etat.erreur ? <p className="ph-erreur">{etat.erreur}</p> : null}
      {etat.ok ? <p className="ph-ok">Prélèvement déclaré.</p> : null}

      <Bouton libelle="Déclarer le prélèvement" enCours="Envoi…" />
    </form>
  );
}

/**
 * Confirmation de livraison par le code du client.
 *
 * Le chauffeur ne voit jamais le code attendu : il saisit celui que le client
 * lui dicte à la remise. C'est ce qui distingue une livraison attestée d'une
 * quantité simplement déclarée.
 */
export function FormulaireCodeLivraison({
  ligneId,
  designation,
  confirme,
  codeEnvoye,
}: {
  ligneId: string;
  designation: string;
  confirme: boolean;
  codeEnvoye: boolean;
}) {
  const [etat, envoyer] = useActionState<EtatLivraison, FormData>(confirmerParCode, {});
  const [code, setCode] = useState("");

  useEffect(() => {
    if (etat.ok) setCode("");
  }, [etat.ok]);

  if (confirme) {
    // Le retour de l'action prime : il annonce la facture quand la livraison
    // du voyage vient d'être complétée. Sans cela, le message se perdait dès
    // que la page se rafraîchissait.
    return <p className="ph-ok">✓ {etat.message ?? "Livraison confirmée par le client."}</p>;
  }

  if (!codeEnvoye) {
    return (
      <p className="ph-aide">
        {designation} : le client n&apos;a pas encore reçu son code. Demande au gérant de le
        lui envoyer.
      </p>
    );
  }

  return (
    <form action={envoyer}>
      <input type="hidden" name="ligneId" value={ligneId} />
      <div className="ph-champ">
        <span>{designation}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="000000"
          value={code}
          // Le client dicte des chiffres : tout le reste est du bruit de frappe.
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-label={`Code de livraison — ${designation}`}
        />
      </div>

      {etat.champs?.code ? <p className="ph-erreur">{etat.champs.code}</p> : null}
      {etat.erreur ? <p className="ph-erreur">{etat.erreur}</p> : null}
      {etat.ok && etat.message ? <p className="ph-ok">{etat.message}</p> : null}

      <Bouton libelle="Confirmer la livraison" enCours="Vérification…" />
    </form>
  );
}

/** Compteur de rotations : un appui = un aller-retour de plus. */
export function BoutonRotation({
  voyageId,
  nbRotations,
  tarifRotation,
}: {
  voyageId: string;
  nbRotations: number;
  tarifRotation: number | null;
}) {
  return (
    <form action={ajouterRotation.bind(null, voyageId)}>
      <div className="ph-champ">
        <span>Rotations effectuées</span>
        <b className="mono text-[17px]">{nbRotations}</b>
      </div>
      {tarifRotation ? (
        <p className="ph-aide">
          Recette du jour : <b>{formatNombre(tarifRotation * nbRotations)} GNF</b> ({formatNombre(tarifRotation)} × {nbRotations})
        </p>
      ) : null}
      <Bouton libelle="+ 1 rotation" enCours="Envoi…" />
    </form>
  );
}

/** Chargement et livraison : deux saisies distinctes, l'écart fait l'alerte. */
export function FormulaireQuantite({
  voyageId,
  ligneId,
  designation,
  symbole,
  mode,
  valeurInitiale,
  prevu,
  recue,
}: {
  voyageId: string;
  ligneId: string;
  designation: string;
  symbole: string;
  mode: "chargement" | "livraison";
  valeurInitiale: number | null;
  prevu: number | null;
  recue: number | null;
}) {
  const action = mode === "chargement" ? confirmerChargement : confirmerLivraison;
  const [etat, envoyer] = useActionState<EtatChauffeur, FormData>(action, {});
  const [valeur, setValeur] = useState(valeurInitiale != null ? String(valeurInitiale) : "");

  useEffect(() => {
    if (etat.valeurs?.quantite) setValeur(etat.valeurs.quantite);
  }, [etat.valeurs]);

  const reference = mode === "chargement" ? prevu : recue;
  const libelleRef = mode === "chargement" ? "prévu au départ" : "reçu au chargement";

  return (
    <form action={envoyer}>
      <input type="hidden" name="voyageId" value={voyageId} />
      {/* Chaque marchandise se confirme séparément : sur un chargement mixte,
          un chiffre unique ne dirait pas de quoi il s'agit. */}
      <input type="hidden" name="ligneId" value={ligneId} />

      <div className="ph-champ">
        <span>{designation}</span>
        <span className="flex items-center gap-1">
          <input
            name="quantite"
            inputMode="decimal"
            required
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            aria-label={`${mode === "chargement" ? "Quantité reçue" : "Quantité livrée"} — ${designation}`}
          />
          <b>{symbole}</b>
        </span>
      </div>

      {reference != null ? (
        <p className="ph-aide">
          {libelleRef} : <b>{formatDecimal(reference)} {symbole}</b>
        </p>
      ) : null}
      {etat.champs?.quantite ? <p className="ph-erreur">{etat.champs.quantite}</p> : null}
      {etat.erreur && !etat.champs?.quantite ? <p className="ph-erreur">{etat.erreur}</p> : null}
      {etat.ok ? <p className="ph-ok">Enregistré.</p> : null}

      <Bouton
        libelle={mode === "chargement" ? "Confirmer le chargement" : "Confirmer la livraison"}
        enCours="Envoi…"
      />
    </form>
  );
}

/** Arrêt en route, ou changement de destination décidé sur la route. */
export function FormulaireArret({
  voyageId,
  villeActuelle,
}: {
  voyageId: string;
  villeActuelle: string;
}) {
  const [etat, envoyer] = useActionState<EtatChauffeur, FormData>(signalerArret, {});
  const [changement, setChangement] = useState(false);

  return (
    <form action={envoyer}>
      <input type="hidden" name="voyageId" value={voyageId} />
      <input type="hidden" name="villeDepart" value={villeActuelle} />

      <div className="ph-seg">
        <span className={changement ? "" : "on"} onClick={() => setChangement(false)}>
          Arrêt
        </span>
        <span className={changement ? "on" : ""} onClick={() => setChangement(true)}>
          Changer de destination
        </span>
      </div>
      <input type="hidden" name="changementDestination" value={changement ? "true" : "false"} />

      <div className="ph-champ">
        <span>{changement ? "Nouvelle destination" : "Lieu de l'arrêt"}</span>
        <input name="villeArrivee" required aria-label="Destination" />
      </div>
      <div className="ph-champ">
        <span>Motif</span>
        <input name="motif" aria-label="Motif" />
      </div>
      <div className="ph-champ">
        <span>Compteur (km)</span>
        <input name="kmDepart" inputMode="numeric" aria-label="Compteur en km" />
      </div>
      <div className="ph-champ">
        <span>Réservoir (L)</span>
        <input name="carburantRestantDepart" inputMode="decimal" aria-label="Carburant restant en litres" />
      </div>

      {etat.erreur ? <p className="ph-erreur">{etat.erreur}</p> : null}
      {etat.ok ? <p className="ph-ok">Signalé.</p> : null}

      <Bouton libelle={changement ? "Changer la destination" : "Signaler l'arrêt"} enCours="Envoi…" />
    </form>
  );
}

/** Dépense de terrain : montant, devise au taux réel, litres si carburant. */
export function FormulaireDepense({
  voyageId,
  tauxReferenceXof,
}: {
  voyageId: string;
  tauxReferenceXof: number | null;
}) {
  const [etat, envoyer] = useActionState<EtatChauffeur, FormData>(saisirDepense, {});
  const [type, setType] = useState("GASOIL_TRACTEUR");
  const [devise, setDevise] = useState<"GNF" | "XOF">("GNF");
  const [montant, setMontant] = useState("");
  const [montantGnf, setMontantGnf] = useState("");

  // Pré-remplissage au dernier taux connu ; le chauffeur corrige au taux réel.
  useEffect(() => {
    if (devise !== "XOF" || !tauxReferenceXof) return;
    const valeur = Number(montant.replace(",", "."));
    if (Number.isFinite(valeur) && valeur > 0) {
      setMontantGnf(String(Math.round(valeur * tauxReferenceXof)));
    }
  }, [devise, montant, tauxReferenceXof]);

  const estGasoil = TYPES_GASOIL.includes(type);

  return (
    <form action={envoyer}>
      <input type="hidden" name="voyageId" value={voyageId} />

      <div className="ph-seg">
        {["GASOIL_TRACTEUR", "GASOIL_GROUPE_FROID"].map((t) => (
          <span key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>
            {t === "GASOIL_TRACTEUR" ? "Gasoil tracteur" : "Groupe froid"}
          </span>
        ))}
      </div>
      <select
        name="type"
        key={type}
        defaultValue={type}
        onChange={(e) => setType(e.target.value)}
        className="ph-select"
        aria-label="Type de dépense"
      >
        {Object.keys(LIBELLE_TYPE_DEPENSE).map((t) => (
          <option key={t} value={t}>
            {LIBELLE_TYPE_DEPENSE[t]}
          </option>
        ))}
      </select>

      <div className="ph-seg">
        {(["GNF", "XOF"] as const).map((d) => (
          <span key={d} className={devise === d ? "on" : ""} onClick={() => setDevise(d)}>
            {d === "GNF" ? "GNF" : "CFA"}
          </span>
        ))}
      </div>
      <input type="hidden" name="devise" value={devise} />

      <div className="ph-champ">
        <span>Montant</span>
        <input
          name="montant"
          inputMode="decimal"
          required
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          aria-label="Montant"
        />
      </div>

      {devise === "XOF" ? (
        <>
          <div className="ph-champ">
            <span>Équivalent GNF</span>
            <input
              name="montantGnf"
              inputMode="numeric"
              value={montantGnf}
              onChange={(e) => setMontantGnf(e.target.value)}
              aria-label="Équivalent en GNF"
            />
          </div>
          <p className="ph-aide">
            {tauxReferenceXof
              ? `Pré-rempli au taux ${formatDecimal(tauxReferenceXof, 2)}. Corrige au taux réellement payé.`
              : "Saisir le montant réellement déboursé en GNF."}
          </p>
        </>
      ) : (
        <input type="hidden" name="montantGnf" value={montant} />
      )}

      {estGasoil ? (
        <>
          <div className="ph-champ">
            <span>Carburant</span>
            <span className="flex items-center gap-1">
              <input name="litres" inputMode="decimal" aria-label="Litres" />
              <b>L</b>
            </span>
          </div>
          <div className="ph-champ">
            <span>{type === "GASOIL_GROUPE_FROID" ? "Relevé horaire" : "Compteur (km)"}</span>
            <input name="releveCompteur" inputMode="numeric" aria-label="Relevé compteur" />
          </div>
        </>
      ) : null}

      <div className="ph-champ">
        <span>Description</span>
        <input name="description" aria-label="Description" />
      </div>

      <label className="ph-case">
        <input type="checkbox" name="surCaisse" value="true" defaultChecked />
        Payé sur ma caisse
      </label>

      {etat.champs?.litres ? <p className="ph-erreur">{etat.champs.litres}</p> : null}
      {etat.champs?.montantGnf ? <p className="ph-erreur">{etat.champs.montantGnf}</p> : null}
      {etat.erreur ? <p className="ph-erreur">{etat.erreur}</p> : null}
      {etat.ok ? <p className="ph-ok">Dépense enregistrée.</p> : null}

      <Bouton libelle="Enregistrer la dépense" enCours="Envoi…" />
    </form>
  );
}
