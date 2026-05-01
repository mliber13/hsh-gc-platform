// ============================================================================
// Project Activity types
// ============================================================================
//
// Shared between projectActivityService (data) and RecentActivityCard (UI).
// Activity is *derived* from existing per-row tables (change_orders,
// po_headers, project_documents, project_forms) — there is no
// project_activity_events table. See docs/UI_PORT_PLAYBOOK.md for the design
// rationale (deal_activity_events is the dedicated-table precedent on the
// deals side; we may graduate projects to that pattern later).
//

export type ProjectActivityEventType =
  | 'change-order'
  | 'purchase-order'
  | 'document'
  | 'form'

/** A normalized activity event surfaced in the Recent Activity feed. */
export interface ProjectActivityEvent {
  /** Composite key for React lists: `${type}:${row id}`. */
  id: string
  type: ProjectActivityEventType
  /** ISO 8601 timestamp from the source row's created_at. */
  timestamp: string
  /** One-line headline shown in the feed, e.g. "Change order CO-001 created". */
  title: string
  /** Optional secondary text shown smaller, e.g. amount or document filename. */
  detail?: string
  /** Section the row belongs to. Caller maps this to a nav target. Matches
   *  ProjectSection literals from dashboard/ProjectCard.tsx. */
  section: 'change-orders' | 'purchase-orders' | 'documents' | 'forms'
}
