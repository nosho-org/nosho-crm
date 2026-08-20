import type { Identifier } from "ra-core";

import type { DealContactRoles, LabeledValue } from "../types";

/**
 * Helpers around `deals.contact_roles` — the decision-making role each contact
 * plays **on a given opportunity** (issue #99).
 *
 * The map is keyed by contact id serialised as a string, because that is how
 * JSON object keys come back from PostgREST. Everything here normalises ids so
 * callers can pass either a number or a string.
 */

const toKey = (contactId: Identifier): string => String(contactId);

/** Role of a contact on a deal, or `undefined` when none has been set. */
export const getContactRole = (
  roles: DealContactRoles | null | undefined,
  contactId: Identifier,
): string | undefined => {
  const role = roles?.[toKey(contactId)];
  return role ? role : undefined;
};

/** Label to display for a role value, falling back to the raw value. */
export const getContactRoleLabel = (
  choices: LabeledValue[],
  role: string | undefined,
): string | undefined => {
  if (!role) return undefined;
  return choices.find((choice) => choice.value === role)?.label ?? role;
};

/** Immutably set (or clear, when `role` is empty) one contact's role. */
export const setContactRole = (
  roles: DealContactRoles | null | undefined,
  contactId: Identifier,
  role: string | null | undefined,
): DealContactRoles => {
  const next = { ...(roles ?? {}) };
  if (role) {
    next[toKey(contactId)] = role;
  } else {
    delete next[toKey(contactId)];
  }
  return next;
};

/**
 * Drop roles that no longer correspond to a contact linked to the deal, and
 * drop empty values.
 *
 * Called before saving so removing a contact from an opportunity does not leave
 * an orphan role behind that would silently come back if the contact is added
 * again later.
 */
export const sanitizeContactRoles = (
  roles: DealContactRoles | null | undefined,
  contactIds: Identifier[] | null | undefined,
): DealContactRoles => {
  if (!roles) return {};
  const allowed = new Set((contactIds ?? []).map(toKey));
  return Object.entries(roles).reduce<DealContactRoles>(
    (acc, [contactId, role]) => {
      if (role && allowed.has(contactId)) {
        acc[contactId] = role;
      }
      return acc;
    },
    {},
  );
};

/**
 * Carry a contact's role over when that contact is merged into another one.
 *
 * The winner keeps its own role when it already has one on the deal — an
 * explicit choice always beats an inherited one.
 */
export const transferContactRole = (
  roles: DealContactRoles | null | undefined,
  loserId: Identifier,
  winnerId: Identifier,
): DealContactRoles => {
  const next = { ...(roles ?? {}) };
  const loserRole = next[toKey(loserId)];
  delete next[toKey(loserId)];
  if (loserRole && !next[toKey(winnerId)]) {
    next[toKey(winnerId)] = loserRole;
  }
  return next;
};
