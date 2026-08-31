import { useState } from "react";
import {
  CreateBase,
  Form,
  useCreate,
  useGetIdentity,
  useNotify,
  useRedirect,
} from "ra-core";
import { Sparkles, Loader2, Pencil, AlertCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { CompanyInputs } from "./CompanyInputs";
import { sizes } from "./sizes";

type Enrichment = Partial<Company> & {
  not_found?: boolean;
  /**
   * La source qualitative n'a pas répondu (NOS-1211).
   *
   * Distinct de `not_found`, qui veut dire « société inconnue ». Ici la
   * société existe peut-être très bien : c'est le modèle qui n'a rien pu
   * dire — clé absente, quota, panne.
   */
  qualitative_unavailable?: boolean;
  /**
   * Établissements proposés par le registre quand le nom ne tranche pas
   * (NOS-1152).
   *
   * Message pour l'affichage, jamais une donnée de société : retiré du payload
   * avant la création, comme `not_found`.
   */
  legal_candidates?: LegalCandidate[];
};

/** Un établissement du registre, proposé au choix. */
type LegalCandidate = {
  siren: string;
  siret?: string;
  name: string;
  city?: string;
  zipcode?: string;
  forme_juridique?: string;
  date_creation?: string;
};

const transform = (values: Record<string, unknown>) => {
  const website = values.website;
  if (typeof website === "string" && website && !website.startsWith("http")) {
    values.website = `https://${website}`;
  }
  return values;
};

export const CompanyCreate = () => {
  const { identity } = useGetIdentity();
  const [mode, setMode] = useState<"quick" | "full">("quick");

  return (
    <CreateBase redirect="show" transform={transform}>
      <div className="mt-2 flex lg:mr-72">
        <div className="flex-1">
          {mode === "quick" ? (
            <QuickCreate
              defaultSalesId={identity?.id}
              onSwitchToFull={() => setMode("full")}
            />
          ) : (
            <FullCreate defaultSalesId={identity?.id} />
          )}
        </div>
      </div>
    </CreateBase>
  );
};

// ─── Quick create with AI ────────────────────────────────────────────────────

const QuickCreate = ({
  defaultSalesId,
  onSwitchToFull,
}: {
  defaultSalesId?: string | number;
  onSwitchToFull: () => void;
}) => {
  const { companySectors, companyTypes } = useConfigurationContext();
  const [create, { isPending: isCreating }] = useCreate();
  const notify = useNotify();
  const redirect = useRedirect();

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [notFound, setNotFound] = useState(false);
  // SIREN en cours de resolution, pour n activer qu une ligne a la fois.
  const [pickingSiren, setPickingSiren] = useState<string | null>(null);

  const handleEnrich = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setEnrichment(null);
    setNotFound(false);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        // Remplace `enrich-mistral-company`, jamais deployee et lisant une
        // cle absente : ce bouton n a jamais fonctionne (NOS-1151).
        "enrich-company-ai",
        {
          body: {
            name: name.trim(),
            sectors: companySectors,
            types: companyTypes,
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.not_found) {
        setNotFound(true);
        return;
      }
      setEnrichment(data as Enrichment);
    } catch (e) {
      notify(
        `Erreur d'enrichissement : ${e instanceof Error ? e.message : String(e)}`,
        {
          type: "error",
        },
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * L'utilisateur a désigné son établissement (NOS-1152).
   *
   * Second appel, sur le registre seul : le qualitatif est déjà à l'écran, et
   * relancer le modèle coûterait un appel pour réécrire la même chose.
   *
   * Le résultat écrase ce que le modèle avait pu deviner d'adresse ou de
   * ville — un registre prime sur une inférence, et l'utilisateur vient
   * précisément de dire lequel fait foi.
   */
  const handlePickEstablishment = async (candidate: LegalCandidate) => {
    setPickingSiren(candidate.siren);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "enrich-company-ai",
        { body: { name: name.trim(), siren: candidate.siren } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEnrichment((previous) => {
        const { legal_candidates: _resolu, ...reste } = previous ?? {};
        return { ...reste, ...(data as Partial<Company>) };
      });
    } catch (e) {
      notify(
        `Impossible de récupérer cet établissement : ${
          e instanceof Error ? e.message : String(e)
        }`,
        { type: "error" },
      );
    } finally {
      setPickingSiren(null);
    }
  };

  const handleCreate = async (extra?: Partial<Company>) => {
    const payload: Partial<Company> = {
      name: name.trim(),
      sales_id: defaultSalesId ?? null,
      ...(enrichment ?? {}),
      ...(extra ?? {}),
    };
    const drapeaux = payload as {
      not_found?: boolean;
      legal_candidates?: unknown;
    };
    delete drapeaux.not_found;
    delete drapeaux.legal_candidates;

    create(
      "companies",
      { data: transform(payload as Record<string, unknown>) },
      {
        onSuccess: (record) => {
          notify("Société créée", { type: "success" });
          redirect("show", "companies", (record as { id: string | number }).id);
        },
        onError: (err) => {
          notify(
            `Erreur création : ${err instanceof Error ? err.message : String(err)}`,
            { type: "error" },
          );
        },
      },
    );
  };

  const sectorLabel = (value?: string) =>
    companySectors.find((s) => s.value === value)?.label ?? value;
  const typeLabel = (value?: string) =>
    companyTypes.find((t) => t.value === value)?.label ?? value;
  const sizeLabel = (value?: number) =>
    sizes.find((s) => s.id === value)?.name ??
    (value ? String(value) : undefined);

  return (
    <div className="flex justify-center pt-6">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Ajouter une société</h2>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="company-name">Nom de la société</Label>
            <Input
              id="company-name"
              autoFocus
              placeholder="Ex : Doctolib"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setEnrichment(null);
                setNotFound(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !loading) {
                  e.preventDefault();
                  handleEnrich();
                }
              }}
              disabled={loading || isCreating}
            />
          </div>

          {/* Loading / not-found / enrichment preview */}
          {notFound && (
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-muted-foreground">
                Aucune information trouvée pour « {name} ». Vous pouvez créer la
                société avec uniquement le nom ou{" "}
                <button
                  type="button"
                  onClick={onSwitchToFull}
                  className="underline hover:no-underline font-medium text-foreground"
                >
                  saisir les champs manuellement
                </button>
                .
              </p>
            </div>
          )}

          {/*
            L'échec silencieux, rendu visible (NOS-1211).

            Simon : « le texte généré par l'IA dans la partie Le client
            n'apparaît plus ». Le registre répondait, le modèle non, et
            l'écran affichait un enrichissement d'apparence réussie — avec
            une adresse, sans description, et sans rien qui dise pourquoi.

            Le message nomme la cause opérationnelle plutôt que de rester
            vague : sans cela, on reproche à l'IA une clé manquante.
          */}
          {enrichment?.qualitative_unavailable && (
            <div className="flex items-start gap-2 rounded-md border border-[var(--deal-status-warning)]/40 bg-[var(--deal-status-warning)]/10 p-3 text-sm">
              <AlertCircle className="w-4 h-4 text-[var(--deal-status-warning)] mt-0.5 shrink-0" />
              <p className="text-muted-foreground">
                Le descriptif n'a pas pu être généré : le service d'analyse
                n'a pas répondu. Les données du registre ci-dessous restent
                valables ; la description pourra être ajoutée à la main ou
                en relançant l'enrichissement plus tard.
              </p>
            </div>
          )}

          {enrichment && !notFound && (
            <div className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Données trouvées par l'IA
              </p>
              <Field label="Site web" value={enrichment.website} />
              <Field label="LinkedIn" value={enrichment.linkedin_url} />
              <Field label="Téléphone" value={enrichment.phone_number} />
              <Field
                label="Description"
                value={enrichment.description}
                truncate
              />
              <Field label="Secteur" value={sectorLabel(enrichment.sector)} />
              <Field label="Type" value={typeLabel(enrichment.type)} />
              <Field label="Taille" value={sizeLabel(enrichment.size)} />
              <Field label="Adresse" value={enrichment.address} />
              <Field
                label="Ville"
                value={[enrichment.zipcode, enrichment.city]
                  .filter(Boolean)
                  .join(" ")}
              />
              <Field label="Pays" value={enrichment.country} />
              {/* Identifiants légaux : ils viennent de Pappers, pas du modèle
                  (NOS-1151). Les montrer ici permet de les vérifier avant
                  qu'ils n'entrent en base — un SIRET faux ne se signale
                  jamais. */}
              <Field label="SIRET" value={enrichment.tax_identifier} />
              <Field label="N° de TVA" value={enrichment.vat_number ?? ""} />
              {/*
                Le nom ne tranche pas : on montre le registre et l'utilisateur
                choisit (NOS-1152). Un seul clic suffit ensuite à remplir
                SIRET, TVA, adresse, CA et effectif.
              */}
              {!!enrichment.legal_candidates?.length && (
                <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    {enrichment.legal_candidates.length} établissements portent
                    ce nom au registre. Choisissez le bon pour compléter SIRET,
                    TVA, adresse et finances :
                  </p>
                  {enrichment.legal_candidates.map((candidate) => (
                    <button
                      key={candidate.siren}
                      type="button"
                      onClick={() => handlePickEstablishment(candidate)}
                      disabled={pickingSiren !== null || isCreating}
                      className="text-left rounded-md border bg-background px-2.5 py-2 hover:border-primary hover:bg-accent/40 disabled:opacity-60 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {candidate.name}
                        </span>
                        {pickingSiren === candidate.siren && (
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[
                          candidate.forme_juridique,
                          [candidate.zipcode, candidate.city]
                            .filter(Boolean)
                            .join(" "),
                          candidate.siret ? `SIRET ${candidate.siret}` : null,
                          candidate.date_creation
                            ? `créée en ${candidate.date_creation.slice(0, 4)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2 italic">
                Vérifiez puis créez. Les champs manquants pourront être ajoutés
                plus tard. Le descriptif est rédigé par IA ; SIRET, TVA et
                adresse viennent du registre Pappers.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {!enrichment && !notFound && (
              <Button
                type="button"
                onClick={handleEnrich}
                disabled={!name.trim() || loading || isCreating}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Recherche en cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Compléter avec l'IA
                  </>
                )}
              </Button>
            )}

            {(enrichment || notFound) && (
              <Button
                type="button"
                onClick={() => handleCreate()}
                disabled={!name.trim() || isCreating}
                className="w-full"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Créer la société
              </Button>
            )}

            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSwitchToFull}
                className="text-muted-foreground"
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Saisir manuellement
              </Button>
              {!enrichment && !notFound && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCreate()}
                  disabled={!name.trim() || isCreating}
                  className="text-muted-foreground"
                >
                  Créer sans IA
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const Field = ({
  label,
  value,
  truncate,
}: {
  label: string;
  value?: string;
  truncate?: boolean;
}) => {
  if (!value) return null;
  const display =
    truncate && value.length > 140 ? `${value.slice(0, 140)}…` : value;
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="font-medium break-words">{display}</span>
    </div>
  );
};

// ─── Full form fallback ──────────────────────────────────────────────────────

const FullCreate = ({
  defaultSalesId,
}: {
  defaultSalesId?: string | number;
}) => (
  <Form defaultValues={{ sales_id: defaultSalesId }}>
    <Card>
      <CardContent>
        <CompanyInputs />
        <div
          role="toolbar"
          className="sticky flex pt-4 pb-4 md:pb-0 bottom-0 bg-linear-to-b from-transparent to-card to-10% flex-row justify-end gap-2"
        >
          <CancelButton />
          <SaveButton label="Créer la société" />
        </div>
      </CardContent>
    </Card>
  </Form>
);
