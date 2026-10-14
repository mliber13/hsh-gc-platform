// The close-out checklist on Financials — each line checked from the data, each loose end a
// link to where it gets fixed (closeoutChecklist.ts). Same feel as the Field steps.

import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CloseoutItem, CloseoutLink } from '@/lib/drywall/closeoutChecklist'

const LINK_TO: Record<CloseoutLink, { to: (projectId: string) => string; label: string }> = {
  qb_materials: { to: () => '/drywall/settings/quickbooks?tab=materials', label: 'Review bills' },
  qb_revenue: { to: () => '/drywall/settings/quickbooks', label: 'Review invoices' },
  change_orders: { to: (id) => `/drywall/projects/${id}/change-orders`, label: 'Open change orders' },
  payroll: { to: () => '/hr/payroll', label: 'Open payroll' },
}

interface CloseoutChecklistCardProps {
  projectId: string
  items: CloseoutItem[]
  closed: boolean
}

export function CloseoutChecklistCard({ projectId, items, closed }: CloseoutChecklistCardProps) {
  const open = items.filter((i) => i.state === 'open').length
  const headsUp = items.filter((i) => i.state === 'heads_up').length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Close-out</CardTitle>
        <CardDescription>
          {closed
            ? 'This job is closed. What it was closed with:'
            : open === 0
              ? headsUp > 0
                ? `Ready to close — ${headsUp} thing${headsUp === 1 ? '' : 's'} worth a look first.`
                : 'Ready to close.'
              : `${open} thing${open === 1 ? '' : 's'} to finish before closing.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((item) => {
            const link = item.link ? LINK_TO[item.link] : null
            return (
              <li key={item.key} className="flex items-start gap-3 py-2.5">
                {item.state === 'done' ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : item.state === 'open' ? (
                  <Circle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', item.state === 'done' && 'text-muted-foreground')}>
                    {item.label}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
                {link && item.state !== 'done' && !closed ? (
                  <Link
                    to={link.to(projectId)}
                    className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="size-3.5" />
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
