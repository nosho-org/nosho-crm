import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Merge } from "lucide-react";
import { useDataProvider, useGetList, useNotify, useRefresh } from "ra-core";
import { useMutation } from "@tanstack/react-query";
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

import type { CrmDataProvider } from "../providers/supabase/dataProvider";
import type { Company } from "../types";
import {
  type DuplicateGroup,
  countRedundant,
  findDuplicateGroups,
} from "./companyDuplicates";

/**
 * ---------------------------------------------------------------------------
 * Fusionner les sociétés en double (NOS-1176)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « La grille de cartes rend le doublon évident mais
 * n'offre aucun moyen de le résoudre. » En production : 85 groupes, 172 fiches.
 *
 * ## Une fusion à la fois, et jamais en masse
 *
 * Il serait facile d'ajouter « tout fusionner ». Ce serait une erreur : le
 * rapprochement par nom est une hypothèse, et 85 fusions automatiques feraient
 * disparaître pour de bon les fiches où l'hypothèse était fausse. Chaque
 * groupe se regarde, et se fusionne — ou pas.
 *
 * ## La fusion est irréversible, et le dit
 *
 * Il n'y a pas de corbeille. La fenêtre nomme donc ce qui sera repris, ce qui
 * disparaîtra, et demande une confirmation explicite plutôt qu'un simple
 * bouton rouge.
 */

const MergeDialog = ({
  group,
  onClose,
}: {
  group: DuplicateGroup;
  onClose: () => void;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();

  // La mieux renseignée est proposée en gagnante — voir `completenessScore`.
  const [winnerId, setWinnerId] = useState(String(group.companies[0].id));

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const losers = group.companies.filter(
        (company) => String(company.id) !== winnerId,
      );
      /*
       * Séquentiel et non `Promise.all` : chaque fusion réécrit la fiche
       * gagnante, et deux transactions concurrentes sur la même ligne se
       * bloqueraient ou s'écraseraient. Un trio se fusionne donc en deux temps.
       */
      for (const loser of losers) {
        await dataProvider.mergeCompanies(loser.id, winnerId);
      }
      return losers.length;
    },
    onSuccess: (count) => {
      notify(
        `${count} fiche${count > 1 ? "s" : ""} fusionnée${count > 1 ? "s" : ""}.`,
        { type: "success" },
      );
      onClose();
      refresh();
    },
    onError: (error) => {
      notify(
        `Fusion impossible : ${
          error instanceof Error ? error.message : String(error)
        }`,
        { type: "error" },
      );
    },
  });

  const winner = group.companies.find(
    (company) => String(company.id) === winnerId,
  );
  const losers = group.companies.filter(
    (company) => String(company.id) !== winnerId,
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fusionner {group.companies.length} fiches</DialogTitle>
          <DialogDescription>
            {group.kind === "siret"
              ? "Ces fiches partagent le même SIRET : c'est le même établissement."
              : "Ces fiches portent le même nom. Vérifiez qu'il s'agit bien du même établissement — deux cabinets peuvent avoir le même nom."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fiche à conserver
          </span>
          {group.companies.map((company) => (
            <label
              key={company.id}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${
                String(company.id) === winnerId
                  ? "border-foreground bg-muted/40"
                  : ""
              }`}
            >
              <input
                type="radio"
                name="winner"
                className="mt-1"
                checked={String(company.id) === winnerId}
                onChange={() => setWinnerId(String(company.id))}
              />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium block">
                  {company.name}
                </span>
                <span className="text-xs text-muted-foreground block">
                  {[
                    company.tax_identifier
                      ? `SIRET ${company.tax_identifier}`
                      : "sans SIRET",
                    [company.zipcode, company.city].filter(Boolean).join(" ") ||
                      null,
                    company.nb_deals
                      ? `${company.nb_deals} opportunité${company.nb_deals > 1 ? "s" : ""}`
                      : null,
                    company.nb_contacts
                      ? `${company.nb_contacts} contact${company.nb_contacts > 1 ? "s" : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-md border border-[var(--deal-status-warning)] bg-[color-mix(in_oklch,var(--deal-status-warning)_8%,transparent)] p-3 text-xs flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-medium text-[var(--deal-status-warning)]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Irréversible
          </span>
          <span className="text-muted-foreground">
            {/* Nommer ce qui est repris ET ce qui disparaît : « fusionner »
                seul laisse croire qu'on pourra revenir en arrière. */}
            Opportunités, contacts et contrats de{" "}
            {losers.map((company) => company.name).join(", ")} passent sur{" "}
            <b className="text-foreground">{winner?.name}</b>. Les champs vides
            de la fiche conservée sont complétés depuis les autres. Puis{" "}
            {losers.length} fiche{losers.length > 1 ? "s" : ""} sont supprimées.
          </span>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" onClick={() => mutate()} disabled={isPending}>
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Fusionner définitivement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const CompanyDuplicatesBanner = () => {
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);

  /*
   * Toutes les sociétés, pas la page affichée.
   *
   * Un doublon dont les deux fiches ne tombent pas sur la même page de la
   * liste serait invisible — et c'est le cas le plus fréquent, puisque la
   * liste est triée par nom et qu'un doublon diffère souvent par sa casse ou
   * sa ponctuation.
   */
  const { data: companies, isPending } = useGetList<Company>("companies", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "name", order: "ASC" },
  });

  const groups = findDuplicateGroups(companies ?? []);
  const redundant = countRedundant(groups);

  if (isPending || groups.length === 0) return null;

  return (
    <>
      <Card className="p-3 flex flex-col gap-3 border-[var(--deal-status-warning)]">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle
            className="w-4 h-4 shrink-0 text-[var(--deal-status-warning)]"
            aria-hidden
          />
          <span className="text-sm">
            <b>{groups.length} doublons probables</b> — {redundant} fiche
            {redundant > 1 ? "s" : ""} en trop.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "Masquer" : "Examiner"}
          </Button>
        </div>

        {open && (
          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <div
                key={`${group.kind}-${group.key}`}
                className="flex items-center gap-3 border-t pt-2 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    {group.companies.map((company, index) => (
                      <span key={company.id}>
                        {index > 0 && (
                          <span className="text-muted-foreground"> · </span>
                        )}
                        <Link
                          to={`/companies/${company.id}/show`}
                          className="underline hover:no-underline"
                        >
                          {company.name}
                        </Link>
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.kind === "siret"
                      ? `Même SIRET (${group.key}) — certain`
                      : "Même nom — à vérifier"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMerging(group)}
                >
                  <Merge className="w-3.5 h-3.5" aria-hidden />
                  Fusionner
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {merging && (
        <MergeDialog
          key={`${merging.kind}-${merging.key}`}
          group={merging}
          onClose={() => setMerging(null)}
        />
      )}
    </>
  );
};
