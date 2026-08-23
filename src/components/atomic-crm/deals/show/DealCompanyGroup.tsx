import { ArrowRight, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useGetOne, useRecordContext } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card } from "@/components/ui/card";

import type { Company, Deal } from "../../types";

/**
 * ---------------------------------------------------------------------------
 * Société & Groupe (NOS-957 §4)
 * ---------------------------------------------------------------------------
 * "Nous devons pouvoir distinguer : Groupe → Société/Établissement →
 * Opportunité."
 *
 * The relation is read from `companies.parent_company_id` and nothing else.
 * "Ne jamais déduire automatiquement qu'une société appartient à un groupe à
 * partir de son nom" — a company with no parent reads "Indépendant", never a
 * guess based on a shared prefix.
 *
 * The company name goes through `ReferenceField`, like the header does, so the
 * block renders as soon as the deal is loaded. Gating it on a `useGetOne`
 * result made the whole block vanish whenever that query had not resolved —
 * and a missing block reads as "this deal has no company", which is a
 * different claim from "not loaded yet".
 */
export const DealCompanyGroup = () => {
  const record = useRecordContext<Deal>();

  // Only needed to discover the parent; the company's own name comes from the
  // reference field below.
  const { data: company } = useGetOne<Company>(
    "companies",
    { id: record?.company_id as number },
    { enabled: record?.company_id != null },
  );

  const parentId = company?.parent_company_id;
  const { data: parent } = useGetOne<Company>(
    "companies",
    { id: parentId as number },
    { enabled: parentId != null },
  );

  if (!record?.company_id) return null;

  return (
    <Card className="p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Société &amp; groupe
      </span>

      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Building2
          className="w-4 h-4 shrink-0 text-muted-foreground"
          aria-hidden
        />

        {parent ? (
          <Link
            to={`/companies/${parent.id}/show`}
            className="font-medium hover:underline"
          >
            {parent.name}
          </Link>
        ) : (
          <span className="text-muted-foreground">Indépendant</span>
        )}

        <ArrowRight
          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
          aria-hidden
        />

        <ReferenceField source="company_id" reference="companies" link="show" />
      </div>

      {parent && (
        <Link
          to={{
            pathname: "/companies",
            search: `filter=${encodeURIComponent(
              JSON.stringify({ parent_company_id: parent.id }),
            )}`,
          }}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
        >
          Voir toutes les entités du groupe
          <ArrowRight className="w-3 h-3" aria-hidden />
        </Link>
      )}
    </Card>
  );
};
