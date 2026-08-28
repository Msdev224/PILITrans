"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { creerClient, modifierClient, type EtatClient } from "@/actions/clients";
import { ChampTelephone } from "@/components/champ-telephone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface ClientEditable {
  id: string;
  nom: string;
  telephone: string | null;
  ville: string | null;
  adresse: string | null;
  email: string | null;
  contact: string | null;
  telephoneContact: string | null;
  nif: string | null;
  whatsapp: boolean;
  whatsappNumero: string | null;
}

export function DialogueClient({ indicatifs, client, declencheur }: {
  client?: ClientEditable | null;
  /** Pays proposés pour les numéros, tenus dans l'écran Pays. */
  indicatifs: { code: string; libelle: string; longueur: number | null }[];
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp ?? false);
  const edition = !!client;

  const action = edition
    ? modifierClient.bind(null, client.id)
    : (creerClient as (e: EtatClient, d: FormData) => Promise<EtatClient>);
  const [etat, envoyer] = useActionState<EtatClient, FormData>(action, {});

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-w-[540px] gap-0 p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{edition ? `Modifier ${client.nom}` : "Ajouter un client"}</DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <div className="full">
                <Champ label="Nom / raison sociale" erreur={err("nom")}>
                  <input name="nom" required key={val("nom", client?.nom ?? "")} defaultValue={val("nom", client?.nom ?? "")} />
                </Champ>
              </div>

              <Champ label="Ville">
                <input name="ville" key={val("ville", client?.ville ?? "")} defaultValue={val("ville", client?.ville ?? "")} />
              </Champ>

              <Champ label="Téléphone" erreur={err("telephone")}>
                <ChampTelephone
                  indicatifs={indicatifs}
                  nom="telephone"
                  key={val("telephone", client?.telephone ?? "")}
                  valeur={val("telephone", client?.telephone ?? "")}
                />
              </Champ>

              {/* Le numéro de l'entreprise est souvent un standard ; celui qui
                  suit les livraisons a sa propre ligne. */}
              <Champ
                label="Téléphone du contact"
                erreur={err("telephoneContact")}
                aide="Si différent du numéro principal."
              >
                <ChampTelephone
                  indicatifs={indicatifs}
                  nom="telephoneContact"
                  key={val("telephoneContact", client?.telephoneContact ?? "")}
                  valeur={val("telephoneContact", client?.telephoneContact ?? "")}
                />
              </Champ>

              <Champ label="Personne de contact">
                <input name="contact" key={val("contact", client?.contact ?? "")} defaultValue={val("contact", client?.contact ?? "")} />
              </Champ>

              <Champ label="E-mail" erreur={err("email")}>
                <input name="email" type="email" key={val("email", client?.email ?? "")} defaultValue={val("email", client?.email ?? "")} />
              </Champ>

              <div className="full">
                <Champ label="Adresse">
                  <input name="adresse" key={val("adresse", client?.adresse ?? "")} defaultValue={val("adresse", client?.adresse ?? "")} />
                </Champ>
              </div>

              <Champ label="NIF" aide="Numéro d'identification fiscale, repris sur les factures.">
                <input name="nif" key={val("nif", client?.nif ?? "")} defaultValue={val("nif", client?.nif ?? "")} />
              </Champ>

              <div className="full">
                <label className="case">
                  <input
                    type="checkbox"
                    name="whatsapp"
                    defaultChecked={client?.whatsapp ?? false}
                    onChange={(e) => setWhatsapp(e.target.checked)}
                  />
                  <span>Joignable sur WhatsApp</span>
                </label>
              </div>

              {whatsapp ? (
                <div className="full">
                  <Champ
                    label="Numéro WhatsApp"
                    erreur={err("whatsappNumero")}
                    aide="À renseigner seulement si WhatsApp est sur une autre ligne que le téléphone principal."
                  >
                    <ChampTelephone
                  indicatifs={indicatifs}
                      nom="whatsappNumero"
                      key={val("whatsappNumero", client?.whatsappNumero ?? "")}
                      valeur={val("whatsappNumero", client?.whatsappNumero ?? "")}
                    />
                  </Champ>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="modal-pied">
            <button type="button" className="btn ghost" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <BoutonEnvoyer edition={edition} />
          </footer>
        </form>
      </DialogContent>
    </Dialog>
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

function BoutonEnvoyer({ edition }: { edition: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending}>
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Ajouter le client"}
    </button>
  );
}
