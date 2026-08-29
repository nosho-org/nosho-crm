import type {
  CompanyType,
  DealPriority,
  DealPriorityValue,
  EstablishmentType,
} from "../types";
import type { ConfigurationContextValue } from "./ConfigurationContext";

export const defaultDarkModeLogo = "./appIcon/512.png";
export const defaultLightModeLogo = "./appIcon/512.png";

export const defaultCurrency = "EUR";

export const defaultTitle = "CRM";

export const defaultCompanySectors = [
  { value: "cabinet-liberal", label: "Cabinet libéral" },
  { value: "dentiste-orthodontiste", label: "Dentiste / Orthodontiste" },
  { value: "hopital-clinique", label: "Hôpital / Clinique" },
  { value: "radiologie-imagerie", label: "Radiologie / Imagerie" },
  { value: "centre-sante", label: "Centre de santé" },
  { value: "groupement-sante", label: "Groupement de santé" },
  { value: "editeur-logiciel", label: "Éditeur de logiciel" },
  { value: "integrateur-esn", label: "Intégrateur / ESN" },
  { value: "pharmacie", label: "Pharmacie" },
  { value: "centre-esthetique", label: "Centre esthétique" },
  { value: "autre", label: "Autre" },
];

/**
 * The commercial pipeline (NOS-956): seven stages, plus a reclassification
 * queue in front and churn at the back.
 *
 * `a-reclasser` holds the deals the v2 migration could not map with certainty.
 * The spec forbids guessing, so they wait here for a human rather than landing
 * in an arbitrary column. Once the queue is empty the stage can be removed.
 *
 * `churn` stays a stage: it is terminal and still counted in lost ARR, it is
 * only hidden from the board ("je garderais Churn hors de ce Kanban").
 *
 * `lead`, `qualified` and `closed-won` keep the slugs they already had in
 * production, so most rows were never rewritten.
 */
export const defaultDealStages = [
  // « À reclasser » a quitté le pipeline le 29/08/2026, à la demande de Simon,
  // et rejoint `archivedDealStages` ci-dessous. C'était la file d'attente de la
  // refonte v2 ; elle a été vidée, et la production n'y comptait plus aucune
  // opportunité au moment du retrait.
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualifié" },
  { value: "demo-poc", label: "Démo / POC" },
  { value: "proposal", label: "Proposition" },
  { value: "negociation", label: "Négociation" },
  { value: "closed-won", label: "Close Won" },
  { value: "lost", label: "Lost" },
  { value: "churn", label: "Churn" },
];

/**
 * Stages retired by the v2 migration, kept so their labels stay resolvable.
 *
 * Two consumers, both mandatory:
 *   * `deals.legacy_stage` on every migrated deal;
 *   * the `visibleStages` of the investisseur / partenaire custom views, which
 *     still point at these slugs. A board that resolves its columns from
 *     `defaultDealStages` alone renders those two views empty.
 *
 * The slugs are the ones actually found in the stored configuration on
 * 2026-08-23, accents and encoding accidents included (`d-mo-rdv` really is
 * "Démo booked", `poc-lanc` really is "POC lancé").
 */
export const archivedDealStages = [
  // Retirée du pipeline le 29/08/2026 : conservée ici pour que son libellé
  // reste résoluble si un enregistrement égaré la porte encore, plutôt que
  // d'afficher son slug brut.
  { value: "a-reclasser", label: "À reclasser" },
  { value: "logiciels-brique", label: "Logiciels (brique)" },
  { value: "declined", label: "Décliné" },
  { value: "follow-up", label: "Follow up" },
  { value: "trial", label: "Essai" },
  { value: "trial-failed", label: "Essai échoué" },
  { value: "d-mo-rdv", label: "Démo booked" },
  { value: "poc-lanc", label: "POC lancé" },
  { value: "proposition-a-envoyer", label: "Proposition à envoyer" },
  { value: "proposition-envoy-e", label: "Proposition envoyée" },
  { value: "proposal-to-send", label: "Proposition à envoyer (ancien slug)" },
  { value: "perdu", label: "Perdu" },
  { value: "opportunity", label: "Opportunity" },
  { value: "partenariats", label: "Partenariats" },
  { value: "ressources", label: "Ressources" },
  { value: "invest", label: "Invests potentiel" },
  { value: "communication-presse", label: "Communication / presse" },
  { value: "invests-actifs", label: "Invests actifs" },
];

