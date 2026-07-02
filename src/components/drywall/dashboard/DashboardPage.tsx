import { LayoutDashboard, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { NorthStarCard } from './NorthStarCard'
import { DASHBOARD_SECTIONS } from './sections/registry'
import { DashboardDataProvider, useDashboardData } from './useDashboardData'

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

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <NorthStarCard />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {DASHBOARD_SECTIONS.map((section, index) => {
          const Section = section.component
          return (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 * (index + 1) }}
              className={section.id === 'backlog' ? 'lg:col-span-2 xl:col-span-1' : undefined}
            >
              <Section />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export function DashboardPage() {
  usePageTitle('Drywall — Dashboard')

  return (
    <DashboardDataProvider>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <LayoutDashboard className="h-7 w-7 text-primary" />
              KPI Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Operational pulse — pace, capacity, crew, and backlog at a glance.
            </p>
          </div>
          <DashboardRefreshButton />
        </div>
        <DashboardContent />
      </div>
    </DashboardDataProvider>
  )
}

function DashboardRefreshButton() {
  const { loading, refresh } = useDashboardData()
  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
      <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
      Refresh
    </Button>
  )
}
