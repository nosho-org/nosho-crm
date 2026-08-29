import { AlertTriangle } from "lucide-react";
import { useListContext, useRecordContext } from "ra-core";
import { DataTable } from "@/components/admin/data-table";
import { ReferenceField } from "@/components/admin/reference-field";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrency } from "../misc/formatCurrency";
import type { Deal } from "../types";
import { DealBulkEditStage } from "./DealBulkEditStage";
import { DealPriorityField } from "./DealPriorityField";
import {
  DealOpportunityTypeBadge,
  DealProductBadges,
} from "./shared/DealBadges";
import { getDealActivity, isOpenStage } from "./cockpit/dealFields";
import { parseISODateLocal, startOfToday } from "./cockpit/dealDates";
import { findDealLabel } from "./deal";
import { formatISODateString } from "./dealUtils";

/**
 * Row-by-row view of the opportunities (NOS-798, columns revised by NOS-956).
 *
 * Complements the Kanban board rather than replacing it: the toggle in
 * <DealListContent> switches between the two and remembers the choice.
 *
 * Ordre des colonnes, revu par Simon (NOS-1091) :
 *   Priorité | Date entrée | Catégorie | Société | Produit(s) | Étape | ARR |
 *   Responsable | Clôture prévue | Dernière activité
 *
 * MRR is deliberately gone — "ARR suffit et l'espace est plus utile pour
 * l'action commerciale". Dernière activité is not in the spec text but is in
 * the mockup, and it is what makes the dormancy alert legible from here.
 *
 * ---------------------------------------------------------------------------
 * Trois colonnes retirées, et ce que ça coûte
 * ---------------------------------------------------------------------------
 * « Prochaine action » et « Date prochaine action » partent : l'information
 * reste sur la fiche et dans l'alerte de santé du pipeline, elle n'avait pas
 * besoin de deux colonnes ici.
 *
 * « Opportunité » part aussi, à la demande de Simon. Deux conséquences à
 * connaître avant d'y toucher à nouveau :
 *
 *   1. La navigation survit. `rowClick="show"` ouvre l'opportunité depuis
 *      n'importe quel point de la ligne ; le nom n'en était pas le seul accès.
 *   2. Le nom, lui, disparaît de l'écran. En production 7 sociétés portent
 *      deux opportunités ouvertes ou plus — 14 lignes sur 116 où la société
 *      seule ne dit plus laquelle est laquelle. C'est un arbitrage assumé en
 *      faveur de la densité, pas un oubli.
 *
 * ---------------------------------------------------------------------------
 * Why every column carries a width (issue #124)
 * ---------------------------------------------------------------------------
 * The table used to lay out in `auto` mode, which sizes each column from the
 * content of the rows currently rendered. Filtering by stage changes the rows,
 * so it changed the geometry: measured on the demo dataset at a 1512 px
 * viewport, `stage=lead` overflowed by 4 px with everything on screen, while
 * `stage=qualified` overflowed by 63 px and pushed "Dernière activité" past
 * the scroll edge — and "Responsable" went from 98 px to 147 px on the way.
 * The reporter read that as columns appearing and disappearing depending on
 * the stage, which is exactly what it was.
 *
 * `table-fixed` plus a width on every column makes the layout a property of
 * the screen rather than of the rows: same columns, same widths, same scroll,
 * whatever the filter. Cells truncate instead of widening, and `min-w`
 * guarantees the headers stay readable on a narrow window — where the table
 * scrolls by the same amount for every stage.
 */

/**
 * Column widths, in pixels, summing to the table's `min-w`.
 *
 * Sized so each header fits without being clipped; the text-heavy columns get
 * whatever is left. Above the `min-w` the browser stretches them all
 * proportionally, which is still stage-independent.
 */
