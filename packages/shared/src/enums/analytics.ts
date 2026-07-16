/**
 * Time windows the analytics page can scope its aggregates to. Not persisted —
 * these ride the tRPC input for every analytics query and pick the `created_at`
 * cutoff applied to the ledgers.
 */

///////////
// Enums //
///////////

export enum AnalyticsRange {
  Last7Days = '7d',
  Last30Days = '30d',
  All = 'all',
}
