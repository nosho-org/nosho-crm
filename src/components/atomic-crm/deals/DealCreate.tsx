import { useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import {
  Form,
  useDataProvider,
  useGetIdentity,
  useListContext,
  useNotify,
  useRedirect,
} from "ra-core";
import { matchPath, useLocation } from "react-router";
import { Create } from "@/components/admin/create";
import { SaveButton } from "@/components/admin/form";
import { FormToolbar } from "@/components/admin/simple-form";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import type { Deal } from "../types";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { DealInputs } from "./DealInputs";
import { DealListViewContext } from "./DealListContent";
import { applyDealIndexShift, getDefaultDealStage } from "./dealUtils";

export const DealCreate = ({ open }: { open: boolean }) => {
  const redirect = useRedirect();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const { data: allDeals } = useListContext<Deal>();
  const { dealStages } = useConfigurationContext();
  const { companyType, initialVisibleStages } = useContext(DealListViewContext);
  const location = useLocation();
  const viewMatch = matchPath("/views/:viewId/*", location.pathname);
  const basePath = viewMatch ? `/views/${viewMatch.params.viewId}` : "/deals";
  const defaultStage = getDefaultDealStage(dealStages, initialVisibleStages);

  const handleClose = () => {
    redirect(basePath);
  };

  const queryClient = useQueryClient();

  // Make room for the new card at the top of its column.
  const shiftDealsBelow = async (deal: Deal) => {
    if (!allDeals) return;
    // increase the index of all deals in the same stage as the new deal
    // first, get the list of deals in the same stage
    const deals = allDeals.filter(
      (d: Deal) => d.stage === deal.stage && d.id !== deal.id,
    );
    if (deals.length === 0) return;
    // update the actual deals in the database
    await Promise.all(
      deals.map(async (oldDeal) =>
        dataProvider.update("deals", {
          id: oldDeal.id,
          data: { index: oldDeal.index + 1 },
          previousData: oldDeal,
        }),
      ),
    );
    // refresh the list of deals in the cache as we used dataProvider.update(),
    // which does not update the cache
    const dealsById = deals.reduce(
      (acc, d) => ({
        ...acc,
        [d.id]: { ...d, index: d.index + 1 },
      }),
      {} as { [key: string]: Deal },
    );
    queryClient.setQueriesData(
      { queryKey: ["deals"] },
      (res: unknown) => applyDealIndexShift(res, dealsById),
      { updatedAt: Date.now() },
    );
  };

  const onSuccess = async (deal: Deal) => {
    // By the time we get here the opportunity is already in the database, so
    // the refresh and the redirect below have to happen whatever the
    // re-indexing does. Letting an error escape leaves the dialog open on a
    // deal that *was* created — which is how issue #115 read to the user, who
    // clicked Save eleven times in twenty-nine seconds.
    try {
      await shiftDealsBelow(deal);
    } catch (error) {
      console.error("Réindexation de la colonne impossible", error);
      notify(
        "Opportunité créée, mais l'ordre de sa colonne n'a pas pu être mis à jour",
        { type: "warning" },
      );
    }
    await queryClient.invalidateQueries({ queryKey: ["deals"] });
    redirect(basePath);
  };

  const { identity, isPending: identityPending } = useGetIdentity();

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="lg:max-w-4xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {/*
          Wait for the identity before mounting the form. `useAugmentedForm`
          re-`reset()`s whenever `JSON.stringify(defaultValues)` changes, and
          `sales_id` is `undefined` until `useGetIdentity` resolves — so
          mounting early means the reset lands mid-typing and wipes the fields.
        */}
        {identityPending ? null : (
          <Create resource="deals" mutationOptions={{ onSuccess }}>
            <Form
              defaultValues={{
                sales_id: identity?.id,
                contact_ids: [],
                index: 0,
                company_type: companyType || null,
                stage: defaultStage,
              }}
            >
              {/* Issue #122 — an opportunity cannot be created half-filled. */}
              <DealInputs mode="create" />
              <FormToolbar>
                <SaveButton />
              </FormToolbar>
            </Form>
          </Create>
        )}
      </DialogContent>
    </Dialog>
  );
};
