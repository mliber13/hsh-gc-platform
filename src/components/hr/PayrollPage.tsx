import { useCallback, useEffect, useMemo, useState } from 'react'

import { DollarSign } from 'lucide-react'

import { toast } from 'sonner'

import { usePageTitle } from '@/contexts/PageTitleContext'

import { usePermissions } from '@/hooks/usePermissions'

import { canRunPayroll } from '@/routes/RequirePermission'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { generateHrId } from '@/lib/hrTeamUtils'

import { exportPayrollRunPdf } from '@/lib/payrollPdf'

import {

  buildDraftFromPreviousRun,

  buildPayrollPeople,

  getCalculationDetail,

  nextPeriodDateRangeFromRun,

  payrollLastWeekRange,

  payrollThisWeekRange,

  quoteFromProjectMetadata,

} from '@/lib/payrollMath'

import { fetchTeam } from '@/services/hrTeamService'

import {

  deletePayPeriod,

  fetchPayPeriods,

  savePayPeriod,

} from '@/services/hrPayrollService'

import { fetchEntriesForPayrollImport } from '@/services/hrTimeService'

import { fetchAllOrgProjectsForPayroll } from '@/services/supabaseService'

import type { PayPeriod, PayrollProjectOption } from '@/types/payroll'

import type { PayrollTimeImportRow } from '@/types/hr'

import {

  PayrollRunTab,

  buildRunPayloadFromDraft,

  defaultPayrollPeriodDates,

  entriesFromRun,

  type DraftEntries,

} from './payroll/PayrollRunTab'

import { PayrollHistoryTab } from './payroll/PayrollHistoryTab'

import { TimeClockImportDialog } from './payroll/TimeClockImportDialog'

import { CalculationDetailDialog } from './payroll/CalculationDetailDialog'