/**
 * Stages that leave the pipeline, mapped to the stage carrying the same
 * commercial meaning. Mirrors `deal_migration_map` in the database.
 *
 * A slug absent from this map has no certain equivalent: the migration parks it
 * in `a-reclasser` rather than inventing one. `logiciels-brique` and
 * `opportunity` are deliberately missing for that reason.
 *
 * The original value is kept in `deals.legacy_stage`, so the mapping stays
 * fully reversible and no historical information is destroyed.
 */
export const legacyDealStages: Record<string, string> = {
  // Retired by the v2 migration (NOS-956).
  perdu: "lost", // renamed
  "d-mo-rdv": "demo-poc", // labelled "Démo booked"
  "poc-lanc": "demo-poc", // labelled "POC lancé"
  "proposition-a-envoyer": "proposal", // merged, per the spec's mapping table
  "proposition-envoy-e": "proposal", // merged, per the spec's mapping table
  "proposal-to-send": "proposal", // orphan slug from 20260820150000
  // Retired earlier, by 20260820150000. Kept so a row that somehow still
  // carries one is handled rather than parked.
  "follow-up": "qualified", // Suivi — still being nurtured after qualification
  "rdv-prix": "demo-poc", // Rendez-vous prix — a meeting is booked
  trial: "proposal", // Essai — demo done, proposal is the next step
  "trial-failed": "lost", // Essai échoué
  declined: "lost", // Décliné
};

/**
 * Terminal stages: a deal sitting there is no longer moving through the
 * pipeline, and its ARR must not be counted as open.
 *
 * Production stored `["closed-won"]` until 20260823093000, which counted 59
 * lost deals (415 770 €) and 3 churned ones as open pipeline.
 */
export const defaultDealPipelineStatuses = ["closed-won", "lost", "churn"];

/**
 * Commercial priority, shown as P0 / P1 / P2 (NOS-956, NOS-957).
 *
 * Labels only — the slugs stay `urgent` / `important` / `normal`, which is what
 * the `deals_priority_check` constraint and the generated `priority_rank`
 * column already enforce. Renaming them would mean dropping a constraint and
 * rewriting a stored generated column to change three strings on screen.
 *
 * Listed most urgent first, so the filter bar reads P0 → P1 → P2.
 */
export const defaultDealPriorities: DealPriority[] = [
  {
    value: "urgent",
    label: "P0 Critique",
    dotClassName: "bg-red-500",
    weight: 2,
  },
  {
    value: "important",
    label: "P1 Élevée",
    // Bleu et non orange (NOS-1067) : dans ce CRM l'orange veut déjà dire
    // « quelque chose ne va pas » — inactivité, alerte, échéance dépassée. Une
    // affaire P1 n'est pas en difficulté, elle est importante. Deux sens sur
    // une même teinte, et on ne sait plus lequel on lit.
    dotClassName: "bg-blue-500",
    weight: 1,
  },
  {
    value: "normal",
    label: "P2 Normale",
    // Gris volontairement pâle : le cas courant ne doit pas attirer l'œil, ce
    // sont les deux autres qui doivent ressortir.
    dotClassName: "bg-muted-foreground/40",
    weight: 0,
  },
];

export const defaultDealPriority: DealPriorityValue = "normal";

/**
 * Products an opportunity can cover (NOS-956 filter, NOS-957 header).
 *
 * Multi-select: a deal can carry several at once, stored in `deals.products`.
 * The colours are imposed by the mockups — green / blue / violet.
 */
export const defaultDealProducts = [
  { value: "no-show", label: "No-show" },
  { value: "entrant", label: "Entrant" },
  { value: "data", label: "Data" },
];

export const defaultLeadSources = [
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "recommandation", label: "Recommandation" },
  { value: "partenaire", label: "Partenaire" },
  { value: "salon", label: "Salon / Événement" },
  { value: "site-web", label: "Site web" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "autre", label: "Autre" },
];

/** ARR grid driving the suggested amount on a deal. Editable in the settings. */
export const defaultEstablishmentTypes: EstablishmentType[] = [
  { value: "cabinet", label: "Cabinet", arr: 800 },
  { value: "clinique", label: "Clinique", arr: 5000 },
  { value: "hopital", label: "Hôpital", arr: 15000 },
];

/** Issue #94 asks for an inactivity alert after "X jours"; X defaults to 14. */
export const defaultDealInactivityAlertDays = 14;

/**
 * Win probability per stage, in percent, weighting the revenue forecast.
 *
 * Seeded (NOS-955): the dashboard's weighted-pipeline KPI and the violet
 * forecast series would otherwise read "à configurer" on day one. These are
 * conventional defaults meant to be tuned in the settings, not measured rates.
 *
 * Terminal stages are deliberately absent. Won and lost are facts, not
 * forecasts, and the weighting cascade resolves them before it ever reads this
 * map — listing them here would suggest a signed deal is 100 % *likely*
 * rather than simply signed.
 */
