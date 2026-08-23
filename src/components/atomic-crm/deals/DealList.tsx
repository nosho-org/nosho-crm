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
import { getCommercialDealsFilter, getCompanyTypeChoices } from "./dealUtils";
import { DealArchivedList } from "./DealArchivedList";
import { DealCreate } from "./DealCreate";
import { DealEdit } from "./DealEdit";
import { DealEmpty } from "./DealEmpty";
import { DealFilterBar } from "./DealFilterBar";
import { DealListContent } from "./DealListContent";
import { DealShow } from "./DealShow";
import { SalesFilterInput } from "./SalesFilterInput";

const DealList = () => {
  const { identity } = useGetIdentity();
  const {
    dealCategories,
    dealPriorities,
    dealStages,
    leadSources,
    companyTypes,
    customViews,
  } = useConfigurationContext();
  const companyTypeChoices = getCompanyTypeChoices(companyTypes, customViews);

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
      sort={{ field: "index", order: "DESC" }}
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
  const matchShow = matchPath("/deals/:id/show", location.pathname);
  const matchEdit = matchPath("/deals/:id", location.pathname);

  const { data, isPending, filterValues } = useListContext();
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters)
    return (
      <>
        <DealEmpty>
          <DealCreate open={!!matchCreate} />
          <DealShow open={!!matchShow} id={matchShow?.params.id} />
          <DealArchivedList />
        </DealEmpty>
      </>
    );

  return (
    <div className="w-full">
      {/*
        The revenue banner, the forecast table and the inactivity alert used to
        sit here. They moved to the dashboard with NOS-955 — the spec separates
        "pilotage business" from "pilotage opérationnel", and this screen is the
        operational one. What remains of the aggregates are the column headers.
      */}
      <div className="flex flex-col gap-4 w-full">
        <DealFilterBar />
        <DealListContent />
      </div>
      <DealArchivedList />
      <DealCreate open={!!matchCreate} />
      <DealEdit open={!!matchEdit && !matchCreate} id={matchEdit?.params.id} />
      <DealShow open={!!matchShow} id={matchShow?.params.id} />
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
