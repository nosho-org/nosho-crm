import { ListFilter } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import { pluralize } from "../deals/cockpit/dealFormat";
import { toDealsLink } from "../deals/dealFilterContract";
import { useDashboard } from "./DashboardContext";
import { STAGE_COLORS } from "./stageColors";
import { SANS_CATEGORIE, computeArrParCategorie } from "./arrParCategorie";

/**
 * L'ARR par catégorie de clientèle, et l'avancement de chacune (NOS-1427).
 *
 * Simon : « ajoute un tableau qui donne l'ARR par catégorie, et tu mets des
 * diagrammes en barre en pourcentage par étapes des leads ».
 *
 * Le tableau de bord disait où en était le pipeline dans son ensemble, jamais
 * de quoi il était fait. Les seize catégories ne se travaillent pourtant pas
 * pareil : un hôpital est un cycle long à gros ARR, un cabinet une signature
 * rapide à petit montant.
 *
 * Chaque ligne porte donc deux lectures. Le montant dit **où est l'argent** ;
 * la barre dit **où on en est** — la répartition des opportunités entre les
 * étapes. Une catégorie riche mais entièrement en Lead est un espoir ; la même
 * en Négociation est une prévision.
 *
 * Les couleurs sont celles du kanban et de l'entonnoir : une même étape garde
 * sa teinte partout, sinon la barre demanderait un effort de traduction à
 * chaque lecture.
 */
