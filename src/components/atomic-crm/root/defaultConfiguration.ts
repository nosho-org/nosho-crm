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

export const defaultTitle = "Nosho CRM";

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
 * The canonical commercial pipeline (8 stages).
 *
 * Values are deliberately conservative: `lead`, `qualified`, `closed-won` and
 * `perdu` keep the slugs they already had in production so that the vast
 * majority of rows need no data migration at all.
 */
export const defaultDealStages = [
  { value: "lead", label: "Leads" },
  { value: "qualified", label: "Qualifiés" },
  { value: "demo-booked", label: "Démo booked" },
  { value: "proposal-to-send", label: "Proposition à envoyer" },
  { value: "proposal-sent", label: "Proposition envoyée" },
  { value: "closed-won", label: "Contrat signé" },
  { value: "perdu", label: "Perdu" },
  { value: "churn", label: "Churn" },
];

/**
 * Stages that leave the canonical pipeline, mapped to the canonical stage that
 * carries the same commercial meaning.
 *
 * The original value is kept in `deals.legacy_stage` by the migration, so the
 * mapping is fully reversible: no historical information is destroyed.
 */
export const legacyDealStages: Record<string, string> = {
  "follow-up": "qualified", // Suivi — still being nurtured after qualification
  "rdv-prix": "demo-booked", // Rendez-vous prix — a meeting is booked
  trial: "proposal-to-send", // Essai — demo done, proposal is the next step
  "trial-failed": "perdu", // Essai échoué — a lost deal
  declined: "perdu", // Décliné — a lost deal
};

/** Terminal stages: a deal sitting there is no longer moving through the pipeline. */
export const defaultDealPipelineStatuses = ["closed-won", "perdu", "churn"];

export const defaultDealPriorities: DealPriority[] = [
  {
    value: "normal",
    label: "Normal",
    dotClassName: "bg-muted-foreground/40",
    weight: 0,
  },
  {
    value: "important",
    label: "Important",
    dotClassName: "bg-amber-500",
    weight: 1,
  },
  { value: "urgent", label: "Urgent", dotClassName: "bg-red-500", weight: 2 },
];

export const defaultDealPriority: DealPriorityValue = "normal";

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
 * Intentionally empty: no stage carries a win probability until the team sets
 * one. The revenue cockpit then shows the weighted figures as "à configurer"
 * instead of presenting a made-up forecast as if it came from the data.
 */
export const defaultDealStageProbabilities: Record<string, number> = {};

/** Issue #92: next action becomes mandatory from the "Qualifié" stage. */
export const defaultDealNextActionFromStage = "qualified";

export const defaultDealCategories = [
  { value: "angiologue", label: "Angiologue" },
  { value: "api", label: "API" },
  { value: "cardiologue", label: "Cardiologue" },
  { value: "centre-dentaire", label: "Centre dentaire" },
  { value: "centre-esthetique", label: "Centre esthétique" },
  { value: "chirurgien", label: "Chirurgien" },
  { value: "dentiste", label: "Dentiste" },
  { value: "dermatologue", label: "Dermatologue" },
  { value: "entreprise", label: "Entreprise" },
  { value: "esthetique", label: "Esthétique" },
  { value: "groupement", label: "Groupement" },
  { value: "hopital", label: "Hôpital" },
  { value: "institut", label: "Institut" },
  { value: "maison-de-sante", label: "Maison de santé" },
  { value: "medecin", label: "Médecin" },
  { value: "nephrologue", label: "Néphrologue" },
  { value: "ophtalmo", label: "Ophtalmo" },
  { value: "orthodontiste", label: "Orthodontiste" },
  { value: "pediatre", label: "Pédiatre" },
  { value: "radiologie", label: "Radiologie" },
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
  { value: "extension", label: "Extension client existant" },
  { value: "renouvellement", label: "Renouvellement" },
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
  { value: "operationnel", label: "Opérationnel" },
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
  dealContactRoles: defaultDealContactRoles,
  dealOpportunityTypes: defaultDealOpportunityTypes,
  dealPipelineStatuses: defaultDealPipelineStatuses,
  dealPriorities: defaultDealPriorities,
  dealStages: defaultDealStages,
  establishmentTypes: defaultEstablishmentTypes,
  leadSources: defaultLeadSources,
  dealInactivityAlertDays: defaultDealInactivityAlertDays,
  dealStageProbabilities: defaultDealStageProbabilities,
  dealNextActionFromStage: defaultDealNextActionFromStage,
  noteStatuses: defaultNoteStatuses,
  taskTypes: defaultTaskTypes,
  title: defaultTitle,
  darkModeLogo: defaultDarkModeLogo,
  lightModeLogo: defaultLightModeLogo,
};
