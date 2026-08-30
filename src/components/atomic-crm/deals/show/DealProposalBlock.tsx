import { ExternalLink, FileText, PencilLine } from "lucide-react";
import { useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
 * Les contrats avaient déjà leur bloc. La proposition n'en avait aucun, alors
 * que c'est le premier document qui part chez le prospect.
 *
 * ## Ce que le bloc ne fait pas
 *
 * Il ne régénère pas. « Régénérer » écrase le document, et cette action reste
 * dans le menu d'en-tête avec sa confirmation : une action destructrice n'a
 * pas sa place à côté de deux liens de consultation, où elle serait cliquée
 * par erreur.
 */
export const DealProposalBlock = () => {
  const record = useRecordContext<Deal>();

  // Rien à montrer tant qu'aucune proposition n'a été générée. Le bouton
  // « Générer proposition » de l'en-tête dit déjà que la chose est possible ;
  // une carte vide ne ferait que répéter une absence.
  if (!record?.proposal_public_url) return null;

  return (
    <Card className="p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Proposition commerciale
      </span>

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
        </span>
      </div>
    </Card>
  );
};
