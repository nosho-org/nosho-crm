import { useGetIdentity } from "ra-core";

/**
 * `sales.first_name` defaults to this until the invited user completes signup.
 * Greeting somebody "Bonjour Pending" is worse than not greeting them at all.
 */
const PLACEHOLDER_FIRST_NAME = "Pending";

/**
 * First name of the signed-in user, read from their own profile (issue #98).
 *
 * Always resolves from the `sales` row behind `getIdentity` — never from a
 * constant. Returns `undefined` while the identity is loading, when the profile
 * still holds the placeholder name, or when there is simply nothing to show, so
 * callers can fall back to a neutral, name-free wording instead of inventing a
 * name.
 */
export const useUserFirstName = (): string | undefined => {
  const { identity } = useGetIdentity();
  if (!identity) return undefined;

  const firstName = (identity as { firstName?: string }).firstName?.trim();
  const resolved =
    firstName || identity.fullName?.trim().split(/\s+/)[0]?.trim();

  if (!resolved || resolved === PLACEHOLDER_FIRST_NAME) return undefined;
  return resolved;
};
