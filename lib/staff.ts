/**
 * Employee-name normalisation.
 *
 * Isomorphic and dependency-free so the server action, the de-duplication script
 * and the test suites all decide "is this the same employee?" the same way. It
 * also has to agree with the SQL expression used to backfill `Staff.nameKey`:
 *
 *   lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
 */

/**
 * The value stored in `Staff.nameKey`, which carries the unique index.
 *
 * Trimmed, internal whitespace collapsed, lowercased — so "MOTI", "moti" and
 * "moti  " are one employee, not three. The displayed `name` keeps whatever
 * capitalisation was typed.
 */
export function staffNameKey(name: string): string {
  return normaliseStaffName(name).toLowerCase()
}

/** The name as it should be stored for display: trimmed, spaces collapsed. */
export function normaliseStaffName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

/**
 * Trims an optional field, turning a blank into null.
 *
 * The form submits "" for untouched optional inputs, which left the table with a
 * mix of "" and NULL for the same "not recorded" state.
 */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