/**
 * Probabilité de gain par étape, en pourcentage (NOS-1066).
 *
 * Ne figurent ici que les étapes **ouvertes**. Les trois autres n'ont pas leur
 * place dans une grille d'estimation :
 *
 *   - `closed-won` et `lost` / `churn` sont des faits, pas des paris.
 *     `getDealProbability` les tranche avant de consulter cette grille — 100 %
 *     et 0 % — et une entrée ici serait morte tout en laissant croire qu'on
 *     peut les régler.
 *   - `a-reclasser` est délibérément absente : sans valeur, l'opportunité est
 *     déclarée *non pondérable* et sort des totaux. Un 0 % explicite, lui, la
 *     ferait compter comme une affaire estimée sans valeur — ce n'est pas la
 *     même chose que « on ne sait pas encore ce que c'est ».
 */
export const defaultDealStageProbabilities: Record<string, number> = {
  lead: 10,
  qualified: 20,
  "demo-poc": 40,
  proposal: 70,
  negociation: 85,
};

/**
 * Monthly recurring revenue target, in euros, for the dashboard KPI (NOS-955).
 *
 * Compared against the cumulated MRR of signed deals. Note that this is
 * bookings, not live MRR: the CRM holds no contract-termination data, so a
 * churned client still counts. The KPI is labelled accordingly.
 */
export const defaultMrrTarget = 25000;

/** Issue #92: next action becomes mandatory from the "Qualifié" stage. */
export const defaultDealNextActionFromStage = "qualified";

/**
 * Client categories (NOS-956): seven, down from twenty.
 *
 * The twenty healthcare specialities they replace were never used — production
 * held four values, all residue from the upstream Atomic CRM demo fixture
 * (print-project, ui-design, other, copywriting), on 72 of 232 deals.
 *
 * Elles ont d'abord été parquées dans un placeholder « À reclasser », retiré le
 * 29/08/2026 à la demande de Simon : les 25 opportunités qui le portaient
 * encore sont passées sans catégorie. Leur `legacy_category` ne pouvait pas
 * servir de repli — c'étaient les valeurs de démo ci-dessus, et « copywriting »
 * n'a jamais décrit un CHU. « Aucune catégorie » dit la vérité ; « Autre »
 * aurait affirmé un classement que personne n'a fait.
 */
export const defaultDealCategories = [
  { value: "hopital", label: "Hôpital" },
  { value: "imagerie", label: "Imagerie" },
  { value: "dentaire", label: "Dentaire" },
  { value: "clinique", label: "Clinique" },
  { value: "esthetique", label: "Esthétique" },
  { value: "cabinet", label: "Cabinet" },
  // NOS-1090. Avant « Autre », qui reste le fourre-tout et se lit mieux en
  // dernier. À ne pas confondre avec le *type de société* `partenaire`, qui
  // sert lui à exclure une opportunité du pipeline commercial : ici c'est une
  // catégorie de clientèle, au même titre que « Dentaire » ou « Hôpital ».
  { value: "partenaire", label: "Partenaire" },
  { value: "autre", label: "Autre" },
];

/**
 * Categories retired by the migration above, kept so a deal still carrying one
 * in `legacy_category` renders its real label instead of a raw slug.
 */
export const archivedDealCategories = [
  { value: "angiologue", label: "Angiologue" },
  { value: "api", label: "API" },
  { value: "cardiologue", label: "Cardiologue" },
  { value: "centre-dentaire", label: "Centre dentaire" },
  { value: "centre-esthetique", label: "Centre esthétique" },
  { value: "chirurgien", label: "Chirurgien" },
  { value: "dentiste", label: "Dentiste" },
  { value: "dermatologue", label: "Dermatologue" },
  { value: "entreprise", label: "Entreprise" },
  { value: "groupement", label: "Groupement" },
  { value: "institut", label: "Institut" },
  { value: "maison-de-sante", label: "Maison de santé" },
  { value: "medecin", label: "Médecin" },
  { value: "nephrologue", label: "Néphrologue" },
  { value: "ophtalmo", label: "Ophtalmo" },
  { value: "orthodontiste", label: "Orthodontiste" },
  { value: "pediatre", label: "Pédiatre" },
  { value: "radiologie", label: "Radiologie" },
  // Demo fixture residue found in production.
  { value: "print-project", label: "Print project" },
  { value: "ui-design", label: "UI design" },
  { value: "copywriting", label: "Copywriting" },
  { value: "other", label: "Other" },
];

