import { formatRelativeShort } from "./formatDate";

/**
 * Une date relative courte : « il y a 3 j », « hier », sinon la date.
 *
 * Passait par `date-fns` sans locale, ce qui donnait « last Wednesday at
 * 9:52 AM » en anglais, puis `toLocaleDateString()` sans locale ni fuseau —
 * donc un format qui changeait d'un poste à l'autre (NOS-1172).
 */
export function RelativeDate({ date }: { date: string }) {
  return <>{formatRelativeShort(date)}</>;
}
