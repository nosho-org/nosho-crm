import { useListContext, useRecordContext } from "ra-core";
import { Link as RouterLink } from "react-router";
import { Badge } from "@/components/ui/badge";

import { Avatar } from "../contacts/Avatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { getContactRole, getContactRoleLabel } from "./dealContactRoles";

export const ContactList = (props: { record?: Deal }) => {
  const { data, error, isPending } = useListContext();
  // The deal is the enclosing record: roles live on the deal↔contact relation
  // (`deals.contact_roles`), not on the contact itself. <ReferenceArrayField>
  // only provides a ListContext, so the deal is still the current record here.
  const deal = useRecordContext<Deal>(props);
  const { dealContactRoles } = useConfigurationContext();

  if (isPending || error) return <div className="h-8" />;
  return (
    <div className="flex flex-row flex-wrap gap-4 mt-4">
      {data.map((contact) => {
        const roleLabel = getContactRoleLabel(
          dealContactRoles,
          getContactRole(deal?.contact_roles, contact.id),
        );

        return (
          <div className="flex flex-row gap-4 items-center" key={contact.id}>
            <Avatar record={contact} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <RouterLink
                  to={`/contacts/${contact.id}/show`}
                  className="text-sm hover:underline"
                >
                  {contact.first_name} {contact.last_name}
                </RouterLink>
                {roleLabel ? (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    {roleLabel}
                  </Badge>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">
                {contact.title}
                {contact.title && contact.company_name && " at "}
                {contact.company_name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
