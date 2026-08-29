import { useGetIdentity, useListContext } from "ra-core";
import { matchPath, useLocation } from "react-router";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { CreateButton } from "@/components/admin/create-button";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ReferenceInput } from "@/components/admin/reference-input";
import { FilterButton } from "@/components/admin/filter-form";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { TopToolbar } from "../layout/TopToolbar";
import { createDealExporter } from "./dealExporter";
import {
  getCommercialDealsFilter,
  getCompanyTypeChoices,
  getDefaultOpenStages,
} from "./dealUtils";
import { toListFilter } from "./dealFilterContract";
import { DealArchivedList } from "./DealArchivedList";
import { DealCreate } from "./DealCreate";
import { DealEdit } from "./DealEdit";
import { DealEmpty } from "./DealEmpty";
import { DealFilterBar } from "./DealFilterBar";
import { DealListInactivityAlert } from "./DealListInactivityAlert";
import { DealListContent } from "./DealListContent";
import { SalesFilterInput } from "./SalesFilterInput";

const DealList = () => {
  const { identity } = useGetIdentity();
  const {
    dealCategories,
    dealPriorities,
    dealStages,
    dealPipelineStatuses,
    leadSources,
    companyTypes,
    customViews,
  } = useConfigurationContext();
  const companyTypeChoices = getCompanyTypeChoices(companyTypes, customViews);
  const defaultStages = getDefaultOpenStages(dealStages, dealPipelineStatuses);

  if (!identity) return null;

  const dealFilters = [
    <SearchInput source="q" alwaysOn />,
    <ReferenceInput source="company_id" reference="companies">
      <AutocompleteInput label={false} placeholder="Société" />
    </ReferenceInput>,
    <SelectInput
      source="priority"
      label="Priorité"
      emptyText="Toutes les priorités"
      choices={dealPriorities}
      optionText="label"
      optionValue="value"
    />,
    <SelectInput
      source="stage"
      label="Étape"
      emptyText="Toutes les étapes"
      choices={dealStages}
      optionText="label"
      optionValue="value"
    />,
    <SelectInput
      source="category"
      emptyText="Catégorie"
      choices={dealCategories}
      optionText="label"
      optionValue="value"
    />,
    <SelectInput
      source="lead_source"
      label="Source du lead"
      emptyText="Toutes les sources"
      choices={leadSources}
      optionText="label"
      optionValue="value"
    />,
    <SelectInput
      source="company_type"
      label="Type de société"
      emptyText="Tous les types"
      choices={companyTypeChoices}
      optionText="label"
      optionValue="value"
    />,
    <SalesFilterInput source="sales_id" alwaysOn />,
    <SalesFilterInput
      source="referrer_id"
      label="Apporteur"
      emptyText="Tous les apporteurs"
      mineText="Mes apports"
    />,
  ];

  return (
    <List
      perPage={1000}
      filter={{
        "archived_at@is": null,
        // Investors, partnerships, resources, press, Santexpo leads and
        // software bricks keep their own views but stay out of the commercial
        // pipeline (NOS-797).
        ...getCommercialDealsFilter(companyTypes, customViews),
      }}
      title={false}
      /*
       * Point de départ, pas contrainte (NOS-1062). `filterDefaultValues` est
       * ce que l'utilisateur voit à l'ouverture et peut défaire ; le `filter`
       * ci-dessus est ce qu'il ne peut pas lever. Mettre les étapes là-haut
       * aurait rendu Close Won définitivement inatteignable depuis cet écran.
       *
       * Écrit via le contrat partagé plutôt qu'à la main : c'est lui qui décide
       * comment un `@in` s'orthographie, et la barre de filtres le relit avec
       * les mêmes règles.
       *
       * `salesId` : on arrive sur ses propres affaires, pas sur celles de
       * l'équipe (NOS-1085), comme le tableau de bord le fait déjà (NOS-1063).
       *
       * `identity.id` part avec son type natif, sans `String()`. `SalesFilterInput`
       * compare `value === identity.id` en égalité stricte et retire
       * l'utilisateur courant de sa liste : une chaîne ne correspondrait ni à
       * « Mes opportunités » ni à aucun commercial, et le sélecteur s'afficherait
       * vide en contredisant le filtre réellement appliqué.
       */
      /*
       * `storeKey={false}` : l'écran s'ouvre toujours sur ses défauts.
       *
       * Sans ça, ra-core mémorise les filtres dans le store du navigateur, et
       * ce souvenir prime sur `filterDefaultValues` — définitivement. Il
       * suffit d'avoir basculé une fois sur « Toutes les opportunités » pour
       * ne plus jamais revoir « Mes opportunités » à l'ouverture, sans que
       * rien à l'écran n'explique pourquoi. C'est ce que Simon a constaté, et
       * c'est le même piège que les filtres fantômes de NOS-1058.
       *
       * Les filtres ne sont pas perdus pour autant : ra-core les écrit aussi
       * dans l'URL. Ouvrir une opportunité puis revenir en arrière les
       * conserve — seule une arrivée franche sur l'écran repart des défauts,
       * ce qui est précisément le comportement demandé.
       */
      storeKey={false}
      filterDefaultValues={toListFilter({
        stage: defaultStages,
        salesId: identity.id,
      })}
      /*
       * P0 d'abord, puis P1, puis P2 (NOS-1085).
       *
       * Sur `priority_rank` et non `priority` : la colonne texte se trierait
       * alphabétiquement — `important` < `normal` < `urgent`, soit P1, P2, P0.
       * `priority_rank` est une colonne générée et indexée qui n'existe que
       * pour cette raison.
       *
       * Le kanban n'est pas concerné : `getDealsByStage` retrie chaque colonne
       * par `index` quel que soit le tri de la liste. C'est voulu — ordonner
       * les cartes par priorité rendrait le glisser-déposer sans effet.
       */
      sort={{ field: "priority_rank", order: "DESC" }}
      filters={dealFilters}
      actions={<DealActions />}
      pagination={null}
      exporter={createDealExporter(
        dealStages,
        dealCategories,
        leadSources,
        dealPriorities,
      )}
    >
      <DealLayout />
    </List>
  );
};

