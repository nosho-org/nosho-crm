import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { useNotify } from "ra-core";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";

import { getSupabaseClient } from "../providers/supabase/supabase";
import { useConfigurationContext } from "../root/ConfigurationContext";
import {
  type Enrichissement,
  championsAEcrire,
  enrichirSociete,
} from "./enrichirSociete";

/**
 * Le bouton « Compléter automatiquement », posé dans un formulaire (NOS-1432).
 *
 * Simon, le 08/09/2026 : « quand tu crées la société depuis l'opportunité, tu
 * n'as pas le check API Pappers pour remplir automatiquement les infos et
 * générer la présentation ».
 *
 * L'enrichissement existait, mais uniquement sur la page **complète** de
 * création de société. La feuille rapide ouverte depuis une opportunité ne
 * demandait qu'un nom et une catégorie — d'où des sociétés créées vides, qui
 * ne déclenchaient ensuite ni ARR suggéré ni descriptif dans « Le client ».
 *
 * ## Il remplit le formulaire, il n'enregistre pas
 *
 * Les valeurs trouvées sont posées dans les champs, pas écrites en base. La
 * personne voit ce qui a été trouvé, corrige si besoin, et enregistre elle-même.
 * Un enrichissement qui écrirait directement ferait d'un bouton d'aide une
 * action irréversible.
 *
 * `shouldDirty: true`, contrairement au préremplissage d'ARR : ici un humain a
 * cliqué. Le formulaire doit se considérer modifié, sinon fermer la feuille
 * sans enregistrer ne préviendrait de rien.
 *
 * ## Les trois réponses sont distinguées
 *
 * Introuvable, modèle muet, ou choix d'établissement à faire : trois cas que
 * le mot « échec » confondrait. Le second est celui qui avait produit
 * NOS-1211 — un écran d'apparence réussie, avec une adresse et sans
 * description, et rien qui dise pourquoi.
 */
export const BoutonEnrichirFormulaire = () => {
  const { companySectors, companyTypes } = useConfigurationContext();
  const { setValue } = useFormContext();
  const nom = useWatch({ name: "name" }) as string | undefined;
  const notify = useNotify();

  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<Enrichissement | null>(null);

  const lancer = async () => {
    if (!nom?.trim()) return;
    setEnCours(true);
    setResultat(null);
    try {
      const enrichissement = await enrichirSociete(
        (fonction, options) =>
          getSupabaseClient().functions.invoke(fonction, options),
        nom,
        { sectors: companySectors, types: companyTypes },
      );
      setResultat(enrichissement);

      const patch = championsAEcrire(enrichissement);
      for (const [champ, valeur] of Object.entries(patch)) {
        setValue(champ, valeur, { shouldDirty: true });
      }

      const nbChamps = Object.keys(patch).length;
      if (nbChamps > 0) {
        notify(
          `${nbChamps} champ${nbChamps > 1 ? "s" : ""} rempli${nbChamps > 1 ? "s" : ""} — vérifiez avant d'enregistrer`,
          { type: "info" },
        );
      }
    } catch (e) {
      notify(
        `Enrichissement impossible : ${e instanceof Error ? e.message : String(e)}`,
        { type: "error" },
      );
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={lancer}
        disabled={!nom?.trim() || enCours}
        className="self-start gap-1.5"
      >
        {enCours ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="w-3.5 h-3.5" aria-hidden />
        )}
        {enCours ? "Recherche…" : "Compléter automatiquement"}
      </Button>

      {resultat?.not_found ? (
        <p className="text-xs text-muted-foreground">
          Aucune information trouvée pour « {nom} ». Vous pouvez enregistrer
          avec le nom seul.
        </p>
      ) : null}

      {/*
        Le cas qui avait produit NOS-1211 : le registre répond, le modèle non.
        Les données trouvées restent valables, et le message le dit — sans quoi
        on reproche à l'IA une clé manquante.
      */}
      {resultat?.qualitative_unavailable ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertCircle
            className="w-3.5 h-3.5 mt-px shrink-0 text-[var(--deal-status-warning)]"
            aria-hidden
          />
          Le descriptif n'a pas pu être généré : le service d'analyse n'a pas
          répondu. Les données du registre ci-dessous restent valables.
        </p>
      ) : null}

      {/*
        Plusieurs établissements portent ce nom. La feuille rapide n'a pas la
        place d'en présenter la liste — la page Sociétés le fait — mais le
        taire laisserait croire que l'établissement retenu est le bon.
      */}
      {resultat?.legal_candidates && resultat.legal_candidates.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          {resultat.legal_candidates.length} établissements portent ce nom.
          Vérifiez l'adresse et le SIRET, ou affinez depuis la page Sociétés.
        </p>
      ) : null}
    </div>
  );
};
