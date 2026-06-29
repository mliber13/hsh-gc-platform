import { cn } from '@/lib/utils'
import { computeMeasuredSqft } from '@/lib/drywall/fieldMeasurementUtils'
import type { FieldTakeoff } from '@/types/drywall'

/** Crew measure workflow status shown on /crew/projects/:id/measure. */
export type CrewMeasureWorkflowStatus =
  | 'not_started'
  | 'in_progress'
  | 'pending_review'
  | 'approved'
  | 'rejected'

const STATUS_META: Record<
  CrewMeasureWorkflowStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  not_started: {
    label: 'Not started',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
  },
  in_progress: {
    label: 'In progress',
    bg: 'bg-blue-500/15',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-500/30',
  },
  pending_review: {
    label: 'Pending review',
    bg: 'bg-amber-500/15',
    text: 'text-amber-800 dark:text-amber-200',
    border: 'border-amber-500/30',
  },
  approved: {
    label: 'Approved',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30',
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-red-500/15',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-500/30',
  },
}

function takeoffHasDraftContent(takeoff: FieldTakeoff): boolean {
  if (computeMeasuredSqft(takeoff.measurements ?? []) > 0) return true
  if ((takeoff.measurements ?? []).some((m) => String(m.area ?? '').trim())) return true
  if ((takeoff.photos?.length ?? 0) > 0) return true
  if ((takeoff.accessories?.length ?? 0) > 0) return true
  if ((takeoff.checklist ?? []).some((c) => c.completed)) return true
  const textFields = [
    takeoff.siteContact,
    takeoff.contactPhone,
    takeoff.meetingLocation,
    takeoff.accessNotes,
    takeoff.hazards,
    takeoff.notes,
  ]
  if (textFields.some((v) => String(v ?? '').trim())) return true
  return Boolean(takeoff.updatedAt)
}

export function crewMeasureWorkflowStatus(
  takeoff: FieldTakeoff | null | undefined,
): CrewMeasureWorkflowStatus {
  if (!takeoff) return 'not_started'
  if (takeoff.reviewStatus === 'approved') return 'approved'
  if (takeoff.reviewStatus === 'rejected') return 'rejected'
  if (takeoff.reviewStatus === 'pending_review') return 'pending_review'
  if (takeoffHasDraftContent(takeoff)) return 'in_progress'
  return 'not_started'
}

export function crewMeasureStatusLabel(status: CrewMeasureWorkflowStatus): string {
  return STATUS_META[status].label
}

export function crewMeasureStatusPillClass(status: CrewMeasureWorkflowStatus): string {
  const visual = STATUS_META[status]
  return cn(
    'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
    visual.bg,
    visual.text,
    visual.border,
  )
}
