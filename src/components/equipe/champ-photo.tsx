"use client";

import { useRef, useState } from "react";

import { obtenirSignature } from "@/actions/televersement";

/** Côté du carré final, en pixels. Suffisant pour reconnaître un visage. */
const COTE = 320;
/** Au-delà, on refuse : la photo part en base, elle doit rester légère. */
const POIDS_MAX = 400 * 1024;

/**
 * Photo d'identité du chauffeur.
 *
 * L'image est redimensionnée et recompressée **dans le navigateur** avant
 * d'être envoyée : une photo de téléphone pèse plusieurs mégaoctets, ce qui
 * n'a pas sa place dans une colonne de base de données. Après traitement il
 * reste quelques dizaines de kilo-octets.
 */
export function ChampPhoto({
  nom,
  valeur,
  forme = "carre",
  libelle = "Photo du chauffeur",
}: {
  nom: string;
  valeur?: string | null;
  /**
   * `carre` recadre au centre — un visage, un camion.
   * `libre` conserve les proportions : un logo recadré en carré serait amputé.
   */
  forme?: "carre" | "libre";
  libelle?: string;
}) {
  const [apercu, setApercu] = useState<string | null>(valeur ?? null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErreur(null);

    if (!f.type.startsWith("image/")) {
      setErreur("Choisissez une image.");
      return;
    }

    let reduite: string;
    try {
      reduite = await reduire(f, forme);
    } catch {
      setErreur("Image illisible. Essayez une autre photo.");
      return;
    }

    // L'aperçu s'affiche tout de suite : l'envoi peut durer sur un réseau lent.
    setApercu(reduite);

    /*
     * Téléversement vers Cloudinary, si l'exploitation l'a configuré.
     *
     * En cas d'échec — pas de clés, réseau coupé, service indisponible — on
     * garde l'image en base comme avant. Une photo est un confort : elle ne
     * doit jamais empêcher d'enregistrer une fiche chauffeur.
     */
    setEnvoi(true);
    try {
      const signature = await obtenirSignature();
      if (signature) {
        const url = await televerser(reduite, signature);
        if (url) setApercu(url);
      }
    } catch {
      // Silencieux : l'image reste en base, la fiche s'enregistre quand même.
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="photo-champ">
      {/* Valeur réellement soumise : l'image réduite, en data URI. */}
      <input type="hidden" name={nom} value={apercu ?? ""} />

      <div className={`photo-apercu ${forme === "libre" ? "libre" : ""}`}>
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apercu} alt={libelle} />
        ) : (
          <span>Aucune photo</span>
        )}
        {envoi ? <span className="photo-envoi">Envoi…</span> : null}
      </div>

      <div className="photo-actions">
        <input
          ref={fichier}
          type="file"
          accept="image/*"
          onChange={choisir}
          aria-label="Choisir une photo"
        />
        {apercu ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setApercu(null);
              if (fichier.current) fichier.current.value = "";
            }}
          >
            Retirer
          </button>
        ) : null}
      </div>

      {erreur ? <span className="text-[11.5px] text-[var(--neg)]">{erreur}</span> : null}
    </div>
  );
}

/**
 * Réduit l'image et l'encode en JPEG.
 *
 * En `carre`, on recadre au centre : c'est ce qu'on veut d'un portrait. En
 * `libre`, on conserve les proportions et on borne le plus grand côté — un
 * logo large recadré en carré perdrait la moitié de son nom.
 */
function reduire(f: File, forme: "carre" | "libre"): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => rejeter(new Error("lecture"));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => rejeter(new Error("décodage"));
      img.onload = () => {
        const toile = document.createElement("canvas");
        const ctx = toile.getContext("2d");
        if (!ctx) return rejeter(new Error("canvas"));

        if (forme === "libre") {
          const facteur = Math.min(1, COTE / Math.max(img.width, img.height));
          toile.width = Math.round(img.width * facteur);
          toile.height = Math.round(img.height * facteur);
          // Fond blanc : le JPEG ne gère pas la transparence, et un logo
          // transparent sortirait sur fond noir.
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, toile.width, toile.height);
          ctx.drawImage(img, 0, 0, toile.width, toile.height);
        } else {
          const cote = Math.min(img.width, img.height);
          toile.width = COTE;
          toile.height = COTE;
          ctx.drawImage(
            img,
            (img.width - cote) / 2,
            (img.height - cote) / 2,
            cote,
            cote,
            0,
            0,
            COTE,
            COTE,
          );
        }

        // On baisse la qualité tant que l'image dépasse le poids autorisé.
        let qualite = 0.8;
        let sortie = toile.toDataURL("image/jpeg", qualite);
        while (sortie.length > POIDS_MAX && qualite > 0.3) {
          qualite -= 0.15;
          sortie = toile.toDataURL("image/jpeg", qualite);
        }
        resoudre(sortie);
      };
      img.src = String(lecteur.result);
    };
    lecteur.readAsDataURL(f);
  });
}

/**
 * Envoie l'image à Cloudinary et rend son URL.
 *
 * L'appel part du navigateur vers Cloudinary directement : le fichier ne
 * traverse pas nos fonctions serveur, qui plafonnent la taille des requêtes.
 */
async function televerser(
  dataUri: string,
  s: { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string },
): Promise<string | null> {
  const corps = new FormData();
  corps.append("file", dataUri);
  corps.append("api_key", s.apiKey);
  corps.append("timestamp", String(s.timestamp));
  corps.append("folder", s.folder);
  corps.append("signature", s.signature);

  const reponse = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`, {
    method: "POST",
    body: corps,
    // Le réseau de bord est instable : mieux vaut renoncer que rester bloqué.
    signal: AbortSignal.timeout(30_000),
  });
  if (!reponse.ok) return null;

  const resultat = (await reponse.json()) as { secure_url?: string };
  return resultat.secure_url ?? null;
}
