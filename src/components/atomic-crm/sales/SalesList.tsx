import { useRecordContext } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";

const SalesListActions = () => (
  <TopToolbar>
    <ExportButton />
    <CreateButton label="Nouvel utilisateur" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn />];

const OptionsField = (_props: { label?: string | boolean }) => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <div className="flex flex-row gap-1">
      {record.administrator && (
        <Badge
          variant="outline"
          className="border-blue-300 dark:border-blue-700"
        >
          Admin
        </Badge>
      )}
      {record.disabled && (
        <Badge
          variant="outline"
          className="border-orange-300 dark:border-orange-700"
        >
          Disabled
        </Badge>
      )}
    </div>
  );
};

export function SalesList() {
  return (
    <List
      title="Utilisateurs"
      filters={filters}
      actions={<SalesListActions />}
      sort={{ field: "first_name", order: "ASC" }}
    >
      {/*
        Pas de suppression groupée ici (NOS-1233).

        Simon : « je les supprime et ils reviennent ». Le bouton venait du
        `DataTable` par défaut et tentait un `DELETE` direct sur `sales`,
        que les politiques de la table n'autorisent pas : Postgres
        refusait en supprimant zéro ligne, sans erreur, si bien que
        l'écran annonçait un succès puis remettait la ligne au
        rafraîchissement.

        Supprimer un utilisateur passe par la fonction serveur, qui
        vérifie ce que porte le compte et emporte l'authentification avec.
        Ce chemin vit sur la fiche, une personne à la fois : un lot de
        comptes dont chacun peut être refusé pour une raison différente ne
        se rend pas dans une seule barre d'action.
      */}
      <DataTable bulkActionButtons={false}>
        <DataTable.Col source="first_name" />
        <DataTable.Col source="last_name" />
        <DataTable.Col source="email" />
        <DataTable.Col label={false}>
          <OptionsField />
        </DataTable.Col>
      </DataTable>
    </List>
  );
}