const COLUMN_WIDTHS = {
  priority: "w-[100px]",
  enteredAt: "w-[100px]",
  category: "w-[88px]",
  // En-tête « Type » et non « Type d'opportunité » (NOS-1093) : l'intitulé
  // complet réclamait 150 px pour trois valeurs qui en font 90. La colonne est
  // adjacente à « Catégorie », le sens se lit dans le contexte.
  opportunityType: "w-[112px]",
  /*
   * La plus large, et c'est nouveau (NOS-1091).
   *
   * Depuis que la colonne « Opportunité » est retirée, la société est le seul
   * texte qui identifie la ligne. Lui laisser les 116 px qu'elle avait quand
   * le nom l'accompagnait tronquerait la moitié des raisons sociales.
   */
  company: "w-[200px]",
  products: "w-[124px]",
  stage: "w-[84px]",
  amount: "w-[104px]",
  sales: "w-[108px]",
  // Un peu plus large que ses voisines : elle porte en plus le pictogramme
  // d'avertissement quand la date est dépassée (NOS-1091).
  closingDate: "w-[120px]",
  // Widest header of the lot, and it is last: anything narrower and the label
  // is the one thing clipped on an otherwise complete row.
  lastActivity: "w-[136px]",
} as const;

export const DealListTable = () => {
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  const { data } = useListContext<Deal>();

  if (!data?.length) return null;

  return (
    <DataTable
      rowClick="show"
      // Row selection is what makes the bulk stage change possible — the tool
      // the spec asks for to empty the "À reclasser" queue.
      bulkActionButtons={<DealBulkEditStage />}
      // <DataTable> puts its own className on the wrapper and renders <Table>
      // with no way through, so the layout lands on the nested table.
      //
      // 1276px = la somme exacte de `COLUMN_WIDTHS` après NOS-1093 :
      // 100 + 100 + 88 + 112 + 200 + 124 + 84 + 104 + 108 + 120 + 136. Ce
      // `min-w` doit suivre `COLUMN_WIDTHS` : c'est en le laissant en arrière
      // qu'#124 avait fait disparaître « Dernière activité » du bout de la
      // ligne.
      /*
       * `text-xs` sur toute la table (NOS-1094).
       *
       * `<Table>` pose `text-sm` à sa racine, dont toutes les cellules
       * héritaient — sauf la colonne Priorité et « Dernière activité », qui
       * rendaient déjà en `text-xs`. Deux tailles de texte sur une même ligne,
       * sans que la différence veuille dire quoi que ce soit.
       *
       * Le repère demandé est la colonne Priorité, donc `text-xs` partout.
       * Posé sur la table plutôt que colonne par colonne : une largeur oubliée
       * se voit, une taille de police oubliée beaucoup moins.
       *
       * Ce que ça ne touche pas, à dessein : les `font-medium` qui marquent une
       * alerte — clôture dépassée, opportunité en sommeil — et les pastilles
       * (produits, « manuel ») qui sont des marqueurs, pas du texte courant, au
       * même titre que la pastille de priorité. Harmoniser la taille n'est pas
       * effacer l'emphase qui porte un sens.
       *
       * Les en-têtes restent en `text-sm`, et c'est la seconde correction : une
       * colonne triable rend son intitulé dans un `<Button>` qui porte son
       * propre `text-sm`, tandis qu'une colonne sans tri — « Produit(s) » est
       * la seule — hérite de la table et se retrouvait donc plus petite que ses
       * voisines. La taille d'un en-tête ne doit pas dépendre de son caractère
       * triable.
       *
       * Un en-tête légèrement plus grand que le corps est le rapport qu'avait
       * déjà la colonne Priorité, prise ici pour repère : c'est son contenu qui
       * fait 12 px, pas son titre.
       */
      className="[&_table]:table-fixed [&_table]:min-w-[1276px] [&_table]:text-xs [&_thead_th]:text-sm"
    >
      <DataTable.Col
        source="entered_at"
        label="Date entrée"
        headerClassName={COLUMN_WIDTHS.enteredAt}
        cellClassName="truncate"
      >
        <DateField source="entered_at" />
      </DataTable.Col>
      <DataTable.Col
        source="priority_rank"
        label="Priorité"
        headerClassName={COLUMN_WIDTHS.priority}
      >
        <DealPriorityField />
      </DataTable.Col>
      <DataTable.Col
        source="opportunity_type"
        label="Type"
        headerClassName={COLUMN_WIDTHS.opportunityType}
        cellClassName="truncate"
      >
        <OpportunityTypeField />
      </DataTable.Col>
      <DataTable.Col
        source="category"
        label="Catégorie"
        headerClassName={COLUMN_WIDTHS.category}
        cellClassName="truncate"
      >
        <ChoiceField choices={dealCategories} source="category" />
      </DataTable.Col>
      {/*
        Le nom vient de la vue, pas d'une référence (NOS-1172).

        La colonne s'affichait vide alors que les 147 opportunités ouvertes ont
        toutes une société : le `ReferenceField` déclenchait un `getMany` sur
        `companies` dont le résultat n'arrivait pas jusqu'à la cellule.
        `deals_summary` expose déjà `company_name` — chaque ligne le porte
        donc, sans requête supplémentaire, et la colonne devient triable sur le
        nom au lieu de l'identifiant.
      */}
      <DataTable.Col
        source="company_name"
        label="Société"
        headerClassName={COLUMN_WIDTHS.company}
        cellClassName="truncate"
      />

      <DataTable.Col
        label="Produit(s)"
        headerClassName={COLUMN_WIDTHS.products}
        cellClassName="truncate"
      >
        <ProductsField />
      </DataTable.Col>
      <DataTable.Col
        source="stage"
        label="Étape"
        headerClassName={COLUMN_WIDTHS.stage}
        cellClassName="truncate"
      >
        <StageField stages={dealStages} />
      </DataTable.Col>
      <DataTable.Col
        source="amount"
        label="ARR"
        headerClassName={`text-right ${COLUMN_WIDTHS.amount}`}
        cellClassName="text-right tabular-nums truncate"
      >
        <ArrField currency={currency} />
      </DataTable.Col>
      <DataTable.Col
        source="sales_id"
        label="Responsable"
        headerClassName={COLUMN_WIDTHS.sales}
        cellClassName="truncate"
      >
        <ReferenceField source="sales_id" reference="sales" link={false} />
      </DataTable.Col>
      <DataTable.Col
        source="expected_closing_date"
        label="Clôture prévue"
        headerClassName={COLUMN_WIDTHS.closingDate}
        cellClassName="truncate"
      >
        <ClosingDateField />
      </DataTable.Col>
      <DataTable.Col
        source="last_activity_at"
        label="Dernière activité"
        headerClassName={COLUMN_WIDTHS.lastActivity}
        cellClassName="text-right truncate"
      >
        <LastActivityField />
      </DataTable.Col>
    </DataTable>
  );
};

