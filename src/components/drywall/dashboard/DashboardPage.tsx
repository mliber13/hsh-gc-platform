import { LayoutDashboard, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { cn } from '@/lib/utils'
import { NorthStarCard } from './NorthStarCard'
import {
  DASHBOARD_GROUP_LABELS,
  DASHBOARD_GROUP_ORDER,
  DASHBOARD_SECTION_SPAN_CLASS,
  sectionsForGroup,
} from './sections/registry'
import { DashboardDataProvider, useDashboardData } from './useDashboardData'
import { DivisionExecutionProvider, useDivisionExecution } from './useDivisionExecution'

function DashboardContent() {
  const { loading, error, refresh } = useDashboardData()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={refresh}>
          Retry
        </Button>
      </div>
    )
  }

  let sectionIndex = 0

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <NorthStarCard />
      </motion.div>

      {DASHBOARD_GROUP_ORDER.map((groupId) => {
        const sections = sectionsForGroup(groupId)
        if (sections.length === 0) return null

        return (
          <section key={groupId} className="space-y-4">
            <div className="flex items-center gap-3">
              <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {DASHBOARD_GROUP_LABELS[groupId]}
              </p>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {sections.map((section) => {
                const Section = section.component
                const delayIndex = sectionIndex++
                return (
                  <motion.div
                    key={section.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.05 * (delayIndex + 1) }}
                    className={cn('h-full min-w-0', DASHBOARD_SECTION_SPAN_CLASS[section.span])}
                  >
                    <Section />
                  </motion.div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function DashboardPage() {
  usePageTitle('KPI Hub')

  return (
    <DashboardDataProvider>
      <DivisionExecutionProvider>
        <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <LayoutDashboard className="h-7 w-7 text-primary" />
                KPI Hub
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Operational pulse — pace, capacity, crew, and execution at a glance.
              </p>
            </div>
            <DashboardRefreshButton />
          </div>
          <DashboardContent />
        </div>
      </DivisionExecutionProvider>
    </DashboardDataProvider>
  )
}

function DashboardRefreshButton() {
  const { loading, refresh } = useDashboardData()
  const { loading: executionLoading, refresh: refreshExecution } = useDivisionExecution()
  const busy = loading || executionLoading
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        refresh()
        refreshExecution()
      }}
      disabled={busy}
    >
      <RefreshCw className={busy ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
      Sync
    </Button>
  )
}
