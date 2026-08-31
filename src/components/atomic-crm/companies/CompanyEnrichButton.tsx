import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useNotify, useRefresh, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Générer le descriptif d'une société déjà créée (NOS-1213)
 * ---------------------------------------------------------------------------
 * Simon : « je n'ai toujours rien sur la description générée par l'IA, par
 * exemple sur Polyclinique Saint Privat ».
 *
 * L'enrichissement ne s'exécutait qu'**au moment de la création**. Une société
 * créée pendant que la clé du modèle manquait — ou avant que ce chemin
 * n'existe — restait sans descriptif pour toujours : aucun écran ne permettait
 * de relancer l'opération. Le seul rattrapage consistait à supprimer la fiche
 * et à la recréer, ce qui emporterait ses opportunités.
 *
 * ## Il n'écrase pas ce qui est écrit à la main
 *
 * Le descriptif reçu ne remplace un existant que si celui-ci vient déjà du
 * modèle (`description_source === "ai"`). Un texte rédigé par un commercial
 * vaut mieux qu'une inférence, et l'écraser silencieusement ferait de ce
 * bouton un piège.
 *
 * ## Il ne touche qu'au descriptif
 *
 * Ni l'adresse, ni le secteur, ni le téléphone : la fonction sait les rendre,
 * mais les réécrire depuis un écran de consultation reviendrait à défaire des
 * corrections manuelles sans les montrer. Le manque signalé est le descriptif ;
 * c'est lui, et lui seul, que ce bouton comble.
 */
export const CompanyEnrichButton = ({ record }: { record: Company }) => {
  const { companySectors, companyTypes } = useConfigurationContext();
  const [update] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [enCours, setEnCours] = useState(false);

  // Un descriptif écrit par un humain n'a pas à être regénéré.
  const redigeALaMain =
    !!record.description?.trim() && record.description_source !== "ai";
  if (redigeALaMain) return null;

  const generer = async () => {
    setEnCours(true);
    try {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "enrich-company-ai",
        {
          body: {
            name: record.name,
            sectors: companySectors,
            types: companyTypes,
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      /*
       * Distinguer les trois issues, plutôt que de dire « échec ».
       *
       * `qualitative_unavailable` veut dire que le service n'a pas répondu —
       * clé absente, quota, panne. `not_found` veut dire que la société est
       * introuvable. Les confondre enverrait chercher un problème de données
       * là où il n'y a qu'une clé manquante, ce qui est exactement ce qui
       * vient de se produire (NOS-1211).
       */
      if (data?.qualitative_unavailable) {
        notify(
          "Le service d'analyse n'a pas répondu : descriptif non généré.",
          { type: "warning" },
        );
        return;
      }
      if (data?.not_found || !data?.description) {
        notify(`Aucun descriptif trouvé pour « ${record.name} »`, {
          type: "info",
        });
        return;
      }

      await update(
        "companies",
        {
          id: record.id,
          data: {
            description: data.description,
            description_source: "ai",
          },
          previousData: record,
        },
        { returnPromise: true },
      );
      notify("Descriptif généré", { type: "info" });
      refresh();
    } catch (e) {
      notify(
        `Génération impossible : ${e instanceof Error ? e.message : String(e)}`,
        { type: "error" },
      );
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={generer}
      disabled={enCours}
      className="w-fit"
    >
      <Sparkles className="w-3.5 h-3.5" aria-hidden />
      {enCours
        ? "Génération…"
        : record.description
          ? "Regénérer le descriptif"
          : "Générer le descriptif"}
    </Button>
  );
};