export const CategoryBreakdown = () => {
  const { dealCategories, dealStages } = useConfigurationContext();
  const { deals, weighting, selectionFilter } = useDashboard();

  /*
   * Le filtre d'étape, local à cette carte (NOS-1428).
   *
   * Simon : « mets un filtre sur ce tableau qui permet de choisir l'état de
   * l'opportunité ». Local et non branché sur le filtre global : le tableau de
   * bord entier restreint à « Lead » perdrait l'entonnoir et les KPI, alors
   * que la question posée ici est « de quoi mes leads sont-ils faits »,
   * pendant que le reste de l'écran continue de parler de tout le pipeline.
   *
   * Une sélection vide vaut « toutes les étapes ouvertes ». C'est l'état par
   * défaut, et il doit être le plus court à écrire comme à lire.
   */
  const [etapesChoisies, setEtapesChoisies] = useState<string[]>([]);

  // Les étapes proposées : celles du pipeline ouvert. Filtrer sur « Close Won »
  // n'aurait rien à montrer, puisque le tableau écarte les affaires closes.
  const etapesOuvertes = dealStages.filter(
    (stage) => !weighting.pipelineStatuses.includes(stage.value),
  );

  const basculer = (value: string) =>
    setEtapesChoisies((actuelles) =>
      actuelles.includes(value)
        ? actuelles.filter((v) => v !== value)
        : [...actuelles, value],
    );

  const dealsFiltres =
    etapesChoisies.length === 0
      ? deals
      : deals.filter((deal) => etapesChoisies.includes(deal.stage ?? ""));

  const { lignes, arrTotal, countTotal } = computeArrParCategorie(
    dealsFiltres,
    dealCategories,
    dealStages,
    weighting.pipelineStatuses,
  );

  const resumeEtapes =
    etapesChoisies.length === 0
      ? "Toutes les étapes"
      : etapesChoisies.length === 1
        ? (etapesOuvertes.find((s) => s.value === etapesChoisies[0])?.label ??
          "1 étape")
        : `${etapesChoisies.length} étapes`;

  return (
    <Card className="p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">ARR par catégorie</h2>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrencyCompact(arrTotal)} ·{" "}
            {pluralize(
              countTotal,
              "opportunité ouverte",
              "opportunités ouvertes",
            )}
          </span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                aria-label="Filtrer par étape"
              >
                <ListFilter className="w-3.5 h-3.5" aria-hidden />
                {resumeEtapes}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              {/*
                « Toutes » remet à zéro plutôt que de cocher les six cases :
                une sélection vide et une sélection complète donnent le même
                tableau, et la première se lit sans compter.
              */}
              <button
                type="button"
                onClick={() => setEtapesChoisies([])}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
              >
                {etapesChoisies.length === 0 ? "✓ " : "  "}
                Toutes les étapes
              </button>
              {etapesOuvertes.map((stage) => {
                const actif = etapesChoisies.includes(stage.value);
                return (
                  <button
                    key={stage.value}
                    type="button"
                    onClick={() => basculer(stage.value)}
                    aria-pressed={actif}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2"
                  >
                    <span className="w-3">{actif ? "✓" : ""}</span>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background:
                          STAGE_COLORS[stage.value] ??
                          "var(--muted-foreground)",
                      }}
                      aria-hidden
                    />
                    {stage.label}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Aucune opportunité ouverte sur cette sélection.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lignes.map((ligne) => (
            <li key={ligne.category} className="flex items-center gap-2 min-w-0">
              {/*
                Le nom mène à la liste filtrée sur la catégorie — sauf pour
                « (non renseignée) », qui ne correspond à aucune valeur
                filtrable : un lien qui ouvrirait tout le pipeline mentirait
                sur ce qu'il promet.
              */}
              {ligne.category === SANS_CATEGORIE ? (
                <span className="text-xs w-32 shrink-0 truncate text-muted-foreground italic">
                  {ligne.label}
                </span>
              ) : (
                <Link
                  to={toDealsLink({
                    ...selectionFilter,
                    category: ligne.category,
                  })}
                  className="text-xs w-32 shrink-0 truncate hover:underline"
                  title={ligne.label}
                >
                  {ligne.label}
                </Link>
              )}

              {/*
                La barre empilée : chaque segment est une étape, sa largeur sa
                part du nombre d'opportunités. Pas de `gap` entre les segments,
                pour que l'ensemble se lise comme un tout de 100 %.
              */}
              <div
                className="flex-1 min-w-0 flex overflow-hidden bg-muted"
                style={{ height: "0.5rem", borderRadius: "var(--skin-bar-radius)" }}
                role="img"
                aria-label={ligne.parEtape
                  .map((p) => `${p.label} ${Math.round(p.pourcentage)} %`)
                  .join(", ")}
              >
                {ligne.parEtape.map((part) => (
                  <span
                    key={part.stage}
                    title={`${part.label} — ${part.count} sur ${ligne.count} (${Math.round(part.pourcentage)} %)`}
                    style={{
                      width: `${part.pourcentage}%`,
                      background:
                        STAGE_COLORS[part.stage] ?? "var(--muted-foreground)",
                    }}
                  />
                ))}
              </div>

              <span className="text-right shrink-0 w-24">
                <span className="block text-xs font-medium tabular-nums">
                  {formatCurrencyCompact(ligne.arr)}
                </span>
                <span className="block text-[0.65rem] text-muted-foreground tabular-nums leading-tight">
                  {Math.round(ligne.partArr)} % · {ligne.count}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/*
        La légende une seule fois, sous le tableau : la répéter par ligne
        tiendrait plus de place que les barres elles-mêmes.

        Elle ne liste que les étapes OUVERTES. Close Won, Lost et Churn y
        figuraient encore alors qu'aucune barre ne les emploie — le tableau
        écarte les affaires closes depuis l'origine. Une légende qui nomme des
        couleurs absentes du graphique fait chercher au lecteur ce qui n'y est
        pas (NOS-1428, signalé par Simon).
      */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 pt-2">
        {etapesOuvertes
          .filter((stage) => STAGE_COLORS[stage.value])
          .map((stage) => (
            <span
              key={stage.value}
              className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: STAGE_COLORS[stage.value] }}
                aria-hidden
              />
              {stage.label}
            </span>
          ))}
      </div>
    </Card>
  );
};
