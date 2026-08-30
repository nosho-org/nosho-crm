import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileSignature,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useCreate,
  useGetIdentity,
  useGetList,
  useGetOne,
  useNotify,
  useUpdate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import { getSupabaseClient } from "../providers/supabase/supabase";
import type { Company, Contract, ContractService, Deal, Sale } from "../types";
import {
  CONTRACT_PRICE_UNITS,
  CONTRACT_SERVICES,
  weeksBetween,
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
 * **Aucune date de fin sur le contrat cadre.** L'article 7 pose une période
 * ferme comptée depuis la mise en production, puis une tacite reconduction par
 * périodes de 12 mois. Demander une date de fin produirait un contrat qui se
 * contredit lui-même. Le POC, lui, en a une — d'où le bloc « Période d'essai »
 * qui n'apparaît que pour lui.
 *
 * **Aucune durée en semaines.** Elle se déduit des deux dates. La demander en
 * plus les doublait, et ouvrait la porte à ce qu'elles se contredisent.
 *
 * ## Ce qui bloque l'enregistrement
 *
 * **SIRET et adresse de la société.** Le bloc « parties » les écrit dans une
 * phrase — « immatriculée au RCS de … sous le numéro … (SIRET du siège : …),
 * dont l'établissement est situé …, … … » — qui part chez le client avec ses
 * trous si on la laisse passer. C'est exactement ce qui est arrivé au contrat
 * HEM, dont la page 3 porte encore `[SIREN / FINESS HEM]`. Ni l'un ni l'autre
 * ne se saisit ici : ils appartiennent à la fiche société, et les recopier
 * dans le contrat ferait diverger les deux dès la première correction.
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

const euros = (cents: number | null | undefined) =>
  cents == null ? "" : String(cents / 100).replace(".", ",");

/**
 * La virgule française autant que le point : personne ne tape « 0.25 » en
 * France, et refuser la virgule ferait saisir un prix faux.
 */
const toCents = (value: string): number | null => {
  const parsed = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(parsed)
    ? Math.round(parsed * 100)
    : null;
};

/** Une ligne en cours de saisie. Les prix y restent du texte jusqu'au submit. */
type ServiceRow = {
  service: string;
  label: string;
  price: string;
  unit: string;
  comment: string;
};

const emptyRow = (): ServiceRow => ({
  service: CONTRACT_SERVICES[0].value,
  label: CONTRACT_SERVICES[0].label,
  price: "",
  unit: CONTRACT_SERVICES[0].defaultUnit,
  comment: "",
});

export const ContractDialog = ({
  deal,
  kind,
  contract,
  open,
  onClose,
}: {
  deal: Deal;
  kind: "poc" | "cadre";
  /** Présent = édition d'un contrat existant ; absent = création. */
  contract?: Contract;
  open: boolean;
  onClose: () => void;
}) => {
  const { identity } = useGetIdentity();
  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const isPending = isCreating || isUpdating;
  const notify = useNotify();

  const { data: company, refetch: refetchCompany } = useGetOne<Company>(
    "companies",
    { id: deal.company_id },
    { enabled: deal.company_id != null && open },
  );
  const [updateCompany] = useUpdate();
  const [filling, setFilling] = useState(false);

  /*
   * Ce que le contrat exige de la société, et qu'aucune saisie de cette
   * fenêtre ne peut remplacer.
   *
   * Le bloc « parties » écrit « immatriculée au RCS de … sous le numéro …
   * (SIRET du siège : …), dont l'établissement est situé …, … … ». Sans SIRET
   * ni adresse, ces phrases partent chez le client avec des trous — ce qui est
   * exactement arrivé au contrat HEM, dont la page 3 porte encore
   * `[SIREN / FINESS HEM]`.
   */
  const siret = (company?.tax_identifier ?? "").replace(/\D/g, "");
  const siren = siret.slice(0, 9);
  const hasAddress = !!(company?.address && company?.zipcode && company?.city);
  const missing = !siret || !hasAddress;

  /*
   * L'identité légale, qui ouvre le contrat (NOS-1190).
   *
   * « La société X, [FORME] au capital de [CAPITAL] EUR, immatriculée au RCS
   * de [VILLE], code APE [APE] ». Ces quatre valeurs bloquent la génération si
   * elles manquent — mais elles ne bloquent PAS l'enregistrement : on doit
   * pouvoir saisir un contrat le temps que le registre réponde.
   *
   * Le bouton de reprise au registre était jusqu'ici réservé au cas « adresse
   * manquante ». Une société complète en adresse mais sans forme juridique
   * laissait donc l'utilisateur sans aucun moyen de la remplir, face à un
   * message de génération qui le renvoyait vers un bouton invisible.
   */
  const legalIncomplete =
    !!company &&
    (!company.legal_form ||
      !company.share_capital ||
      !company.rcs_city ||
      !company.ape_code);

  /**
   * Reprend l'adresse au registre, depuis le SIREN déduit du SIRET.
   *
   * Second appel de `enrich-company-ai` sur le registre seul — le même que la
   * création de société utilise après le choix d'un établissement. Aucun appel
   * au modèle : il n'y a rien de qualitatif à écrire, seulement une adresse
   * légale à recopier.
   *
   * La société est mise à jour, pas le contrat : l'adresse appartient à la
   * fiche, et la recopier dans le contrat ferait diverger les deux dès la
   * première correction.
   */
  const fillFromRegistry = async () => {
    if (!company || siren.length !== 9) return;
    setFilling(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "enrich-company-ai",
        { body: { name: company.name, siren } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await updateCompany(
        "companies",
        {
          id: company.id,
          data: {
            // Le registre prime sur ce que le CRM porte : c'est lui qui fait
            // foi au bloc « parties ». Mais il ne vide rien — un champ absent
            // de sa réponse laisse en place ce qui existe.
            address: data.address || company.address,
            zipcode: data.zipcode || company.zipcode,
            city: data.city || company.city,
            vat_number: company.vat_number || data.vat_number || null,

            /*
              L identite legale, celle qui ouvre le contrat (NOS-1186).

              « La societe X, [FORME] au capital de [CAPITAL] EUR,
              immatriculee au RCS de [VILLE], code APE [APE] ». Ces quatre
              valeurs viennent du registre et de nulle part ailleurs : les
              faire saisir a la main serait demander a un commercial de
              recopier un extrait Kbis.

              Meme regle que ci-dessus : le registre prime, mais ne vide rien.
            */
            legal_form: data.legal_form || company.legal_form,
            share_capital: data.share_capital || company.share_capital,
            rcs_city: data.rcs_city || company.rcs_city,
            ape_code: data.ape_code || company.ape_code,
            is_individual:
              typeof data.is_individual === "boolean"
                ? data.is_individual
                : company.is_individual,
          },
          previousData: company,
        },
        { returnPromise: true },
      );
      notify("Identite legale reprise du registre", { type: "success" });
      refetchCompany();
    } catch (e) {
      notify(
        `Le registre n'a rien renvoyé : ${
          e instanceof Error ? e.message : String(e)
        }`,
        { type: "error" },
      );
    } finally {
      setFilling(false);
    }
  };

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
  const [rows, setRows] = useState<ServiceRow[]>([emptyRow()]);
  const [isFree, setIsFree] = useState(kind === "poc");
  const [trialStart, setTrialStart] = useState("");
  const [trialEnd, setTrialEnd] = useState("");

  /*
   * La durée se déduit des deux dates, elle ne se demande plus.
   *
   * Le menu déroulant « une semaine / deux semaines / personnalisée » doublait
   * ce que les dates disaient déjà, et ouvrait la porte à ce qu'ils se
   * contredisent. Deux dates suffisent ; le nombre de semaines n'a qu'un seul
   * rôle, la formulation de l'article 2 — « pour une durée de deux (2)
   * semaines » — et se calcule pour lui.
   *
   * `null` dès que l'écart n'est pas un nombre entier de semaines : le gabarit
   * omet alors la mention plutôt que d'arrondir.
   */
  const weeks = weeksBetween(trialStart, trialEnd);

  /*
   * Pré-remplissage à l'ouverture.
   *
   * Le signataire Nosho tombe sur l'utilisateur courant quand il fait partie
   * des personnes habilitées ; sinon rien, plutôt que de désigner quelqu'un
   * d'autre à sa place.
   */
  useEffect(() => {
    if (!open) return;

    /*
     * Édition : on recharge ce qui a été saisi, et on ne suggère rien.
     *
     * Réappliquer un défaut parce qu'on rouvre la fenêtre pour corriger une
     * faute de frappe dans un e-mail écraserait un prix négocié.
     */
    if (contract) {
      setSignatoryFirstName(contract.signatory_first_name ?? "");
      setSignatoryLastName(contract.signatory_last_name ?? "");
      setSignatoryJobTitle(contract.signatory_job_title ?? "");
      setSignatoryEmail(contract.signatory_email ?? "");
      setNoshoSignatoryId(
        contract.nosho_signatory_id != null
          ? String(contract.nosho_signatory_id)
          : "",
      );
      const saved = contract.services ?? [];
      setRows(
        saved.length
          ? saved.map((line) => ({
              service: line.service,
              label: line.label,
              price: euros(line.unitPriceCents),
              unit: line.unit ?? "",
              comment: line.comment ?? "",
            }))
          : [emptyRow()],
      );
      setIsFree(!!contract.is_free);
      setTrialStart(contract.trial_start_date ?? "");
      setTrialEnd(contract.trial_end_date ?? "");
      return;
    }

    const me = sales?.find((s) => String(s.id) === String(identity?.id));
    if (me && me.job_title) setNoshoSignatoryId(String(me.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sales, contract]);

  const patchRow = (index: number, patch: Partial<ServiceRow>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  /*
   * Changer de service réécrit le libellé et l'unité, sauf pour « Autre ».
   *
   * Le libellé reste modifiable ensuite : c'est lui qui s'imprime au contrat,
   * et « Agent de confirmation de rendez-vous — site de Marseille » est une
   * précision légitime qu'aucune liste fermée ne contiendra jamais.
   */
  const changeService = (index: number, value: string) => {
    const choice = CONTRACT_SERVICES.find((s) => s.value === value);
    if (!choice) return;
    patchRow(index, {
      service: value,
      unit: choice.defaultUnit,
      label: value === "autre" ? "" : choice.label,
    });
  };

  const noshoSignatory = sales?.find((s) => String(s.id) === noshoSignatoryId);

  const handleSubmit = () => {
    const services: ContractService[] = rows
      // Une ligne sans libellé n'est pas une prestation : c'est une ligne
      // qu'on a ajoutée puis laissée vide. L'imprimer serait pire que
      // l'oublier.
      .filter((row) => row.label.trim())
      .map((row) => ({
        service: row.service,
        label: row.label.trim(),
        unitPriceCents: toCents(row.price),
        unit: row.unit || null,
        comment: row.comment.trim() || null,
      }));

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
      services,
      is_free: isFree,
      // Le contrat cadre n'a pas de période d'essai : lui en écrire une
      // contredirait son article 7.
      trial_start_date: kind === "poc" ? trialStart || null : null,
      trial_end_date: kind === "poc" ? trialEnd || null : null,
      trial_weeks: kind === "poc" ? (weeks ?? null) : null,
      status: "draft",
      // Rien à prélever sur un POC : pas de mandat.
      sepa_mandate_reference:
        kind === "cadre"
          ? buildSepaMandateReference(Number(deal.id), new Date().getFullYear())
          : null,
    };

    const onSuccess = () => {
      notify(`${KIND_LABELS[kind]} enregistré`, { type: "success" });
      onClose();
    };
    const onError = (error: unknown) =>
      notify(
        `Enregistrement impossible : ${
          error instanceof Error ? error.message : String(error)
        }`,
        { type: "error" },
      );

    if (contract) {
      /*
       * `status` et la RUM sont volontairement absents de la mise à jour.
       *
       * Le statut suit le cycle du document, pas la saisie : le remettre à
       * « brouillon » parce qu'on corrige un e-mail effacerait le fait qu'il a
       * été envoyé. Et la RUM, une fois enregistrée par la banque du débiteur,
       * ne doit plus bouger — la réécrire casserait le mandat.
       */
      const {
        status: _ignore,
        sepa_mandate_reference: _rum,
        ...editable
      } = payload;
      update(
        "contracts",
        { id: contract.id, data: editable, previousData: contract },
        { onSuccess, onError },
      );
      return;
    }

    create("contracts", { data: payload }, { onSuccess, onError });
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
              siret ? `SIRET ${siret}` : null,
              company?.vat_number ? `TVA ${company.vat_number}` : null,
              [company?.address, company?.zipcode, company?.city]
                .filter(Boolean)
                .join(" ") || null,
            ]
              .filter(Boolean)
              .join(" · ") || "Aucune donnée d'identification"}
          </span>

          {/*
            Le blocage, et la façon d'en sortir.

            Ces deux champs ne se saisissent pas ici : ils appartiennent à la
            fiche société, et les recopier dans le contrat ferait diverger les
            deux dès la première correction. Le SIRET vient de la fiche ou de
            l'enrichissement à la création ; l'adresse peut être reprise au
            registre d'un clic, puisque le SIRET la désigne.
          */}
          {(missing || legalIncomplete) && (
            <div className="mt-1 flex flex-col gap-2 rounded-md border border-[var(--deal-status-warning)] bg-[color-mix(in_oklch,var(--deal-status-warning)_8%,transparent)] p-2.5">
              <span className="flex items-start gap-1.5 text-xs text-[var(--deal-status-warning)]">
                <AlertTriangle
                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  aria-hidden
                />
                <span>
                  {!siret
                    ? "SIRET manquant. Le contrat écrit « immatriculée au RCS de … sous le numéro … (SIRET du siège : …) » : il ne peut pas être édité sans."
                    : !hasAddress
                      ? "Adresse incomplète. Le bloc « parties » écrit « dont l'établissement est situé …, … … »."
                      : /*
                          Un avertissement, pas un blocage : le contrat
                          s'enregistre, seule sa GÉNÉRATION sera refusée.
                        */
                        "Identité légale incomplète — forme juridique, capital, greffe ou code APE. Le contrat s'enregistre, mais le document ne pourra pas être généré."}
                </span>
              </span>
              {!siret ? (
                <span className="text-xs text-muted-foreground">
                  À renseigner sur la fiche société, avec « Compléter avec l'IA
                  » ou à la main.
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={fillFromRegistry}
                  disabled={filling || siren.length !== 9}
                >
                  {filling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="w-3.5 h-3.5" aria-hidden />
                  )}
                  Compléter depuis le registre
                </Button>
              )}
            </div>
          )}
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

        {kind === "poc" && (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Période d'essai
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("Début", trialStart, setTrialStart, undefined, "date")}
              {field("Fin", trialEnd, setTrialEnd, undefined, "date")}
            </div>
            <span className="text-xs text-muted-foreground">
              {/* Le contrat écrit ses bornes incluses : « prend effet le lundi
                  31 août 2026 […] jusqu'au dimanche 13 septembre 2026 inclus ».
                  Le décompte suit cette convention. */}
              Bornes incluses.
              {weeks != null
                ? ` Soit ${weeks} semaine${weeks > 1 ? "s" : ""} — le contrat l'écrira.`
                : trialStart && trialEnd
                  ? " La durée n'étant pas un nombre entier de semaines, le contrat n'écrira que les deux dates."
                  : ""}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prestations
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRows((current) => [...current, emptyRow()])}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              Ajouter une prestation
            </Button>
          </div>

          {kind === "poc" && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={isFree}
                onCheckedChange={(next) => setIsFree(next === true)}
                aria-label="Contrat gratuit"
                className="mt-0.5"
              />
              <span>
                Gratuit — aucune facturation
                <span className="block text-xs text-muted-foreground">
                  {/* Ce n'est pas un affichage : l'article 5 écrit « Aucun
                      montant, à quelque titre que ce soit, ne pourra être
                      facturé ». Les lignes restent utiles pour autant — le même
                      article annonce le tarif de la suite, à titre indicatif. */}
                  Les prestations ci-dessous s'impriment alors à titre indicatif
                  et sans valeur d'engagement, comme le prévoit l'article 5.
                </span>
              </span>
            </label>
          )}

          {rows.map((row, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border bg-muted/20 p-2.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Service</Label>
                  <Select
                    value={row.service}
                    onValueChange={(value) => changeService(index, value)}
                  >
                    <SelectTrigger aria-label={`Service ${index + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_SERVICES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  // La dernière ligne ne se supprime pas : un contrat sans
                  // aucune ligne n'a rien à dire, et le bouton « Ajouter »
                  // serait alors le seul chemin de retour.
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((current) => current.filter((_, i) => i !== index))
                  }
                  aria-label={`Supprimer la prestation ${index + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-2">
                {field(
                  "Libellé au contrat",
                  row.label,
                  (value) => patchRow(index, { label: value }),
                  "Agent de confirmation de rendez-vous",
                )}
                {field(
                  "Prix HT",
                  row.price,
                  (value) => patchRow(index, { price: value }),
                  "0,25",
                )}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Unité</Label>
                  <Select
                    value={row.unit}
                    onValueChange={(value) => patchRow(index, { unit: value })}
                  >
                    <SelectTrigger aria-label={`Unité ${index + 1}`}>
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

              {field(
                "Commentaire",
                row.comment,
                (value) => patchRow(index, { comment: value }),
                "Reprise des créneaux annulés incluse.",
              )}
            </div>
          ))}
        </div>

        {/* Ce que le contrat dit de la durée d'engagement, rappelé plutôt que
            redemandé. */}
        {kind === "cadre" && (
          <p className="text-xs text-muted-foreground">
            Période ferme de 12 mois à compter de la mise en production, puis
            tacite reconduction par périodes de 12 mois, préavis de 30 jours. Il
            n'y a pas de date de fin à saisir.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          {/*
            Enregistrer reste fermé tant que la société n'a pas de quoi
            remplir le bloc « parties ».

            Le défaut que cela évite est déjà arrivé : le contrat HEM est parti
            chez le client avec `[SIREN / FINESS HEM]` page 3, jamais rempli.
            Une fois signé, il n'y a plus rien à corriger.
          */}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || missing}
            title={
              missing
                ? "SIRET ou adresse manquants sur la fiche société"
                : undefined
            }
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