/**
 * Growth source of an opportunity (issue #95).
 *
 * This qualifies the *deal*, not the company: the same establishment can be a
 * new client first, then generate an extension, then a renewal. Do not confuse
 * it with `companyTypes`, which only selects the pipeline view a deal shows in.
 */
export const defaultDealOpportunityTypes = [
  { value: "nouveau-client", label: "Nouveau client" },
  // PJ1 of NOS-957 labels this slug "Upsell". Label change only.
  { value: "extension", label: "Upsell" },
  { value: "renouvellement", label: "Renouvellement" },
  /*
   * NOS-1093. Le choisir range l'opportunité dans la catégorie « Partenaire » :
   * la règle vit dans `DealOpportunityTypeInput`, et les deux slugs sont nommés
   * dans `dealUtils` (`PARTNERSHIP_OPPORTUNITY_TYPE`, `PARTNER_DEAL_CATEGORY`).
   */
  { value: "partenariat", label: "Partenariat" },
];

/**
 * Decision-making role of a contact on a given opportunity (issue #99).
 *
 * Stored on the deal↔contact relation (`deals.contact_roles`), never on the
 * contact itself: a person can decide on one deal and only influence another.
 */
export const defaultDealContactRoles = [
  { value: "decideur", label: "Décideur" },
  { value: "influenceur", label: "Influenceur" },
  { value: "prescripteur", label: "Prescripteur" },
  { value: "utilisateur", label: "Utilisateur" },
];

/**
 * `operationnel` has no obvious equivalent among the four roles above.
 * "Utilisateur" is close but would be a guess, so the value is archived rather
 * than rewritten: already-saved roles keep resolving, and the next person to
 * edit the deal picks from the new list.
 */
export const archivedDealContactRoles = [
  { value: "operationnel", label: "Opérationnel (retiré)" },
];

/**
 * Company types. `commercial: false` keeps the type out of the Opportunités
 * board and out of the ARR aggregates while leaving its own view untouched.
 * An absent flag means commercial, so older stored configurations keep working.
 */
export const defaultCompanyTypes: CompanyType[] = [
  { value: "client", label: "Client" },
  { value: "prospect", label: "Prospect" },
  { value: "investisseur", label: "Investisseur", commercial: false },
  { value: "partenaire", label: "Partenariat", commercial: false },
  { value: "ressource", label: "Ressource", commercial: false },
  { value: "presse", label: "Presse", commercial: false },
  { value: "leads-santexpo", label: "Leads Santexpo", commercial: false },
  { value: "logiciels-brique", label: "Logiciels brique", commercial: false },
];

export const defaultNoteStatuses = [
  { value: "cold", label: "Froid", color: "#7dbde8" },
  { value: "warm", label: "Tiède", color: "#e8cb7d" },
  { value: "hot", label: "Chaud", color: "#e88b7d" },
  { value: "in-contract", label: "Signé", color: "#a4e87d" },
];

export const defaultTaskTypes = [
  { value: "none", label: "Sans type" },
  { value: "email", label: "Email" },
  { value: "demo", label: "Démo" },
  { value: "lunch", label: "Déjeuner" },
  { value: "meeting", label: "Réunion" },
  { value: "follow-up", label: "Suivi" },
  { value: "thank-you", label: "Remerciement" },
  { value: "ship", label: "Livraison" },
  { value: "call", label: "Appel" },
];

export const defaultConfiguration: ConfigurationContextValue = {
  companySectors: defaultCompanySectors,
  companyTypes: defaultCompanyTypes,
  currency: defaultCurrency,
  customViews: [],
  dealCategories: defaultDealCategories,
  archivedDealCategories,
  dealContactRoles: defaultDealContactRoles,
  archivedDealContactRoles,
  dealOpportunityTypes: defaultDealOpportunityTypes,
  dealProducts: defaultDealProducts,
  dealPipelineStatuses: defaultDealPipelineStatuses,
  dealPriorities: defaultDealPriorities,
  dealStages: defaultDealStages,
  archivedDealStages,
  establishmentTypes: defaultEstablishmentTypes,
  leadSources: defaultLeadSources,
  dealInactivityAlertDays: defaultDealInactivityAlertDays,
  dealStageProbabilities: defaultDealStageProbabilities,
  dealNextActionFromStage: defaultDealNextActionFromStage,
  mrrTarget: defaultMrrTarget,
  noteStatuses: defaultNoteStatuses,
  taskTypes: defaultTaskTypes,
  title: defaultTitle,
  darkModeLogo: defaultDarkModeLogo,
  lightModeLogo: defaultLightModeLogo,
};
