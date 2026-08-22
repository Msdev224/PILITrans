"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  creerUtilisateur,
  modifierUtilisateur,
  type EtatUtilisateur,
} from "@/actions/utilisateurs";
import { ChampTelephone } from "@/components/champ-telephone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DESCRIPTION_ROLE, LIBELLE_ROLE, ROLES_COCKPIT } from "@/lib/permissions";

export interface UtilisateurEditable {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  role: string;
  actif: boolean;
  chauffeurId: string | null;
}

export interface OptionChauffeur {
  id: string;
  nom: string;
}

export function DialogueUtilisateur({ indicatifs, utilisateur, chauffeurs, declencheur }: {
  utilisateur?: UtilisateurEditable | null;
  chauffeurs: OptionChauffeur[];
  /** Pays proposés pour les numéros, tenus dans l'écran Pays. */
  indicatifs: { code: string; libelle: string; longueur: number | null }[];
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const edition = !!utilisateur;

  const action = edition
    ? modifierUtilisateur.bind(null, utilisateur.id)
    : (creerUtilisateur as (e: EtatUtilisateur, d: FormData) => Promise<EtatUtilisateur>);
  const [etat, envoyer] = useActionState<EtatUtilisateur, FormData>(action, {});

  const err = (champ: string) => etat.champs?.[champ];
  const val = (champ: string, origine: string) => etat.valeurs?.[champ] ?? origine;

  const [role, setRole] = useState(utilisateur?.role ?? "EXPLOITANT");

  useEffect(() => {
    if (etat.ok) setOuvert(false);
  }, [etat.ok]);

  // Tous les rôles du cockpit, plus « chauffeur » qui se rattache à une fiche.
  const roles = [...ROLES_COCKPIT, "CHAUFFEUR" as const];

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-h-[90vh] max-w-[540px] gap-0 overflow-auto p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>
            {edition ? `Modifier ${utilisateur.nom}` : "Créer un compte"}
          </DialogTitle>
        </DialogHeader>

        <form action={envoyer}>
          <div className="modal-corps">
            {etat.erreur ? <div className="lg-error">{etat.erreur}</div> : null}

            <div className="form-grid">
              <div className="full">
                <Champ label="Nom complet" erreur={err("nom")}>
                  <input
                    name="nom"
                    required
                    key={val("nom", utilisateur?.nom ?? "")}
                    defaultValue={val("nom", utilisateur?.nom ?? "")}
                  />
                </Champ>
              </div>

              <div className="full">
                <Champ
                  label="Téléphone"
                  erreur={err("telephone")}
                  aide="C'est l'identifiant de connexion."
                >
                  <ChampTelephone
                  indicatifs={indicatifs}
                    nom="telephone"
                    requis
                    key={val("telephone", utilisateur?.telephone ?? "")}
                    valeur={val("telephone", utilisateur?.telephone ?? "")}
                  />
                </Champ>
              </div>

              <Champ label="E-mail" erreur={err("email")}>
                <input
                  name="email"
                  type="email"
                  key={val("email", utilisateur?.email ?? "")}
                  defaultValue={val("email", utilisateur?.email ?? "")}
                />
              </Champ>

              <Champ label="Rôle" erreur={err("role")}>
                <select
                  name="role"
                  key={role}
                  defaultValue={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {LIBELLE_ROLE[r]}
                    </option>
                  ))}
                </select>
              </Champ>

              <div className="full">
                <p className="aide-role">{DESCRIPTION_ROLE[role as keyof typeof DESCRIPTION_ROLE]}</p>
              </div>

              {/* Un compte chauffeur est l'accès d'une personne à SA fiche :
                  celle qui porte son permis, son mode de rémunération et ses
                  missions. La fiche existe donc d'abord, le compte ensuite. */}
              {role === "CHAUFFEUR" ? (
                <div className="full">
                  {chauffeurs.length === 0 ? (
                    <div className="lg-error">
                      Aucune fiche chauffeur disponible. Créez d&apos;abord la fiche depuis{" "}
                      <Link href="/chauffeurs" className="lien-fiche">
                        <b>Chauffeurs</b>
                      </Link>{" "}
                      — elle porte le permis, la rémunération et les missions. Vous pourrez
                      ensuite lui ouvrir un compte ici.
                      <div className="t-sub mt-1">
                        Cette liste ne montre que les fiches qui n&apos;ont pas encore de compte.
                      </div>
                    </div>
                  ) : (
                    <Champ
                      label="Fiche chauffeur rattachée"
                      erreur={err("chauffeurId")}
                      aide="Le compte ne verra que les missions de cette fiche."
                    >
                      <select
                        name="chauffeurId"
                        defaultValue={val("chauffeurId", utilisateur?.chauffeurId ?? "")}
                      >
                        <option value="">— Choisir —</option>
                        {chauffeurs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nom}
                          </option>
                        ))}
                      </select>
                    </Champ>
                  )}
                </div>
              ) : null}

              <div className="full">
                <Champ
                  label={edition ? "Nouveau mot de passe" : "Mot de passe"}
                  erreur={err("motDePasse")}
                  aide={
                    edition
                      ? "Laissez vide pour conserver le mot de passe actuel."
                      : "8 caractères minimum. À communiquer à la personne concernée."
                  }
                >
                  <input
                    name="motDePasse"
                    type="text"
                    autoComplete="new-password"
                    placeholder={edition ? "Inchangé" : ""}
                  />
                </Champ>
              </div>

              <div className="full">
                <label className="case">
                  <input
                    type="checkbox"
                    name="actif"
                    defaultChecked={utilisateur?.actif ?? true}
                  />
                  <span>Compte actif</span>
                </label>
              </div>
            </div>
          </div>

          <footer className="modal-pied">
            <button type="button" className="btn ghost" onClick={() => setOuvert(false)}>
              Annuler
            </button>
            {/* Sans fiche à rattacher, l'envoi ne peut que rater : mieux vaut
                bloquer le bouton que laisser buter sur un message d'erreur. */}
            <BoutonEnvoyer edition={edition} bloque={role === "CHAUFFEUR" && chauffeurs.length === 0} />
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

function BoutonEnvoyer({ edition, bloque }: { edition: boolean; bloque: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn primary"
      disabled={pending || bloque}
      title={bloque ? "Créez d'abord la fiche chauffeur" : undefined}
    >
      {pending ? "Enregistrement…" : edition ? "Enregistrer" : "Créer le compte"}
    </button>
  );
}
