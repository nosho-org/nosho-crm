import { useEffect, useState } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import {
  useCreate,
  useGetIdentity,
  useGetList,
  useGetOne,
  useNotify,
} from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Contract, Deal, Sale } from "../types";
import {
  CONTRACT_OFFER_PRESETS,
  CONTRACT_PRICE_UNITS,
  suggestOffer,
} from "./contractOffers";
import { buildSepaMandateReference } from "./contractPayload";

/**
 * ---------------------------------------------------------------------------
 * Éditer un contrat depuis une opportunité (NOS-1156)
 * ---------------------------------------------------------------------------
 * Reprend ce que le CRM sait — société, SIRET, TVA, adresse — et ne demande
 * que ce qu'il ne peut pas deviner.
 *
 * ## Ce qui n'est pas demandé, et pourquoi
 *
 * **Aucune date de fin.** L'article 7 du contrat cadre pose une période ferme
 * comptée depuis la mise en production, puis une tacite reconduction par
 * périodes de 12 mois. Demander une date de fin produirait un contrat qui se
 * contredit lui-même.
 *
 * **Aucune donnée Nosho** hors le signataire : raison sociale, capital, RCS,
 * adresse et ICS appartiennent au gabarit.
 *
 * **Forme juridique, capital, RCS et code APE** ne sont pas saisis non plus :
 * ils viennent de Pappers au moment de la génération. Ils changent sans que le
 * CRM en soit informé, et un contrat doit porter l'état du registre le jour où
 * il est édité.
 */

const KIND_LABELS: Record<string, string> = {
  poc: "Contrat POC",
  cadre: "Contrat cadre",
};

const euros = (cents: number | null) =>
  cents == null ? "" : String(cents / 100).replace(".", ",");

