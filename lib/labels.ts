/**
 * Display names for the two inventory transaction types.
 *
 * The UI shows these in Hindi because that's what the store floor reads. Only
 * the *labels* change — module keys (INWARD_RECORD / OUTWARD_RECORD), routes,
 * the `TransactionType` enum, and the GRN-/MIS- document number prefixes are
 * all unchanged, so nothing in the database or the permission system moves.
 *
 * Kept in one file so the wording can be adjusted in a single place.
 */
export const TXN_LABELS = {
  /** Goods received in — formerly "Goods Receipt (GRN)". */
  inward: "सामान आया",
  /** Material issued out — formerly "Material Issue (MIS)". */
  outward: "सामान दिया",
} as const

/** Display label for a `TransactionType` value from the database. */
export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  GRN: TXN_LABELS.inward,
  MIS: TXN_LABELS.outward,
  OPENING: "Opening",
  ADJUSTMENT: "Adjustment",
}

export function transactionTypeLabel(type: string): string {
  return TRANSACTION_TYPE_LABELS[type] ?? type
}
