import {
  getContactRole,
  getContactRoleLabel,
  sanitizeContactRoles,
  setContactRole,
  transferContactRole,
} from "./dealContactRoles";

const ROLE_CHOICES = [
  { value: "decideur", label: "Décideur" },
  { value: "influenceur", label: "Influenceur" },
  { value: "operationnel", label: "Opérationnel" },
];

describe("getContactRole", () => {
  it("reads a role stored under a string key with a numeric contact id", () => {
    // PostgREST returns jsonb object keys as strings, react-admin ids as numbers.
    expect(getContactRole({ "12": "decideur" }, 12)).toBe("decideur");
    expect(getContactRole({ "12": "decideur" }, "12")).toBe("decideur");
  });

  it("returns undefined when the contact has no role, or there are no roles", () => {
    expect(getContactRole({ "12": "decideur" }, 34)).toBeUndefined();
    expect(getContactRole({}, 12)).toBeUndefined();
    expect(getContactRole(null, 12)).toBeUndefined();
    expect(getContactRole(undefined, 12)).toBeUndefined();
  });

  it("treats an empty stored role as no role", () => {
    expect(getContactRole({ "12": "" }, 12)).toBeUndefined();
  });
});

describe("getContactRoleLabel", () => {
  it("resolves the configured label", () => {
    expect(getContactRoleLabel(ROLE_CHOICES, "influenceur")).toBe(
      "Influenceur",
    );
  });

  it("falls back to the raw value for a role removed from the configuration", () => {
    expect(getContactRoleLabel(ROLE_CHOICES, "prescripteur")).toBe(
      "prescripteur",
    );
  });

  it("returns undefined when there is no role", () => {
    expect(getContactRoleLabel(ROLE_CHOICES, undefined)).toBeUndefined();
  });
});

describe("setContactRole", () => {
  it("sets a role without mutating the original map", () => {
    const roles = { "12": "decideur" };
    const next = setContactRole(roles, 34, "influenceur");
    expect(next).toEqual({ "12": "decideur", "34": "influenceur" });
    expect(roles).toEqual({ "12": "decideur" });
  });

  it("clears the role when passed an empty value", () => {
    expect(setContactRole({ "12": "decideur" }, 12, null)).toEqual({});
    expect(setContactRole({ "12": "decideur" }, 12, "")).toEqual({});
  });

  it("starts from an empty map when the deal has no roles yet", () => {
    expect(setContactRole(undefined, 12, "decideur")).toEqual({
      "12": "decideur",
    });
  });
});

describe("sanitizeContactRoles", () => {
  it("drops roles of contacts no longer linked to the deal", () => {
    expect(
      sanitizeContactRoles({ "12": "decideur", "34": "influenceur" }, [12]),
    ).toEqual({ "12": "decideur" });
  });

  it("drops empty roles", () => {
    expect(sanitizeContactRoles({ "12": "" }, [12])).toEqual({});
  });

  it("returns an empty map when there are no contacts left", () => {
    expect(sanitizeContactRoles({ "12": "decideur" }, [])).toEqual({});
    expect(sanitizeContactRoles({ "12": "decideur" }, undefined)).toEqual({});
  });

  it("matches numeric contact ids against string keys", () => {
    expect(sanitizeContactRoles({ "12": "decideur" }, ["12"])).toEqual({
      "12": "decideur",
    });
  });

  it("keeps everything when every contact is still linked", () => {
    const roles = { "12": "decideur", "34": "operationnel" };
    expect(sanitizeContactRoles(roles, [12, 34])).toEqual(roles);
  });
});

describe("transferContactRole", () => {
  it("moves the loser's role onto the winner when merging contacts", () => {
    expect(transferContactRole({ "12": "decideur" }, 12, 34)).toEqual({
      "34": "decideur",
    });
  });

  it("keeps the winner's own role rather than overwriting it", () => {
    expect(
      transferContactRole({ "12": "decideur", "34": "operationnel" }, 12, 34),
    ).toEqual({ "34": "operationnel" });
  });

  it("leaves other contacts untouched", () => {
    expect(
      transferContactRole({ "12": "decideur", "56": "influenceur" }, 12, 34),
    ).toEqual({ "34": "decideur", "56": "influenceur" });
  });

  it("is a no-op when the loser had no role", () => {
    expect(transferContactRole({ "56": "influenceur" }, 12, 34)).toEqual({
      "56": "influenceur",
    });
  });
});
