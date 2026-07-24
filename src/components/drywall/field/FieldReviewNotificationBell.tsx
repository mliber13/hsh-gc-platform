import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isOnlineMode } from '@/lib/supabase'
import { usePermissions } from '@/hooks/usePermissions'
import { canReviewDrywallFieldTakeoff } from '@/routes/RequirePermission'
import { fetchPendingFieldReviews, type PendingFieldReview } from '@/services/fieldReviewService'
import { cn } from '@/lib/utils'

const POLL_MS = 120_000

/** Header indicator (owner / office_drywall) for field takeoffs submitted for review. */
export function FieldReviewNotificationBell() {
  const { effectiveRole } = usePermissions()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [reviews, setReviews] = useState<PendingFieldReview[]>([])
  const canReview = canReviewDrywallFieldTakeoff(effectiveRole)

  const refresh = useCallback(async () => {
    if (!isOnlineMode() || !canReview) {
      setReviews([])
      return
    }
    try {
      setReviews(await fetchPendingFieldReviews())
    } catch {
      /* keep last known */
    }
  }, [canReview])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  if (!isOnlineMode() || !canReview) return null

  const count = reviews.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label="Field measurements pending review"
        >
          <ClipboardCheck className="size-5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Field measurements to review</div>
        {reviews.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing awaiting review
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {reviews.map((r) => (
              <li key={r.projectId}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm',
                    'hover:bg-muted/60',
                  )}
                  onClick={() => {
                    setOpen(false)
                    navigate(`/drywall/projects/${r.projectId}/field`)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{r.projectName}</span>
                  {r.measuredSqft != null ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.measuredSqft.toLocaleString()} sqft
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