/**
 * Products carried by the deal, in the shared badge style.
 *
 * `flex-nowrap` because the column has a fixed width now (issue #124): left to
 * wrap, a deal carrying all three products made its row twice as tall as its
 * neighbours. The badges clip instead, and the full list is one click away on
 * the deal page.
 */
const ProductsField = () => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return <DealProductBadges products={record.products} wrap={false} />;
};

/**
 * Date de clôture prévue, en rouge et signalée quand elle est passée
 * (NOS-1091).
 *
 * Deux précautions qui font toute la différence entre une alerte et du bruit :
 *
 * 1. **Seules les opportunités ouvertes sont signalées.** Une date de clôture
 *    dépassée sur une affaire gagnée, perdue ou en churn est le cours normal
 *    des choses : l'affaire s'est conclue, la date prévisionnelle n'a plus
 *    d'objet. La colorer en rouge apprendrait à ignorer le rouge.
 *
 * 2. **La couleur reste sur cette cellule.** Marc-Henri : « ne pas colorer
 *    toute la ligne ou toute la carte […] sans transformer le CRM en arc en
 *    ciel. » Le style ne doit pas être remonté sur la ligne.
 *
 * Le rouge et le pictogramme sont ceux de `DealBadges` — même sens, même
 * apparence. Deux rouges différents pour « en retard » sur un même écran, et
 * la convention ne veut plus rien dire.
 */
const ClosingDateField = () => {
  const record = useRecordContext<Deal>();
  const { dealPipelineStatuses } = useConfigurationContext();
  const value = record?.expected_closing_date;
  if (!value) return <span className="text-muted-foreground">–</span>;

  const date = parseISODateLocal(value);
  const isOverdue =
    date != null &&
    date < startOfToday() &&
    isOpenStage(record?.stage, dealPipelineStatuses);

  if (!isOverdue) return <span>{formatISODateString(value)}</span>;

  return (
    <span
      className="inline-flex items-center gap-1 text-[var(--deal-status-critical)] font-medium"
      title="Date de clôture prévue dépassée"
    >
      <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
      {formatISODateString(value)}
    </span>
  );
};

