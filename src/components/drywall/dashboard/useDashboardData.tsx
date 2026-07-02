import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  computeDashboardMetrics,
  type DashboardMetrics,
} from '@/lib/drywall/dashboardCalculations'
import { DEFAULT_DASHBOARD_TARGETS } from '@/lib/drywall/dashboardTargets'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { fetchCrossProjectScheduleItems } from '@/services/drywallScheduleAggregateService'
import { fetchTeam } from '@/services/hrTeamService'
import type { DrywallProjectListItem } from '@/types/drywall'
import type { DashboardTargets } from '@/lib/drywall/dashboardTargets'
import type { CrossProjectScheduleItem } from '@/services/drywallScheduleAggregateService'
import type { OrgTeamPayload } from '@/types/hr'

export interface DashboardDataState {
  projects: DrywallProjectListItem[]
  scheduleItems: CrossProjectScheduleItem[]
  team: OrgTeamPayload
  targets: DashboardTargets
  metrics: DashboardMetrics
  loading: boolean
  error: string | null
  refresh: () => void
}

const DashboardDataContext = createContext<DashboardDataState | null>(null)

export function useDashboardData(): DashboardDataState {
  const ctx = useContext(DashboardDataContext)
  if (!ctx) {
    throw new Error('useDashboardData must be used within DashboardDataProvider')
  }
  return ctx
}

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<DrywallProjectListItem[]>([])
  const [scheduleItems, setScheduleItems] = useState<CrossProjectScheduleItem[]>([])
  const [team, setTeam] = useState<OrgTeamPayload>({ employees: [], contractors1099: [], positions: [] })
  const [targets, setTargets] = useState<DashboardTargets>(DEFAULT_DASHBOARD_TARGETS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projectRows, scheduleRows, teamPayload, catalogs] = await Promise.all([
        fetchDrywallProjects(),
        fetchCrossProjectScheduleItems(),
        fetchTeam(),
        fetchOrgDrywallCatalogs(),
      ])
      setProjects(projectRows)
      setScheduleItems(scheduleRows)
      setTeam(teamPayload)
      setTargets(catalogs.dashboardTargets)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load dashboard data'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const metrics = useMemo(
    () => computeDashboardMetrics(projects, scheduleItems, team, targets),
    [projects, scheduleItems, team, targets],
  )

  const value: DashboardDataState = useMemo(
    () => ({
      projects,
      scheduleItems,
      team,
      targets,
      metrics,
      loading,
      error,
      refresh: () => void load(),
    }),
    [projects, scheduleItems, team, targets, metrics, loading, error, load],
  )

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>
}