export const ContractDialog = ({
  deal,
  kind,
  open,
  onClose,
}: {
  deal: Deal;
  kind: "poc" | "cadre";
  open: boolean;
  onClose: () => void;
}) => {
  const { establishmentTypes } = useConfigurationContext();
  const { identity } = useGetIdentity();
  const [create, { isPending }] = useCreate();
  const notify = useNotify();

  const { data: company } = useGetOne<Company>(
    "companies",
    { id: deal.company_id },
    { enabled: deal.company_id != null && open },
  );

  // Les trois signataires possibles. `job_title` ne se saisit pas ici : c'est
  // un attribut de la personne, réglé une fois dans sa fiche.
  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  const [signatoryFirstName, setSignatoryFirstName] = useState("");
  const [signatoryLastName, setSignatoryLastName] = useState("");
  const [signatoryJobTitle, setSignatoryJobTitle] = useState("");
  const [signatoryEmail, setSignatoryEmail] = useState("");
  const [noshoSignatoryId, setNoshoSignatoryId] = useState<string>("");
  const [offerLabel, setOfferLabel] = useState("");
  const [offerDetail, setOfferDetail] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("confirmation");

  /*
   * Pré-remplissage à l'ouverture.
   *
   * Le signataire Nosho tombe sur l'utilisateur courant quand il fait partie
   * des personnes habilitées ; sinon rien, plutôt que de désigner quelqu'un
   * d'autre à sa place.
   */
  useEffect(() => {
    if (!open) return;
    const me = sales?.find((s) => String(s.id) === String(identity?.id));
    if (me && me.job_title) setNoshoSignatoryId(String(me.id));

    const typeLabel = establishmentTypes.find(
      (t) => t.value === company?.establishment_type,
    )?.label;
    const preset = suggestOffer(typeLabel);
    if (preset && !offerLabel) {
      setOfferLabel(preset.label);
      setOfferDetail(preset.detail);
      setUnitPrice(euros(preset.unitPriceCents));
      setPriceUnit(preset.unit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sales, company]);

  const applyPreset = (value: string) => {
    const preset = CONTRACT_OFFER_PRESETS.find((p) => p.value === value);
    if (!preset) return;
    setOfferLabel(preset.label);
    setOfferDetail(preset.detail);
    setUnitPrice(euros(preset.unitPriceCents));
    setPriceUnit(preset.unit);
  };

  const noshoSignatory = sales?.find((s) => String(s.id) === noshoSignatoryId);

  const handleSubmit = () => {
    // La virgule française autant que le point : personne ne tape « 0.25 » en
    // France, et refuser la virgule ferait saisir un prix faux.
    const parsed = Number(unitPrice.replace(",", "."));
    const cents =
      unitPrice.trim() && Number.isFinite(parsed)
        ? Math.round(parsed * 100)
        : null;

    const payload: Partial<Contract> = {
      deal_id: deal.id,
      company_id: deal.company_id ?? null,
      kind,
      signatory_first_name: signatoryFirstName.trim() || null,
      signatory_last_name: signatoryLastName.trim() || null,
      signatory_job_title: signatoryJobTitle.trim() || null,
      signatory_email: signatoryEmail.trim() || null,
      nosho_signatory_id: noshoSignatory?.id ?? null,
      // Figée à l'édition : si quelqu'un change de fonction ensuite, un
      // contrat déjà signé ne doit pas changer de sens rétroactivement.
      nosho_signatory_job_title: noshoSignatory?.job_title ?? null,
      offer_label: offerLabel.trim() || null,
      offer_detail: offerDetail.trim() || null,
      unit_price_cents: cents,
      price_unit: priceUnit || null,
      status: "draft",
      // Le POC est gratuit : rien à prélever, donc pas de mandat.
      sepa_mandate_reference:
        kind === "cadre"
          ? buildSepaMandateReference(Number(deal.id), new Date().getFullYear())
          : null,
    };

    create(
      "contracts",
      { data: payload },
      {
        onSuccess: () => {
          notify(`${KIND_LABELS[kind]} enregistré`, { type: "success" });
          onClose();
        },
        onError: (error) =>
          notify(
            `Enregistrement impossible : ${
              error instanceof Error ? error.message : String(error)
            }`,
            { type: "error" },
          ),
      },
    );
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder?: string,
    type = "text",
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-4 h-4" aria-hidden />
            {KIND_LABELS[kind]}
          </DialogTitle>
          <DialogDescription>
            Les informations connues sont reprises. Forme juridique, capital et
            RCS seront lus au registre à la génération.
          </DialogDescription>
        </DialogHeader>

        {/* Repris, non modifiable : corriger la société se fait sur sa fiche,
            pas au détour d'un contrat — sinon les deux divergent. */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Client
          </span>
          <span className="font-medium">{company?.name ?? "—"}</span>
          <span className="text-xs text-muted-foreground">
            {[
              company?.tax_identifier
                ? `SIRET ${company.tax_identifier}`
                : "SIRET manquant",
              company?.vat_number ? `TVA ${company.vat_number}` : null,
              [company?.zipcode, company?.city].filter(Boolean).join(" ") ||
                null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field(
            "Prénom du signataire",
            signatoryFirstName,
            setSignatoryFirstName,
          )}
          {field("Nom du signataire", signatoryLastName, setSignatoryLastName)}
          {field(
            "Fonction",
            signatoryJobTitle,
            setSignatoryJobTitle,
            "Directrice de la Transition Numérique",
          )}
          {/* L'e-mail n'est pas un confort : c'est l'adresse à laquelle part
              la demande de signature. */}
          {field(
            "E-mail du signataire",
            signatoryEmail,
            setSignatoryEmail,
            "prenom.nom@client.fr",
            "email",
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Signataire Nosho</Label>
          <Select value={noshoSignatoryId} onValueChange={setNoshoSignatoryId}>
            <SelectTrigger aria-label="Signataire Nosho">
              <SelectValue placeholder="Choisir" />
            </SelectTrigger>
            <SelectContent>
              {(sales ?? [])
                // Sans fonction renseignée, la personne ne peut pas figurer au
                // bloc signature : le contrat exige nom ET qualité.
                .filter((s) => !!s.job_title)
                .map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.first_name} {s.last_name} — {s.job_title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Offre de référence</Label>
            <Select onValueChange={applyPreset}>
              <SelectTrigger aria-label="Offre de référence">
                <SelectValue placeholder="Pré-remplir depuis la grille" />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_OFFER_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label} — {euros(preset.unitPriceCents)} € /{" "}
                    {preset.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {/* L'article 3 le dit : « le tarif contractuel est celui figurant
                  dans le tableau ci-dessus ». La grille pré-remplit, elle
                  n'engage pas. */}
              Grille indicative — l'intitulé et le prix restent modifiables.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field("Intitulé de l'offre", offerLabel, setOfferLabel)}
            <div className="grid grid-cols-2 gap-2">
              {field("Prix HT", unitPrice, setUnitPrice, "0,25")}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Unité</Label>
                <Select value={priceUnit} onValueChange={setPriceUnit}>
                  <SelectTrigger aria-label="Unité">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_PRICE_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {field("Détail de la prestation", offerDetail, setOfferDetail)}
        </div>

        {/* Ce que le contrat dit de la durée, rappelé plutôt que redemandé. */}
        <p className="text-xs text-muted-foreground">
          {kind === "cadre"
            ? "Période ferme de 12 mois à compter de la mise en production, puis tacite reconduction par périodes de 12 mois, préavis de 30 jours. Il n'y a pas de date de fin à saisir."
            : "Période d'essai gratuite de deux semaines, sans engagement ni facturation."}
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
