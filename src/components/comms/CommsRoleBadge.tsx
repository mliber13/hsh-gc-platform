import { cn } from '@/lib/utils'
import type { CommsLogAuthorRole } from '@/types/drywall'

const ROLE_BADGE: Record<Exclude<CommsLogAuthorRole, 'operator'>, string> = {
  crew: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  sub: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
}

const ROLE_LABEL: Record<Exclude<CommsLogAuthorRole, 'operator'>, string> = {
  crew: 'Crew',
  sub: 'Sub',
}

export function CommsRoleBadge({ role }: { role?: CommsLogAuthorRole }) {
  if (!role || role === 'operator') return null
  return (
    <span
      className={cn(
        'ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
        ROLE_BADGE[role],
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  )
}
