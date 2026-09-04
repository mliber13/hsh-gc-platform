import { AlertTriangle } from 'lucide-react'
import { scheduleItemRenameImpact } from '@/lib/drywall/scheduleItemNameMeaning'

interface ScheduleItemRenameWarningProps {
  originalName: string
  draftName: string
  type?: 'field' | 'office'
}

/**
 * Shown inline when a rename would change something the app derives from the
 * item's name — its billing draw or its phase. Renders nothing when the rename
 * is harmless, so it stays quiet for the common case.
 */
export function ScheduleItemRenameWarning({
  originalName,
  draftName,
  type = 'field',
}: ScheduleItemRenameWarningProps) {
  const trimmed = draftName.trim()
  if (!trimmed || trimmed === originalName.trim()) return null

  const impact = scheduleItemRenameImpact(originalName, trimmed, type)
  if (!impact.hasImpact) return null

  return (
    <div
      role="status"
      className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div className="space-y-1">
        {impact.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </div>
    </div>
  )
}
