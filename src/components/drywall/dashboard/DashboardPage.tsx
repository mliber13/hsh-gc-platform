// ============================================================================
// KPI Hub
// ============================================================================
//
// Twelve sections rendered at full height stacked into a page several screens tall, so
// reading the fourth KPI meant scrolling past three charts. Mark, 2026-10-02: "cards that we
// can click and open to view just that data."
//
// So the hub is an overview of tiles, and opening one is a route:
//
//   /drywall/dashboard                   the grid
//   /drywall/dashboard/takeoff-accuracy  one section, open
//
// The route is the state and the slide-down is only the animation. That buys Back-closes,
// a bookmarkable single KPI and a link worth sending, none of which a local `useState`
// would have given.
//
// **The grid compresses rather than being pushed down.** An accordion that opens in place
// would have reintroduced the scrolling this replaces — the detail sections are tall. Open a
// section and the twelve tiles become one row of chips, so switching KPI stays one click
// while the detail gets the remaining height.

import { LayoutDashboard, RefreshCw, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { NorthStarCard } from './NorthStarCard'
import { ProductionReadyNudge } from './ProductionReadyNudge'
import {
  allSectionsInOrder,
  DASHBOARD_GROUP_LABELS,
  DASHBOARD_GROUP_ORDER,
  sectionById,
  sectionsForGroup,
  type DashboardSectionDef,
} from './sections/registry'
import { DashboardDataProvider, useDashboardData } from './useDashboardData'
import { DivisionExecutionProvider, useDivisionExecution } from './useDivisionExecution'

const HUB_PATH = '/drywall/dashboard'

function sectionPath(section: DashboardSectionDef): string {
  return `${HUB_PATH}/${section.id}`
}

function GroupHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

/** The overview: North Star kept open above, everything else a tile. */
function HubOverview() {
  return (
    <div className="space-y-4">
      <ProductionReadyNudge />

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
          <section key={groupId} className="space-y-2">
            <GroupHeading label={DASHBOARD_GROUP_LABELS[groupId]} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {sections.map((section) => {
                const Summary = section.summary
                return (
                  <Summary
                    key={section.id}
                    variant="tile"
                    active={false}
                    to={sectionPath(section)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** One section open, with the compressed strip above it. */
function HubDetail({ section }: { section: DashboardSectionDef }) {
  const Section = section.component
  // The strip wraps rather than scrolling horizontally, so every KPI stays reachable without
  // a swipe and nothing needs scrolling into view.
  const strip = allSectionsInOrder()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {strip.map((candidate) => {
          const Summary = candidate.summary
          const isActive = candidate.id === section.id
          return (
            <Summary
              key={candidate.id}
              variant="chip"
              active={isActive}
              // The active chip closes rather than re-navigating to where you already are.
              to={isActive ? HUB_PATH : sectionPath(candidate)}
            />
          )
        })}
        <Button variant="ghost" size="sm" asChild className="ml-auto">
          <Link to={HUB_PATH} aria-label="Back to all KPIs">
            <X className="mr-1 h-4 w-4" />
            Close
          </Link>
        </Button>
      </div>

      <motion.div
        // Keyed on the section so switching KPI replays the slide rather than swapping
        // silently, which otherwise reads as nothing having happened.
        key={section.id}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Section />
      </motion.div>
    </div>
  )
}

function DashboardContent({ section }: { section: DashboardSectionDef | undefined }) {
  const { loading, error, refresh } = useDashboardData()

  // Only the overview waits for everything. An open section renders its own loading state,
  // and the tiles have skeletons, so blocking the whole hub on the slowest query would be a
  // step back from what the sections already handle.
  if (loading && !section) {
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

  return section ? <HubDetail section={section} /> : <HubOverview />
}

export function DashboardPage() {
  const { sectionId } = useParams<{ sectionId: string }>()
  // An unknown id falls back to the overview rather than erroring — a stale bookmark from a
  // renamed section should land somewhere useful.
  const section = sectionById(sectionId)

  usePageTitle(section ? `KPI Hub — ${section.title}` : 'KPI Hub')

  return (
    <DashboardDataProvider>
      <DivisionExecutionProvider>
        <div className="mx-auto max-w-screen-2xl space-y-4 p-4 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <LayoutDashboard className="h-7 w-7 shrink-0 text-primary" />
                {section ? (
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <Link
                      to={HUB_PATH}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      KPI Hub
                    </Link>
                    <span className="text-muted-foreground">/</span>
                    <span className="truncate">{section.title}</span>
                  </span>
                ) : (
                  'KPI Hub'
                )}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {section
                  ? 'Pick another KPI above, or close to see them all.'
                  : 'Operational pulse — open a card for the detail behind it.'}
              </p>
            </div>
            <DashboardRefreshButton />
          </div>
          <DashboardContent section={section} />
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
      className="shrink-0"
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
