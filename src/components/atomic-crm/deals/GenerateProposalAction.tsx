import { useMemo, useState } from "react";
import { useGetMany, useNotify, useRecordContext } from "ra-core";
import { ChevronDown, ExternalLink, FileText, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "../misc/formatDate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Contact, Deal } from "../types";
import {
  GenerateProposalError,
  useGenerateProposal,
} from "./useGenerateProposal";

const ERROR_MESSAGES: Record<string, string> = {
  nosho_api_key_invalid: "Clé API invalide. Contactez l'administrateur.",
  nosho_timeout: "Le service est indisponible, réessayez plus tard.",
  nosho_unreachable: "Le service est indisponible, réessayez plus tard.",
  nosho_error: "Le service a renvoyé une erreur. Réessayez plus tard.",
  nosho_invalid_response: "Réponse inattendue du service. Réessayez.",
  contact_not_in_deal: "Ce contact n'est pas lié à l'opportunité.",
  deal_has_no_company: "Cette opportunité n'est liée à aucune société.",
  deal_not_found: "Opportunité introuvable.",
  company_not_found: "Société introuvable.",
  invalid_deal_id: "Opportunité invalide.",
  invalid_json: "Requête invalide.",
  internal_error: "Erreur interne. Réessayez plus tard.",
};

function errorToMessage(err: GenerateProposalError): string {
  if (err.code === "invalid_payload") {
    const first = err.issues[0]?.message;
    return first ? `Données invalides : ${first}` : "Données invalides.";
  }
  return (
    ERROR_MESSAGES[err.code] ??
    "Impossible de générer la proposition. Réessayez."
  );
}

export const GenerateProposalAction = ({
  variant = "outline",
}: {
  /** `default` quand c'est l'action principale de l'étape (NOS-1172). */
  variant?: "outline" | "default";
} = {}) => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  if (record.proposal_public_url) {
    return <ProposalUrlsDisplay deal={record} />;
  }
  return <GenerateProposalTrigger deal={record} variant={variant} />;
};

const GenerateProposalTrigger = ({
  deal,
  variant = "outline",
}: {
  deal: Deal;
  variant?: "outline" | "default";
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant={variant}
        className="flex items-center gap-2 h-9"
      >
        <FileText className="w-4 h-4" />
        Générer proposition
      </Button>
      {open && (
        <GenerateProposalDialog
          deal={deal}
          force={false}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

const ProposalUrlsDisplay = ({ deal }: { deal: Deal }) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {/*
        ---------------------------------------------------------------------
        Un seul bouton « Proposition », comme « Éditer un contrat » (NOS-1178)
        ---------------------------------------------------------------------
        Trois boutons côte à côte pour un même document — éditer, version
        client, régénérer — et l'un d'eux se lisait comme le jumeau d'« Éditer
        un contrat ». La confusion a été signalée deux fois.

        Ce ne sont pourtant PAS le même document. La **proposition** est un
        document d'avant-vente : elle chiffre une offre pour convaincre. Le
        **contrat** est l'engagement qu'on signe ensuite. Supprimer la
        proposition supprimerait l'étape qui précède la signature.

        La correction n'est donc pas de retirer, c'est de rendre la distinction
        visible : deux menus parallèles, « Proposition » et « Éditer un
        contrat », un par document. Deux objets, deux boutons, plus aucune
        raison de croire qu'ils font la même chose.
      */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="h-9">
            <FileText className="w-4 h-4" aria-hidden />
            Proposition
            <ChevronDown className="w-3.5 h-3.5 opacity-50" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/*
            Ce que le menu taisait : qu un document existe deja, et depuis
            quand (NOS-1187). Sans cet en-tete, trois entrees apparaissent
            sans contexte, et "Regenerer -- ecrase le document" se lit comme
            une menace sur un document fantome.
          */}
          <div className="px-2 py-1.5 border-b mb-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Document existant
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {deal.proposal_generated_at
                ? `Généré le ${formatDate(deal.proposal_generated_at)}`
                : "Date de génération inconnue"}
            </span>
          </div>
          <DropdownMenuItem asChild>
            <a
              href={deal.proposal_public_url ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
              Version client
              <span className="ml-2 text-xs text-muted-foreground">
                ce que le client voit
              </span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={deal.proposal_edit_url ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="w-4 h-4" aria-hidden />
              Modifier le document
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <RotateCw className="w-4 h-4" aria-hidden />
            Régénérer
            <span className="ml-2 text-xs text-muted-foreground">
              écrase le document
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmOpen && (
        <RegenerateConfirmDialog
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            setRegenOpen(true);
          }}
        />
      )}
      {regenOpen && (
        <GenerateProposalDialog
          deal={deal}
          force={true}
          onClose={() => setRegenOpen(false)}
        />
      )}
    </div>
  );
};

const GenerateProposalDialog = ({
  deal,
  force,
  onClose,
}: {
  deal: Deal;
  force: boolean;
  onClose: () => void;
}) => {
  const contactIds = useMemo(
    () => (Array.isArray(deal.contact_ids) ? deal.contact_ids : []),
    [deal.contact_ids],
  );
  const { data: contacts } = useGetMany<Contact>(
    "contacts",
    { ids: contactIds },
    { enabled: contactIds.length > 0 },
  );
  const [selectedContactId, setSelectedContactId] = useState<string>(
    contactIds[0] !== undefined ? String(contactIds[0]) : "",
  );
  const mutation = useGenerateProposal();
  const notify = useNotify();

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync({
        dealId: Number(deal.id),
        contactId: selectedContactId ? Number(selectedContactId) : null,
        force,
      });
      notify("Proposition générée", { type: "success" });
      onClose();
    } catch (e) {
      const msg =
        e instanceof GenerateProposalError
          ? errorToMessage(e)
          : "Impossible de générer la proposition. Réessayez.";
      notify(msg, { type: "error" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {force
              ? "Régénérer la proposition"
              : "Générer une proposition commerciale"}
          </DialogTitle>
          {contactIds.length === 0 && (
            <DialogDescription>
              Aucun contact lié à l'opportunité. Le document sera généré sans
              nom de contact.
            </DialogDescription>
          )}
        </DialogHeader>
        {contactIds.length > 0 && (
          <div className="py-2">
            <label className="text-sm font-medium mb-2 block">
              Contact destinataire
            </label>
            <Select
              value={selectedContactId}
              onValueChange={setSelectedContactId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contacts?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Génération..." : "Générer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RegenerateConfirmDialog = ({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <Dialog open onOpenChange={(o) => !o && onCancel()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Régénérer la proposition ?</DialogTitle>
        <DialogDescription>
          Les liens existants seront écrasés et ne seront plus accessibles.
          Cette action est irréversible.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Régénérer
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
