import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  aggregateDivisionLaborPerformance,
  aggregateEstimatingAccuracy,
  aggregateTakeoffAccuracy,
  buildDivisionExecutionRollUp,
  fetchDivisionExecution,
  type DivisionExecution,
  type DivisionExecutionJob,
  type DivisionExecutionRollUp,
  type DivisionLaborPerformance,
  type EstimatingAccuracy,
  type TakeoffAccuracy,
} from '@/services/drywallDivisionAggregateService'

export interface DivisionExecutionState {
  jobs: DivisionExecutionJob[]
  marginRollUp: DivisionExecutionRollUp
  laborPerformance: DivisionLaborPerformance
  accuracy: EstimatingAccuracy
  takeoffAccuracy: TakeoffAccuracy
  loading: boolean
  error: string | null
  refresh: () => void
}

const DivisionExecutionContext = createContext<DivisionExecutionState | null>(null)

export function useDivisionExecution(): DivisionExecutionState {
  const ctx = useContext(DivisionExecutionContext)
  if (!ctx) {
    throw new Error('useDivisionExecution must be used within DivisionExecutionProvider')
  }
  return ctx
}

export function DivisionExecutionProvider({ children }: { children: React.ReactNode }) {
  const [execution, setExecution] = useState<DivisionExecution>({
    jobs: [],
    computedAt: new Date().toISOString(),
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDivisionExecution()
      setExecution(data)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load division execution'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const marginRollUp = useMemo(
    () => buildDivisionExecutionRollUp(execution.jobs, execution.computedAt),
    [execution.jobs, execution.computedAt],
  )

  const laborPerformance = useMemo(
    () => aggregateDivisionLaborPerformance(execution.jobs),
    [execution.jobs],
  )

  const accuracy = useMemo(
    () => aggregateEstimatingAccuracy(execution.jobs, new Date(execution.computedAt)),
    [execution.jobs, execution.computedAt],
  )

  // Quoted sqft vs field-measured sqft — upstream of `accuracy`, and part of what explains
  // it: a material overrun on a job that measured 10% bigger than it was quoted is
  // arithmetic rather than a buying problem.
  const takeoffAccuracy = useMemo(
    () => aggregateTakeoffAccuracy(execution.jobs, new Date(execution.computedAt)),
    [execution.jobs, execution.computedAt],
  )

  const value: DivisionExecutionState = useMemo(
    () => ({
      jobs: execution.jobs,
      marginRollUp,
      laborPerformance,
      accuracy,
      takeoffAccuracy,
      loading,
      error,
      refresh: () => void load(),
    }),
    [
      execution.jobs,
      marginRollUp,
      laborPerformance,
      accuracy,
      takeoffAccuracy,
      loading,
      error,
      load,
    ],
  )

  return (
    <DivisionExecutionContext.Provider value={value}>{children}</DivisionExecutionContext.Provider>
  )
}
