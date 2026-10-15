// The job's areas and ceiling heights on the crew job page (Mark, 2026-10-15): "so they know
// exactly what to expect when they get there" — the 18' great room before anyone arrives
// without the scaffold. Built in crewWorkspaceService.resolveCeilingHeights.

import { AlertTriangle, Ruler } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CrewCeilingHeight } from '@/types/crew'

export function CrewCeilingHeightsCard({ heights }: { heights: CrewCeilingHeight[] }) {
  if (heights.length === 0) return null
  const tall = heights.filter((h) => h.tall)
  const measured = heights[0]?.source === 'measured'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="size-4" />
          Ceiling heights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {tall.length > 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-medium text-amber-900 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Tall work: {tall.map((h) => `${h.area} ${h.heightFt}'`).join(', ')}
          </p>
        ) : null}
        <ul className="divide-y rounded-md border">
          {heights.map((h, i) => (
            <li key={`${h.area}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{h.area}</span>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  h.tall ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                )}
              >
                {h.heightFt}&apos;
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {measured ? 'From the field measurement.' : 'From the quote’s takeoff — the job hasn’t been measured yet.'}
        </p>
      </CardContent>
    </Card>
  )
}
