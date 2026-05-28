import { useCallback, useEffect, useMemo, useState } from 'react'
import { DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { canRunPayroll } from '@/routes/RequirePermission'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { generateHrId } from '@/lib/hrTeamUtils'
import { exportPayrollRunPdf } from '@/lib/payrollPdf'
import { quoteFromProjectMetadata } from '@/lib/payrollMath'
import { fetchTeam } from '@/services/hrTeamService'
import {
  deletePayPeriod,
  fetchPayPeriods,
  savePayPeriod,
} from '@/services/hrPayrollService'
import { fetchAllOrgProjectsForPayroll } from '@/services/supabaseService'
import type { PayPeriod, PayrollProjectOption } from '@/types/payroll'
import {
  PayrollRunTab,
  buildRunPayloadFromDraft,
  defaultPayrollPeriodDates,
  entriesFromRun,
  type DraftEntries,
} from './payroll/PayrollRunTab'
import { PayrollHistoryTab } from './payroll/PayrollHistoryTab'

export function PayrollPage() {
  usePageTitle('HR — Payroll')
  const { userProfile, effectiveRole } = usePermissions()
  const allowed = canRunPayroll(userProfile, effectiveRole)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [runs, setRuns] = useState<PayPeriod[]>([])
  const [employees, setEmployees] = useState(() => [] as Awaited<ReturnType<typeof fetchTeam>>['employees'])
  const [contractors, setContractors] = useState(
    () => [] as Awaited<ReturnType<typeof fetchTeam>>['contractors1099'],
  )
  const [projects, setProjects] = useState<PayrollProjectOption[]>([])

  const defaults = defaultPayrollPeriodDates()
  const [periodStart, setPeriodStart] = useState(defaults.start)
  const [periodEnd, setPeriodEnd] = useState(defaults.end)
  const [entries, setEntries] = useState<DraftEntries>({})
  const [editingRunId, setEditingRunId] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [activeTab, setActiveTab] = useState('run')

  const editingRun = useMemo(
    () => runs.find((r) => r.id === editingRunId) ?? null,
    [runs, editingRunId],
  )

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [team, periods, projectRows] = await Promise.all([
        fetchTeam(),
        fetchPayPeriods(),
        fetchAllOrgProjectsForPayroll(),
      ])
      setEmployees(team.employees)
      setContractors(team.contractors1099)
      setRuns(periods)
      setProjects(
        projectRows.map((p) => ({
          id: p.id,
          name: p.name,
          quote: quoteFromProjectMetadata(p.metadata),
        })),
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load payroll')
    } finally {
      setLoading(false)
    }
  }, [allowed])

  useEffect(() => {
    void load()
  }, [load])

  const draftSnapshot = useMemo(() => {
    const payload = buildRunPayloadFromDraft(
      periodStart,
      periodEnd,
      entries,
      employees,
      contractors,
      editingRun ?? undefined,
    )
    return JSON.stringify(payload)
  }, [periodStart, periodEnd, entries, employees, contractors, editingRun])

  const isDirty = draftSnapshot !== savedSnapshot

  const resetDraft = (run: PayPeriod | null) => {
    if (run) {
      setPeriodStart(run.startDate)
      setPeriodEnd(run.endDate)
      setEntries(entriesFromRun(run))
      setEditingRunId(run.id)
      const snap = JSON.stringify(
        buildRunPayloadFromDraft(
          run.startDate,
          run.endDate,
          entriesFromRun(run),
          employees,
          contractors,
          run,
        ),
      )
      setSavedSnapshot(snap)
    } else {
      const d = defaultPayrollPeriodDates()
      setPeriodStart(d.start)
      setPeriodEnd(d.end)
      setEntries({})
      setEditingRunId(null)
      setSavedSnapshot('')
    }
  }

  const handleSave = async () => {
    if (!periodStart || !periodEnd) {
      toast.error('Set period start and end dates')
      return
    }
    if (periodStart > periodEnd) {
      toast.error('Period start must be on or before period end')
      return
    }
    setSaving(true)
    try {
      const previousRun = editingRunId ? runs.find((r) => r.id === editingRunId) ?? null : null
      const payload = buildRunPayloadFromDraft(
        periodStart,
        periodEnd,
        entries,
        employees,
        contractors,
        editingRun ?? undefined,
      )
      const id = editingRunId ?? generateHrId()
      const run: PayPeriod = { ...payload, id }
      const result = await savePayPeriod(run, previousRun)
      toast.success(editingRunId ? 'Payroll updated' : 'Payroll saved')
      if (result.teamSyncWarning) {
        toast.warning(`Payroll saved, but team banked-hours sync failed: ${result.teamSyncWarning}`)
      }
      const next = await fetchPayPeriods()
      setRuns(next)
      setEditingRunId(id)
      setSavedSnapshot(JSON.stringify(payload))
      if (!editingRunId) {
        const d = defaultPayrollPeriodDates()
        setPeriodStart(d.start)
        setPeriodEnd(d.end)
        setEntries({})
        setSavedSnapshot('')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (runId: string) => {
    try {
      const deletedRun = runs.find((r) => r.id === runId) ?? null
      const result = await deletePayPeriod(runId, deletedRun)
      toast.success('Payroll run deleted')
      if (result.teamSyncWarning) {
        toast.warning(`Run deleted, but team banked-hours sync failed: ${result.teamSyncWarning}`)
      }
      const next = await fetchPayPeriods()
      setRuns(next)
      if (editingRunId === runId) resetDraft(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleToggleLock = async (run: PayPeriod, lock: boolean) => {
    try {
      const updated: PayPeriod = { ...run, locked: lock }
      const result = await savePayPeriod(updated, run)
      toast.success(lock ? 'Payroll locked' : 'Payroll unlocked')
      if (result.teamSyncWarning) {
        toast.warning(`Payroll updated, but team banked-hours sync failed: ${result.teamSyncWarning}`)
      }
      const next = await fetchPayPeriods()
      setRuns(next)
      if (editingRunId === run.id) {
        setSavedSnapshot(
          JSON.stringify(
            buildRunPayloadFromDraft(
              run.startDate,
              run.endDate,
              entries,
              employees,
              contractors,
              updated,
            ),
          ),
        )
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleExportPdf = (run: PayPeriod) => {
    try {
      exportPayrollRunPdf(run, employees, contractors)
      toast.success('PDF downloaded')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'PDF failed')
    }
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-muted-foreground">
        <DollarSign className="mx-auto mb-3 size-10 opacity-40" />
        <p className="font-medium text-foreground">Payroll access required</p>
        <p className="mt-2 text-sm">
          You do not have permission to view or run payroll. Contact an owner if you need
          operator access.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <p className="text-sm text-muted-foreground">
          Run weekly payroll, review history, and export PDF reports.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="run">Run payroll</TabsTrigger>
          <TabsTrigger value="history">Past payrolls ({runs.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="run" className="mt-0 space-y-3">
          {editingRunId && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Editing run {editingRun?.startDate} – {editingRun?.endDate}
              {!editingRunId && null}
              <button
                type="button"
                className="ml-2 text-primary underline"
                onClick={() => resetDraft(null)}
              >
                Start new run
              </button>
            </p>
          )}
          {!editingRunId && runs.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No payroll runs yet. Set the pay period dates, enter hours and piece pay, then
              click Save payroll.
            </p>
          )}
          <PayrollRunTab
            periodStart={periodStart}
            periodEnd={periodEnd}
            onPeriodStartChange={setPeriodStart}
            onPeriodEndChange={setPeriodEnd}
            entries={entries}
            onEntriesChange={setEntries}
            editingRun={editingRun}
            locked={!!editingRun?.locked}
            employees={employees}
            contractors={contractors}
            projects={projects}
            onSave={() => void handleSave()}
            saving={saving}
            isDirty={isDirty}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <PayrollHistoryTab
            runs={runs}
            onEdit={(run) => {
              resetDraft(run)
              setActiveTab('run')
            }}
            onDelete={handleDelete}
            onToggleLock={handleToggleLock}
            onExportPdf={handleExportPdf}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
