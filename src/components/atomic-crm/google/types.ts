export interface GooglePreferences {
  showCalendarOnDashboard: boolean;
  showEmailsOnContact: boolean;
  showCalendarOnContact: boolean;
  syncContacts: boolean;
}

export const defaultGooglePreferences: GooglePreferences = {
  showCalendarOnDashboard: true,
  showEmailsOnContact: true,
  showCalendarOnContact: true,
  syncContacts: false,
};

export interface GoogleConnectionStatus {
  connected: boolean;
  email: string | null;
  scopes: string[];
  preferences: GooglePreferences;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  htmlLink?: string;
  status?: string;
  location?: string;
  organizer?: { email: string; displayName?: string; self?: boolean };
}

/**
 * La boîte d'où un message a été lu (NOS-1607).
 *
 * Le bloc « Mails » balaie désormais toutes les boîtes connectées de l'équipe,
 * et non plus la seule boîte de la personne qui regarde. Chaque ligne dit donc
 * d'où elle vient : sans cela, on lirait la correspondance d'un collègue en
 * croyant lire la sienne.
 */
export interface GoogleMailbox {
  salesId: number;
  name: string;
  email: string | null;
  /** Vrai quand c'est la boîte de la personne qui regarde. */
  own: boolean;
}

export interface GoogleEmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  internalDate: string;
  /** En-tête RFC `Message-ID`, la seule clé stable d'une boîte à l'autre. */
  messageId?: string;
  /**
   * Facultatif : une réponse servie avant le déploiement de NOS-1607 n'en
   * porte pas, et le cache de react-query peut en garder cinq minutes.
   */
  mailbox?: GoogleMailbox;
}

export interface GoogleEmailList {
  messages: GoogleEmailMessage[];
  nextPageToken: string | null;
  totalEstimate: number;
  /** Combien de boîtes ont été interrogées (NOS-1607). */
  boitesInterrogees?: number;
  /** Celles qui n'ont pas répondu, nommées plutôt que tues. */
  boitesEnPanne?: string[];
}