import { formatPayPeriodRange } from './payroll/payrollFormat'



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

  const [importOpen, setImportOpen] = useState(false)

  const [importLoading, setImportLoading] = useState(false)

  const [importRows, setImportRows] = useState<PayrollTimeImportRow[]>([])

  const [showManualRows, setShowManualRows] = useState(false)

  const [calcRun, setCalcRun] = useState<PayPeriod | null>(null)



  const editingRun = useMemo(

    () => runs.find((r) => r.id === editingRunId) ?? null,

    [runs, editingRunId],

  )



  const mostRecentRun = useMemo(() => {

    if (runs.length === 0) return null

    return [...runs].sort((a, b) => {

      const byEnd = b.endDate.localeCompare(a.endDate)

      if (byEnd !== 0) return byEnd

      return b.startDate.localeCompare(a.startDate)

    })[0]

  }, [runs])



  const calcDetails = useMemo(() => {

    if (!calcRun) return []

    return getCalculationDetail({ entries: calcRun.entries }, employees, contractors)

  }, [calcRun, employees, contractors])



  const rowResetKey = editingRunId ?? `${periodStart}-${periodEnd}-${Object.keys(entries).length}`



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



  const confirmOverwriteDraft = (message: string): boolean => {

    if (!isDirty) return true

    return window.confirm(message)

  }



  const resetDraft = (run: PayPeriod | null) => {

    if (run) {

      setPeriodStart(run.startDate)

      setPeriodEnd(run.endDate)

      setEntries(entriesFromRun(run))

      setEditingRunId(run.id)

      setShowManualRows(true)

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

      setShowManualRows(false)

    }

  }



  const applyStartNextFromLast = () => {

    if (!mostRecentRun) return

    const people = buildPayrollPeople(employees, contractors, true)

    const draft = buildDraftFromPreviousRun(mostRecentRun, people)

    const { start, end } = nextPeriodDateRangeFromRun(mostRecentRun)

    setPeriodStart(start)

    setPeriodEnd(end)

    setEntries(draft)

    setEditingRunId(null)

    setShowManualRows(true)

    setActiveTab('run')

    toast.success('Next period draft ready — structure copied, hours and pay zeroed.')

  }



  const handleStartNextFromLast = () => {

    if (!mostRecentRun) return

    if (

      !confirmOverwriteDraft(

        'You have unsaved changes on this draft. Replace them with a new period started from the last payroll?',

      )

    ) {

      return

    }

    applyStartNextFromLast()

  }



  const handleDuplicateRun = (run: PayPeriod) => {

    if (

      !confirmOverwriteDraft(

        'You have unsaved changes on this draft. Replace them with a copy of the selected payroll run?',

      )

    ) {

      return

    }

    setPeriodStart(run.startDate)

    setPeriodEnd(run.endDate)

    setEntries(entriesFromRun(run))

    setEditingRunId(null)

    setShowManualRows(true)

    setActiveTab('run')

    toast.success('Draft copied from selected payroll run.')

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

        setShowManualRows(false)

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



  const loadImportPreview = async (start: string, end: string) => {

    setImportLoading(true)

    try {

      const rows = await fetchEntriesForPayrollImport({ start, end })

      setImportRows(rows)

    } catch (e: unknown) {

      toast.error(e instanceof Error ? e.message : 'Failed to load time clock preview')

    } finally {

      setImportLoading(false)

    }

  }



  const applyImportRowsToDraft = (rows: PayrollTimeImportRow[]) => {

    const grouped = new Map<string, PayrollTimeImportRow[]>()

    for (const row of rows) {

      const personKey = row.personType === 'w2' ? `w2-${row.personId}` : `c-${row.personId}`

      const current = grouped.get(personKey) ?? []

      current.push(row)

      grouped.set(personKey, current)

    }



    const nextEntries: DraftEntries = { ...entries }

    for (const [personKey, personRows] of grouped.entries()) {

      const [typeTag, ...idParts] = personKey.split('-')

      const personId = idParts.join('-')

      const personType = typeTag === 'w2' ? 'w2' : '1099'

      const existing = nextEntries[personKey]

      const hourEntries = personRows.map((row) => ({

        id: generateHrId(),

        jobId: row.projectId ?? '',

        jobName: row.projectName || '',

        hours: Number(row.hours.toFixed(2)),

        overtimeType: 'regular' as const,

      }))



      nextEntries[personKey] = {

        ...(existing || {

          personId,

          personType,

          personName: personRows[0]?.personName || '',

          hourEntries: [],

          pieceEntries: [],

        }),

        personId,

        personType,

        personName: personRows[0]?.personName || existing?.personName || '',

        hourEntries,

      }

    }

    setEntries(nextEntries)

    setShowManualRows(true)

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

          {editingRunId && editingRun && (

            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">

              Editing run {formatPayPeriodRange(editingRun.startDate, editingRun.endDate)}

              <button

                type="button"

                className="ml-2 text-primary underline"

                onClick={() => resetDraft(null)}

              >

                Start new run

              </button>

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

            onImportTimeClock={() => {

              setImportOpen(true)

              void loadImportPreview(periodStart, periodEnd)

            }}

            onStartNextFromLast={handleStartNextFromLast}

            canStartNextFromLast={!!mostRecentRun}

            onThisWeek={() => {

              const w = payrollThisWeekRange()

              setPeriodStart(w.start)

              setPeriodEnd(w.end)

            }}

            onLastWeek={() => {

              const w = payrollLastWeekRange()

              setPeriodStart(w.start)

              setPeriodEnd(w.end)

            }}

            showManualRows={showManualRows}

            onBeginManualEntry={() => setShowManualRows(true)}

            saving={saving}

            isDirty={isDirty}

            importingTimeClock={importLoading}

            rowResetKey={rowResetKey}

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

            onViewCalculations={(run) => setCalcRun(run)}

            onDuplicate={handleDuplicateRun}

          />

        </TabsContent>

      </Tabs>



      <CalculationDetailDialog

        open={!!calcRun}

        onOpenChange={(open) => !open && setCalcRun(null)}

        details={calcDetails}

        title={

          calcRun

            ? `Calculations · ${formatPayPeriodRange(calcRun.startDate, calcRun.endDate)}`

            : 'Calculations'

        }

      />



      <TimeClockImportDialog

        open={importOpen}

        defaultStart={periodStart}

        defaultEnd={periodEnd}

        loading={importLoading}

        rows={importRows}

        onOpenChange={setImportOpen}

        onLoadPreview={(start, end) => {

          void loadImportPreview(start, end)

        }}

        onConfirm={(start, end) => {

          applyImportRowsToDraft(importRows)

          setPeriodStart(start)

          setPeriodEnd(end)

          setImportOpen(false)

          toast.success(`Imported ${importRows.length} grouped time rows from TimeClock`)

        }}

      />

    </div>

  )

}