const DealLayout = () => {
  const location = useLocation();
  const matchCreate = matchPath("/deals/create", location.pathname);
  const matchEdit = matchPath("/deals/:id", location.pathname);

  const { data, isPending, filterValues } = useListContext();
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters)
    return (
      <>
        {/* No <DealCreate> here: <DealEmpty> mounts its own, and for both the
            /deals and the /views/:viewId routes. Passing a second one stacked
            two Radix dialogs, and the one underneath is inert — aria-hidden
            with pointer-events:none — so clicks in it went nowhere. */}
        <DealEmpty>
          <DealArchivedList />
        </DealEmpty>
      </>
    );

  return (
    <div className="w-full">
      {/*
        The revenue banner and the forecast table used to sit here. They moved
        to the dashboard with NOS-955 — the spec separates "pilotage business"
        from "pilotage opérationnel", and this screen is the operational one.

        L'alerte d'inactivité était partie avec elles, à tort : elle ne mesure
        rien, elle dit quoi faire maintenant. NOS-1013 la ramène ici, où
        Marc-Henri l'avait demandée deux fois.
      */}
      <div className="flex flex-col gap-4 w-full">
        <DealFilterBar />
        {/*
          L'alerte « en sommeil » revient ici (NOS-1013). Marc-Henri l'avait
          demandée deux fois sur cet écran ; NOS-955 l'avait emportée au
          dashboard avec la bannière de revenus et la table de prévisions. Ces
          deux-là relèvent bien du pilotage business — l'alerte, elle, dit quoi
          faire maintenant, et sa place est là où l'on travaille.
        */}
        <DealListInactivityAlert />
        <DealListContent />
      </div>
      <DealArchivedList />
      <DealCreate open={!!matchCreate} />
      <DealEdit open={!!matchEdit && !matchCreate} id={matchEdit?.params.id} />
    </div>
  );
};

const DealActions = () => {
  const { dealStages, dealCategories, leadSources, dealPriorities } =
    useConfigurationContext();
  return (
    <TopToolbar>
      <FilterButton />
      <ExportButton
        exporter={createDealExporter(
          dealStages,
          dealCategories,
          leadSources,
          dealPriorities,
        )}
      />
      <CreateButton label="Nouvelle opportunité" />
    </TopToolbar>
  );
};

export default DealList;
