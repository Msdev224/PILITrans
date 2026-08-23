"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Action de validation, précédée d'une confirmation.
 *
 * Les suppressions se protègent déjà d'un second clic. Ce qui manquait, ce
 * sont les actions qui *valident* : clore une réparation, faire avancer une
 * mission, renouveler une échéance, relancer un client par SMS. Elles ne
 * détruisent rien, donc elles n'avaient aucun garde-fou — mais elles partent
 * chez le client, changent un état visible par tous, et rien ne les annule.
 *
 * La confirmation dit ce qui va se passer, pas seulement « êtes-vous sûr ».
 */
export function BoutonConfirme({
  action,
  titre,
  detail,
  confirmer = "Confirmer",
  danger = false,
  declencheur,
}: {
  /** Action serveur déjà liée à son identifiant. */
  action: () => Promise<void>;
  titre: string;
  /** Ce que l'action va réellement faire, en une phrase. */
  detail?: string;
  confirmer?: string;
  danger?: boolean;
  declencheur: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>{declencheur}</DialogTrigger>
      <DialogContent className="modal max-w-[420px] gap-0 p-0">
        <DialogHeader className="modal-tete">
          <DialogTitle>{titre}</DialogTitle>
        </DialogHeader>

        <div className="modal-corps">
          {detail ? <p className="text-[12.5px] text-[var(--muted)]">{detail}</p> : null}
        </div>

        <footer className="modal-pied">
          <button type="button" className="btn ghost" onClick={() => setOuvert(false)}>
            Annuler
          </button>
          {/* La fermeture suit l'envoi : garder la fenêtre ouverte laisserait
              croire que rien ne s'est passé. */}
          <form
            action={async () => {
              await action();
              setOuvert(false);
            }}
          >
            <BoutonValider libelle={confirmer} danger={danger} />
          </form>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function BoutonValider({ libelle, danger }: { libelle: string; danger: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn ${danger ? "danger" : "primary"}`} disabled={pending}>
      {pending ? "En cours…" : libelle}
    </button>
  );
}