/** How long since anything happened — the dormancy signal, read at a glance. */
const LastActivityField = () => {
  const record = useRecordContext<Deal>();
  const { dealPipelineStatuses, dealInactivityAlertDays } =
    useConfigurationContext();
  if (!record) return null;
  const { daysSinceActivity, isStale } = getDealActivity(record, {
    pipelineStatuses: dealPipelineStatuses,
    thresholdDays: dealInactivityAlertDays,
    today: startOfToday(),
  });
  if (daysSinceActivity === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`text-xs tabular-nums ${isStale ? "text-[var(--deal-status-serious)] font-medium" : "text-muted-foreground"}`}
    >
      {daysSinceActivity} j
    </span>
  );
};

/**
 * Type d'opportunité — nouveau client, upsell, renouvellement, partenariat
 * (NOS-1093).
 *
 * Le tiret n'est pas rare : 109 opportunités sur 223 n'ont aucun type
 * renseigné en production. C'est l'état de la donnée, pas un défaut
 * d'affichage, et le montrer tel quel vaut mieux que d'inventer un défaut.
 */
const OpportunityTypeField = () => {
  const record = useRecordContext<Deal>();
  const { dealOpportunityTypes } = useConfigurationContext();
  const value = record?.opportunity_type;
  if (!value) return <span className="text-muted-foreground">–</span>;
  return (
    <DealOpportunityTypeBadge
      type={value}
      label={findDealLabel(dealOpportunityTypes, value) ?? value}
    />
  );
};

const StageField = ({
  stages,
}: {
  stages: { value: string; label: string }[];
}) => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return <span>{findDealLabel(stages, record.stage) ?? record.stage}</span>;
};

/**
 * La catégorie de l'opportunité.
 *
 * Le repli sur `legacy_category` a été retiré le 29/08/2026, avec la catégorie
 * « À reclasser » qui le déclenchait (issue #108).
 *
 * Il ne se justifiait que tant que ce placeholder existait. Et le conserver
 * serait devenu nuisible : les valeurs qu'il exhume — `copywriting`,
 * `print-project`, `ui-design` — sont celles du jeu de démonstration d'Atomic
 * CRM, restées en base avant la refonte v2. Elles n'ont jamais décrit ces
 * affaires ; les afficher sur un CHU serait pire que de n'afficher rien.
 *
 * `legacy_category` reste en base : les 25 opportunités concernées demeurent
 * identifiables par `category is null and legacy_category is not null`.
 */
const ChoiceField = ({
  choices,
  source,
}: {
  choices: { value: string; label: string }[];
  source: "category";
}) => {
  const record = useRecordContext<Deal>();
  const value = record?.[source];
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span>{choices.find((c) => c.value === value)?.label ?? value}</span>;
};

const ArrField = ({ currency }: { currency: string }) => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {formatCurrency(record.amount, currency)}
      <SuggestedArrIndicator />
    </span>
  );
};

const DateField = ({
  source,
}: {
  source: "expected_closing_date" | "entered_at";
}) => {
  const record = useRecordContext<Deal>();
  const value = record?.[source];
  if (!value) return <span className="text-muted-foreground">–</span>;
  return <span>{formatISODateString(value)}</span>;
};

/**
 * Marque l'ARR qui n'a PAS été saisi — l'inverse de ce que ce marqueur faisait.
 *
 * Il portait « manuel » sur les ARR saisis à la main. En production, 125 des
 * 147 opportunités ouvertes le sont : le badge apparaissait donc sur 85 % des
 * lignes, ce qui n'est plus un signal mais une texture. L'audit l'a relevé
 * comme du bruit, à juste titre.
 *
 * L'information intéressante est la minorité inverse : les 22 dont le montant
 * vient de la grille de préremplissage et que personne n'a confirmé. C'est
 * celle-là qu'un commercial doit repérer avant de bâtir un prévisionnel
 * dessus.
 */
export const SuggestedArrIndicator = ({
  className = "",
}: {
  className?: string;
}) => {
  const record = useRecordContext<Deal>();
  // Pas de montant, rien à qualifier : une case vide n'est ni saisie ni
  // estimée.
  if (record?.arr_is_manual || record?.amount == null) return null;
  return (
    <span
      title="Montant proposé par la grille de préremplissage — personne ne l'a confirmé"
      className={`text-[10px] font-medium leading-none text-muted-foreground border rounded px-1 py-0.5 ${className}`}
    >
      estimé
    </span>
  );
};
