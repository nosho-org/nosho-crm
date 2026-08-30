import { useState } from "react";
import { ExternalLink, FileText, PencilLine, Trash2 } from "lucide-react";
import { useNotify, useRecordContext, useRefresh, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { formatDate } from "../../misc/formatDate";
import type { Deal } from "../../types";

/**
 * ---------------------------------------------------------------------------
 * La proposition, visible sur la page (NOS-1188)
 * ---------------------------------------------------------------------------
 * Simon : « sur la page de l'opportunité on n'a pas accès au document, on ne
 * le voit pas ».
 *
 * Il avait raison. La proposition n'existait qu'à travers un menu déroulant de
 * la barre d'actions, en haut à droite. Un document produit pour un client et
 * qui n'apparaît nulle part dans la fiche de ce client est un document qu'on
 * oublie d'envoyer — ou qu'on régénère sans savoir qu'il existait.
 *
 * ## Ce que le bloc ne fait pas
 *
 * Il ne régénère pas. « Régénérer » écrase le document, et cette action reste
 * dans le menu d'en-tête avec sa confirmation : une action destructrice n'a
 * pas sa place à côté de deux liens de consultation, où elle serait cliquée
 * par erreur.
 *
 * Il supprime en revanche — mais le mot est trompeur, et la confirmation le
 * dit : voir `SupprimerConfirmDialog`.
 */
export const DealProposalBlock = () => {
  const record = useRecordContext<Deal>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();

  // Rien à montrer tant qu'aucune proposition n'a été générée. Le bouton
  // « Générer proposition » de l'en-tête dit déjà que la chose est possible ;
  // une carte vide ne ferait que répéter une absence.
  if (!record?.proposal_public_url) return null;

  const detacher = () => {
    update(
      "deals",
      {
        id: record.id,
        data: {
          proposal_public_url: null,
          proposal_edit_url: null,
          proposal_generated_at: null,
        },
        previousData: record,
      },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          notify("Proposition retirée de l'opportunité", { type: "info" });
          refresh();
        },
        onError: () =>
          notify("Suppression impossible", { type: "error" }),
      },
    );
  };

  return (
    <>
      <Card className="p-4 flex flex-col gap-3">
        {/*
          Un vestige, et rien d autre (NOS-1198).

          La proposition commerciale n existe plus dans le CRM : chez Nosho le
          contrat POC EST l offre. Ce bloc ne subsiste que pour donner acces
          aux documents reellement envoyes a des prospects avant la
          suppression. Rien ne peut en produire de nouveaux.
        */}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ancienne proposition
        </span>
        <p className="text-xs text-muted-foreground -mt-1">
          Produite par doc.nosho.org, avant que le contrat POC ne devienne
          l'unique document commercial. Conservée pour référence : rien n'en
          génère de nouvelles. Supprimez-la et le bloc disparaît.
        </p>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2.5 min-w-0">
            <FileText
              className="w-4 h-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                Proposition — {record.name}
              </span>
              {/*
                La date, parce qu'une URL dit qu'un document existe mais pas
                depuis quand (NOS-1187). Les propositions anterieures a cette
                colonne n'en ont pas, et on ne l'invente pas : `updated_at`
                bouge a chaque correction de faute de frappe.
              */}
              <span className="block text-xs text-muted-foreground">
                {record.proposal_generated_at
                  ? `Généré le ${formatDate(record.proposal_generated_at)}`
                  : "Date de génération inconnue"}
              </span>
            </span>
          </span>

          <span className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm" variant="outline">
              <a
                href={record.proposal_public_url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                Ouvrir
              </a>
            </Button>
            {record.proposal_edit_url && (
              <Button asChild size="sm" variant="ghost">
                <a
                  href={record.proposal_edit_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <PencilLine className="w-3.5 h-3.5" aria-hidden />
                  Modifier
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
              aria-label="Supprimer la proposition"
              className="text-muted-foreground hover:text-[var(--deal-status-critical)]"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              Supprimer
            </Button>
          </span>
        </div>
      </Card>

      {confirmOpen && (
        <SupprimerConfirmDialog
          isPending={isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={detacher}
        />
      )}
    </>
  );
};

/**
 * La confirmation, et surtout ce qu'elle doit avouer.
 *
 * « Supprimer » est un mot trompeur ici. Le CRM ne stocke que deux URL : il
 * peut les oublier, il ne peut pas détruire le document, qui vit sur
 * `doc.nosho.org` et n'expose aucune API de suppression.
 *
 * Le dire n'est pas un détail juridique : quelqu'un qui supprime une
 * proposition envoyée à un prospect croit la rendre inaccessible. Elle reste
 * ouverte à quiconque a le lien. Taire ce point ferait de cette fenêtre un
 * mensonge par omission sur un document commercial.
 */
const SupprimerConfirmDialog = ({
  isPending,
  onCancel,
  onConfirm,
}: {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <Dialog open onOpenChange={(ouvert) => !ouvert && onCancel()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Supprimer la proposition ?</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-col gap-2">
            <span>
              L'opportunité oubliera ce document : les liens disparaîtront de
              cette page, et « Générer proposition » repartira de zéro.
            </span>
            <span className="text-[var(--deal-status-warning)]">
              Le document lui-même n'est pas détruit. Il reste sur
              doc.nosho.org, accessible à qui possède le lien — y compris le
              prospect, s'il l'a déjà reçu.
            </span>
          </div>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          Supprimer
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
