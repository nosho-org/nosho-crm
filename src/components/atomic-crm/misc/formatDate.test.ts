import {
  NO_DATE,
  formatDate,
  formatDateTime,
  formatRelativeShort,
  formatTime,
  isDateOnly,
} from "./formatDate";

/**
 * Les trois défauts que l'audit du 29 août 2026 a relevés, chacun couvert par
 * un test — parce qu'ils sont revenus une fois déjà, et qu'ils reviennent
 * silencieusement : une date mal formatée ne casse rien, elle se lit mal.
 */

describe("formatDate", () => {
  it("écrit en français, jamais en anglais", () => {
    // « Sep 30, 2026 » sur la fiche opportunité : `date-fns` sans locale
    // retombe sur en-US.
    expect(formatDate("2026-09-30")).toBe("30 sept. 2026");
  });

  it("ne décale pas le jour, quel que soit le fuseau du poste", () => {
    // Une colonne `date` lue telle quelle est interprétée en UTC et bascule
    // au jour précédent à l'ouest de Greenwich.
    expect(formatDate("2026-01-01")).toBe("1 janv. 2026");
    expect(formatDate("2026-12-31")).toBe("31 déc. 2026");
  });

  it("écrit un tiret plutôt que « Invalid Date »", () => {
    expect(formatDate(null)).toBe(NO_DATE);
    expect(formatDate("")).toBe(NO_DATE);
    expect(formatDate("pas une date")).toBe(NO_DATE);
  });
});

describe("isDateOnly", () => {
  it("reconnaît une colonne date", () => {
    expect(isDateOnly("2026-09-05")).toBe(true);
  });

  it("reconnaît un horodatage à minuit UTC, écrit par un sélecteur de jour", () => {
    // Le « Sep 5, 2026 · 2:00 AM » de l'audit : minuit UTC rendu à Paris.
    expect(isDateOnly("2026-09-05T00:00:00Z")).toBe(true);
  });

  it("laisse son heure à un vrai rendez-vous", () => {
    expect(isDateOnly("2026-09-05T09:52:00Z")).toBe(false);
  });
});

describe("formatDateTime", () => {
  it("n'invente pas une heure que personne n'a saisie", () => {
    // Le défaut le plus coûteux des trois : lire « rendez-vous à 2h du matin »
    // fait cesser de croire l'écran.
    expect(formatDateTime("2026-09-05T00:00:00Z")).toBe("5 sept. 2026");
    expect(formatDateTime("2026-09-05")).toBe("5 sept. 2026");
  });

  it("affiche l'heure quand elle existe, sans les secondes", () => {
    const rendered = formatDateTime("2026-08-26T07:52:00Z");
    // 07:52 UTC = 09:52 à Paris en été.
    expect(rendered).toContain("09:52");
    expect(rendered).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe("formatTime", () => {
  it("convertit en Europe/Paris, et non dans le fuseau du poste", () => {
    expect(formatTime("2026-08-26T07:52:00Z")).toBe("09:52");
    // Hiver : +1 et non +2. Le fuseau est nommé, pas un décalage figé.
    expect(formatTime("2026-01-26T07:52:00Z")).toBe("08:52");
  });
});

describe("formatRelativeShort", () => {
  const now = new Date("2026-08-29T10:00:00Z");

  it("nomme les trois jours qu'on nomme en parlant", () => {
    expect(formatRelativeShort("2026-08-29T08:00:00Z", now)).toBe(
      "aujourd'hui",
    );
    expect(formatRelativeShort("2026-08-28T08:00:00Z", now)).toBe("hier");
    expect(formatRelativeShort("2026-08-30T08:00:00Z", now)).toBe("demain");
  });

  it("compte en jours de calendrier, pas en tranches de 24 heures", () => {
    // 23h hier et 1h aujourd'hui sont à deux heures l'une de l'autre, et
    // pourtant sur deux jours. 21:30 UTC = 23:30 à Paris, donc bien hier.
    expect(formatRelativeShort("2026-08-28T21:30:00Z", now)).toBe("hier");
  });

  it("repasse en date absolue au-delà d'une semaine", () => {
    // « il y a 4 mois » demande un calcul mental pour être rapproché d'autre
    // chose ; une date se compare directement.
    expect(formatRelativeShort("2026-04-02", now)).toBe("2 avr. 2026");
  });
});
