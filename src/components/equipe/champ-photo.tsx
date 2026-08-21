"use client";

import { useRef, useState } from "react";

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
export function ChampPhoto({ nom, valeur }: { nom: string; valeur?: string | null }) {
  const [apercu, setApercu] = useState<string | null>(valeur ?? null);
  const [erreur, setErreur] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErreur(null);

    if (!f.type.startsWith("image/")) {
      setErreur("Choisissez une image.");
      return;
    }

    try {
      setApercu(await reduire(f));
    } catch {
      setErreur("Image illisible. Essayez une autre photo.");
    }
  }

  return (
    <div className="photo-champ">
      {/* Valeur réellement soumise : l'image réduite, en data URI. */}
      <input type="hidden" name={nom} value={apercu ?? ""} />

      <div className="photo-apercu">
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apercu} alt="Photo du chauffeur" />
        ) : (
          <span>Aucune photo</span>
        )}
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

/** Recadre au centre en carré, réduit à `COTE`, et encode en JPEG. */
function reduire(f: File): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => rejeter(new Error("lecture"));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => rejeter(new Error("décodage"));
      img.onload = () => {
        const cote = Math.min(img.width, img.height);
        const toile = document.createElement("canvas");
        toile.width = COTE;
        toile.height = COTE;
        const ctx = toile.getContext("2d");
        if (!ctx) return rejeter(new Error("canvas"));

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
