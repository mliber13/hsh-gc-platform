import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ClipboardList, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  buildPayrollPieceTypeOptions,
  labelForPieceKey,
  type DrywallLaborCategory,
} from '@/lib/drywall/payrollPieceKeys'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  autoAssignNameMatches,
  assignLaborEntriesToProject,
  clearLaborEntryOffSystem,
  countNameMatchSuggestions,
  fetchDrywallLaborAudit,
  fetchOffSystemLaborEntries,
  markLaborEntriesOffSystem,
  markLaborEntryOffSystem,
  MISLABELED_LABOR_PROBLEM_LABELS,
  OFF_SYSTEM_JOB_ID,
  reassignLaborEntryJob,
  retagLaborEntryType,
  summarizeMislabeledLaborAudit,
  type LaborAuditBatchResult,
  type LaborAuditScope,
  type MislabeledLaborEntry,
  type MislabeledLaborProblem,
} from '@/services/drywallLaborAuditService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { cn } from '@/lib/utils'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { DrywallProjectListItem } from '@/types/drywall'
import { formatCurrency } from './payrollFormat'

const JOB_PROBLEMS: MislabeledLaborProblem[] = [
  'no_job',
  'unassigned',
  'custom_name',
  'stale_project_id',
]

const CATEGORY_LABELS: Record<DrywallLaborCategory, string> = {
  hanger: 'Hanger',
  finisher: 'Finisher',
  components: 'Component',
  prepClean: 'Prep / clean',
  legacy: 'Legacy',
  hourly: 'Hourly',
  other: 'Unknown',
}

type Props = {
  readOnly?: boolean
}

function rowKey(row: MislabeledLaborEntry): string {
  return `${row.payPeriodId}:${row.personId}:${row.personType}:${row.entryType}:${row.entryIndex}:${row.problem}`
}

function currentJobLabel(row: MislabeledLaborEntry): string {
  if (!row.jobId && !row.jobName) return '—'
  if (row.jobId === 'unassigned') return 'Unassigned'
  if (row.jobId === 'other' && row.jobName) return row.jobName
  if (row.jobName) return row.jobName
  if (row.jobId) return row.jobId
  return '—'
}

function amountLabel(row: MislabeledLaborEntry): string {
  if (row.entryType === 'hour') {
    return row.hours != null ? `${row.hours.toFixed(2)} hr` : '—'
  }
  if (row.amount != null && row.amount > 0) {
    return formatCurrency(row.amount)
  }
  if (row.pieces != null && row.pieces > 0) {
    return `${Math.round(row.pieces).toLocaleString()} sqft`
  }
  return '—'
}

function typeLabel(row: MislabeledLaborEntry, catalogs: OrgDrywallCatalogs | null): string {
  if (row.entryType === 'hour') return 'Hourly'
  if (row.pieceKeyOrWorkType) {
    return labelForPieceKey(row.pieceKeyOrWorkType, catalogs)
  }
  return row.category ? CATEGORY_LABELS[row.category] : '—'
}

function matchesFilter(row: MislabeledLaborEntry, q: string): boolean {
  const haystack = [
    row.personName,
    row.periodLabel,
    row.jobName,
    row.jobId,
    row.suggestedProjectName,
    row.pieceKeyOrWorkType,
    row.category ? CATEGORY_LABELS[row.category] : '',
    MISLABELED_LABOR_PROBLEM_LABELS[row.problem],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

function formatBatchToast(result: LaborAuditBatchResult, verb: string): string {
  const parts = [`${verb} ${result.done}`]
  if (result.skippedLocked > 0) {
    parts.push(`skipped ${result.skippedLocked} locked`)
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} failed`)
  }
  return parts.join(' · ')
}

function AuditTable({
  rows,
  projects,
  catalogs,
  readOnly,
  reassigningKey,
  bulkAssigning,
  onReassign,
  onAcceptSuggestion,
  onOffSystem,
  onRetagType,
  showJobActions,
  showTypeActions,
  selectable,
  selectedKeys,
  onToggleRow,
  allShownSelected,
  onToggleSelectAllShown,
}: {
  rows: MislabeledLaborEntry[]
  projects: DrywallProjectListItem[]
  catalogs: OrgDrywallCatalogs | null
  readOnly: boolean
  reassigningKey: string | null
  bulkAssigning: boolean
  onReassign: (row: MislabeledLaborEntry, projectId: string, projectName?: string) => void
  onAcceptSuggestion: (row: MislabeledLaborEntry) => void
  onOffSystem?: (row: MislabeledLaborEntry) => void
  onRetagType?: (row: MislabeledLaborEntry, value: string) => void
  showJobActions: boolean
  showTypeActions: boolean
  selectable?: boolean
  selectedKeys?: Set<string>
  onToggleRow?: (row: MislabeledLaborEntry) => void
  allShownSelected?: boolean
  onToggleSelectAllShown?: () => void
}) {
  const pieceTypeOptions = useMemo(
    () => (catalogs ? buildPayrollPieceTypeOptions(catalogs) : []),
    [catalogs],
  )

  if (rows.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-muted-foreground">
            {selectable ? (
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  className="size-4 rounded border"
                  checked={Boolean(allShownSelected)}
                  disabled={readOnly || bulkAssigning || rows.length === 0}
                  onChange={() => onToggleSelectAllShown?.()}
                  aria-label="Select all shown rows"
                />
              </th>
            ) : null}
            <th className="px-3 py-2 font-medium">Person</th>
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Current job</th>
            <th className="px-3 py-2 font-medium">Type / category</th>
            {showJobActions ? <th className="px-3 py-2 font-medium">Assign</th> : null}
            {showTypeActions ? <th className="px-3 py-2 font-medium">Re-tag type</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row)
            const busy = reassigningKey === key || bulkAssigning
            const disabled = readOnly || row.periodLocked || busy
            const hasSuggestion = Boolean(row.suggestedProjectId)
            const currentTypeValue = row.pieceKeyOrWorkType ?? ''
            const selected = selectedKeys?.has(key) ?? false

            return (
              <tr
                key={key}
                className={cn(
                  'border-b last:border-0',
                  hasSuggestion && showJobActions && 'bg-emerald-50/60 dark:bg-emerald-950/20',
                  selected && selectable && 'bg-primary/5',
                )}
              >
                {selectable ? (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 rounded border"
                      checked={selected}
                      disabled={readOnly || bulkAssigning}
                      onChange={() => onToggleRow?.(row)}
                      aria-label={`Select ${row.personName}`}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-2">{row.personName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{row.periodLabel}</td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{amountLabel(row)}</td>
                <td className="px-3 py-2">
                  {currentJobLabel(row)}
                  {showJobActions ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {MISLABELED_LABOR_PROBLEM_LABELS[row.problem]}
                      {row.periodLocked ? (
                        <span className="text-amber-600"> · Period locked</span>
                      ) : null}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {typeLabel(row, catalogs)}
                  {row.category && row.entryType === 'piece' ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {CATEGORY_LABELS[row.category]}
                    </span>
                  ) : null}
                </td>
                {showJobActions ? (
                  <td className="px-3 py-2 min-w-[260px]">
                    {hasSuggestion ? (
                      <div className="mb-2 space-y-1 rounded border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 dark:border-emerald-900 dark:bg-emerald-950/40">
                        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                          Suggested: {row.suggestedProjectName}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7"
                          disabled={disabled}
                          onClick={() => onAcceptSuggestion(row)}
                        >
                          Accept
                        </Button>
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-2">
                      <Select
                        disabled={disabled || projects.length === 0}
                        onValueChange={(projectId) => onReassign(row, projectId)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue
                            placeholder={
                              row.periodLocked
                                ? 'Locked'
                                : readOnly
                                  ? 'View only'
                                  : busy
                                    ? 'Saving…'
                                    : 'Choose project…'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {onOffSystem ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={disabled}
                          onClick={() => onOffSystem(row)}
                        >
                          Off-system
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                {showTypeActions ? (
                  <td className="px-3 py-2 min-w-[220px]">
                    {row.entryType === 'hour' ? (
                      <span className="text-muted-foreground">Hourly</span>
                    ) : (
                      <Select
                        disabled={disabled || pieceTypeOptions.length === 0}
                        value={currentTypeValue || undefined}
                        onValueChange={(value) => onRetagType?.(row, value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={busy ? 'Saving…' : 'Choose type…'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Drywall</SelectLabel>
                            {pieceTypeOptions
                              .filter((o) => o.group === 'drywall')
                              .map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Component labor</SelectLabel>
                            {pieceTypeOptions
                              .filter((o) => o.group === 'component')
                              .map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Legacy (v2)</SelectLabel>
                            {pieceTypeOptions
                              .filter((o) => o.group === 'legacy')
                              .map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                          {currentTypeValue &&
                          !pieceTypeOptions.some((o) => o.value === currentTypeValue) ? (
                            <SelectItem value={currentTypeValue}>
                              {labelForPieceKey(currentTypeValue, catalogs)} (current)
                            </SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function LaborAssignmentAudit({ readOnly = false }: Props) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MislabeledLaborEntry[]>([])
  const [offSystemRows, setOffSystemRows] = useState<MislabeledLaborEntry[]>([])
  const [projects, setProjects] = useState<DrywallProjectListItem[]>([])
  const [catalogs, setCatalogs] = useState<OrgDrywallCatalogs | null>(null)
  const [filter, setFilter] = useState('')
  const [scope, setScope] = useState<LaborAuditScope>('signal')
  const [reassigningKey, setReassigningKey] = useState<string | null>(null)
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [offSystemOpen, setOffSystemOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [bulkProjectId, setBulkProjectId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [auditRows, offSystem, drywallProjects, orgCatalogs] = await Promise.all([
        fetchDrywallLaborAudit({ scope }),
        fetchOffSystemLaborEntries(),
        fetchDrywallProjects(),
        fetchOrgDrywallCatalogs().catch(() => null),
      ])
      setRows(auditRows)
      setOffSystemRows(offSystem)
      setProjects(drywallProjects)
      setCatalogs(orgCatalogs)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load labor audit'
      toast.error(message)
      setRows([])
      setOffSystemRows([])
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    void load()
    setSelectedKeys(new Set())
  }, [load])

  const jobRows = useMemo(
    () => rows.filter((row) => JOB_PROBLEMS.includes(row.problem)),
    [rows],
  )
  const typeRows = useMemo(
    () => rows.filter((row) => row.problem === 'unknown_type'),
    [rows],
  )

  const summary = useMemo(() => summarizeMislabeledLaborAudit(rows), [rows])
  const nameMatchCounts = useMemo(() => countNameMatchSuggestions(jobRows), [jobRows])

  const filterQuery = filter.trim().toLowerCase()

  const filteredJobRows = useMemo(() => {
    if (!filterQuery) return jobRows
    return jobRows.filter((row) => matchesFilter(row, filterQuery))
  }, [jobRows, filterQuery])

  const filteredTypeRows = useMemo(() => {
    if (!filterQuery) return typeRows
    return typeRows.filter((row) => matchesFilter(row, filterQuery))
  }, [typeRows, filterQuery])

  const filteredOffSystemRows = useMemo(() => {
    if (!filterQuery) return offSystemRows
    return offSystemRows.filter((row) => matchesFilter(row, filterQuery))
  }, [offSystemRows, filterQuery])

  const removeRows = (targetRows: MislabeledLaborEntry[]) => {
    const keys = new Set(targetRows.map(rowKey))
    setRows((prev) => prev.filter((r) => !keys.has(rowKey(r))))
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      for (const key of keys) next.delete(key)
      return next
    })
  }

  const removeRow = (row: MislabeledLaborEntry) => {
    removeRows([row])
  }

  const selectedJobRows = useMemo(
    () => filteredJobRows.filter((row) => selectedKeys.has(rowKey(row))),
    [filteredJobRows, selectedKeys],
  )

  const allShownSelected =
    filteredJobRows.length > 0 &&
    filteredJobRows.every((row) => selectedKeys.has(rowKey(row)))

  const toggleSelectRow = (row: MislabeledLaborEntry) => {
    const key = rowKey(row)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAllShown = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allShownSelected) {
        for (const row of filteredJobRows) next.delete(rowKey(row))
      } else {
        for (const row of filteredJobRows) next.add(rowKey(row))
      }
      return next
    })
  }

  const optimisticOffSystem = (targetRows: MislabeledLaborEntry[]) => {
    removeRows(targetRows)
    setOffSystemRows((prev) => [
      ...prev,
      ...targetRows.map((row) => ({
        ...row,
        jobId: OFF_SYSTEM_JOB_ID,
        jobName: 'Off-system / Pre-app',
        problem: 'off_system' as const,
      })),
    ])
  }

  const handleReassign = async (
    row: MislabeledLaborEntry,
    projectId: string,
    projectName?: string,
  ) => {
    const project = projectName
      ? { id: projectId, name: projectName }
      : projects.find((p) => p.id === projectId)
    if (!project) return

    const key = rowKey(row)
    setReassigningKey(key)
    removeRow(row)
    try {
      await reassignLaborEntryJob(row, project.id, project.name)
      toast.success(`Assigned to ${project.name}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Reassignment failed'
      toast.error(message)
      void load()
    } finally {
      setReassigningKey(null)
    }
  }

  const handleAcceptSuggestion = async (row: MislabeledLaborEntry) => {
    if (!row.suggestedProjectId || !row.suggestedProjectName) return
    await handleReassign(row, row.suggestedProjectId, row.suggestedProjectName)
  }

  const handleOffSystem = async (row: MislabeledLaborEntry) => {
    const key = rowKey(row)
    setReassigningKey(key)
    optimisticOffSystem([row])
    try {
      await markLaborEntryOffSystem(row)
      toast.success('Marked off-system')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to mark off-system'
      toast.error(message)
      void load()
    } finally {
      setReassigningKey(null)
    }
  }

  const handleBulkOffSystem = async () => {
    if (selectedJobRows.length === 0) return
    const batch = [...selectedJobRows]
    setBulkAssigning(true)
    optimisticOffSystem(batch)
    try {
      const result = await markLaborEntriesOffSystem(batch)
      toast.success(formatBatchToast(result, 'Marked'))
      if (result.failed > 0) void load()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Bulk off-system failed'
      toast.error(message)
      void load()
    } finally {
      setBulkAssigning(false)
    }
  }

  const handleBulkAssignToProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project || selectedJobRows.length === 0) return

    const batch = [...selectedJobRows]
    setBulkAssigning(true)
    removeRows(batch)
    try {
      const result = await assignLaborEntriesToProject(batch, project.id, project.name)
      toast.success(formatBatchToast(result, 'Assigned'))
      if (result.failed > 0) void load()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Bulk assign failed'
      toast.error(message)
      void load()
    } finally {
      setBulkAssigning(false)
      setBulkProjectId('')
    }
  }

  const handleUnmarkOffSystem = async (row: MislabeledLaborEntry) => {
    const key = rowKey(row)
    setReassigningKey(key)
    const restored: MislabeledLaborEntry = {
      ...row,
      jobId: null,
      jobName: null,
      problem: 'no_job',
    }
    setOffSystemRows((prev) => prev.filter((r) => rowKey(r) !== key))
    setRows((prev) => [...prev, restored])
    try {
      await clearLaborEntryOffSystem(row)
      toast.success('Returned to unassigned')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to un-mark'
      toast.error(message)
      void load()
    } finally {
      setReassigningKey(null)
    }
  }

  const handleRetagType = async (row: MislabeledLaborEntry, value: string) => {
    if (!catalogs) return
    const opt = buildPayrollPieceTypeOptions(catalogs).find((o) => o.value === value)
    if (!opt) return

    const key = rowKey(row)
    setReassigningKey(key)
    removeRow(row)
    try {
      await retagLaborEntryType(row, {
        piece_key: opt.catalogSource === 'v3_drywall' ? opt.value : undefined,
        workType: opt.value,
        catalog_source: opt.catalogSource,
      })
      toast.success('Type updated')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Type update failed'
      toast.error(message)
      void load()
    } finally {
      setReassigningKey(null)
    }
  }

  const handleBulkAutoAssign = async () => {
    const candidates = jobRows.filter(
      (row) => row.suggestedProjectId && !row.periodLocked && row.problem !== 'unknown_type',
    )
    if (candidates.length === 0) return

    setBulkAssigning(true)
    removeRows(candidates)
    try {
      const result = await autoAssignNameMatches(candidates)
      const parts = [`Assigned ${result.assigned}`]
      if (result.skippedLocked > 0) {
        parts.push(`skipped ${result.skippedLocked} locked`)
      }
      if (result.failed > 0) {
        parts.push(`${result.failed} failed`)
      }
      toast.success(parts.join(' · '))
      if (result.failed > 0) void load()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Bulk assign failed'
      toast.error(message)
      void load()
    } finally {
      setBulkAssigning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
      </div>
    )
  }

  const hasAnyRows = jobRows.length > 0 || typeRows.length > 0 || offSystemRows.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Labor review</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Fix job assignments and piece types so payroll flows into drywall project costs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 size-4" />
            Sync
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={scope === 'signal' ? 'secondary' : 'ghost'}
            className="h-8"
            onClick={() => setScope('signal')}
          >
            Drywall labor
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === 'all' ? 'secondary' : 'ghost'}
            className="h-8"
            onClick={() => setScope('all')}
          >
            All unassigned
          </Button>
        </div>
        <Input
          placeholder="Filter by person, job, or period…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {!hasAnyRows ? (
        <div className="rounded-md border border-dashed px-6 py-10 text-center text-muted-foreground">
          <p className="text-base font-medium text-foreground">Nothing to review. 🎉</p>
          <p className="mt-1 text-sm">No mislabeled entries found in payroll history.</p>
        </div>
      ) : null}

      {jobRows.length > 0 ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-medium">Needs job</h3>
              <p className="text-sm text-muted-foreground">
                {jobRows.length} {jobRows.length === 1 ? 'entry' : 'entries'} without a valid project
              </p>
            </div>
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                disabled={nameMatchCounts.unlocked === 0 || bulkAssigning}
                onClick={() => void handleBulkAutoAssign()}
              >
                {bulkAssigning ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Auto-assign {nameMatchCounts.unlocked} name{' '}
                {nameMatchCounts.unlocked === 1 ? 'match' : 'matches'}
              </Button>
            ) : null}
          </div>

          {summary.total > 0 ? (
            <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {JOB_PROBLEMS.filter((p) => summary.byProblem[p] > 0).map((problem) => (
                  <li key={problem}>
                    {MISLABELED_LABOR_PROBLEM_LABELS[problem]}: {summary.byProblem[problem]}
                  </li>
                ))}
                {nameMatchCounts.total > 0 ? (
                  <li className="text-emerald-700 dark:text-emerald-400">
                    Name matches: {nameMatchCounts.total}
                    {nameMatchCounts.unlocked < nameMatchCounts.total
                      ? ` (${nameMatchCounts.unlocked} unlocked)`
                      : null}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {!readOnly && selectedJobRows.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-md border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium">
                {selectedJobRows.length} selected
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkAssigning}
                  onClick={() => void handleBulkOffSystem()}
                >
                  Mark {selectedJobRows.length} off-system
                </Button>
                <div className="flex items-center gap-2">
                  <Select
                    value={bulkProjectId}
                    disabled={bulkAssigning || projects.length === 0}
                    onValueChange={(projectId) => {
                      setBulkProjectId(projectId)
                      void handleBulkAssignToProject(projectId)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[220px]">
                      <SelectValue placeholder={`Assign ${selectedJobRows.length} to…`} />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : null}

          <AuditTable
            rows={filteredJobRows}
            projects={projects}
            catalogs={catalogs}
            readOnly={readOnly}
            reassigningKey={reassigningKey}
            bulkAssigning={bulkAssigning}
            onReassign={(row, id, name) => void handleReassign(row, id, name)}
            onAcceptSuggestion={(row) => void handleAcceptSuggestion(row)}
            onOffSystem={readOnly ? undefined : (row) => void handleOffSystem(row)}
            showJobActions
            showTypeActions={false}
            selectable={!readOnly}
            selectedKeys={selectedKeys}
            onToggleRow={toggleSelectRow}
            allShownSelected={allShownSelected}
            onToggleSelectAllShown={toggleSelectAllShown}
          />
          {jobRows.length > 0 && filteredJobRows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No job rows match your filter.</p>
          ) : null}
        </section>
      ) : null}

      {typeRows.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h3 className="font-medium">Needs type</h3>
            <p className="text-sm text-muted-foreground">
              Piece work on a drywall project with an unrecognized type ({typeRows.length})
            </p>
          </div>
          <AuditTable
            rows={filteredTypeRows}
            projects={projects}
            catalogs={catalogs}
            readOnly={readOnly}
            reassigningKey={reassigningKey}
            bulkAssigning={bulkAssigning}
            onReassign={() => {}}
            onAcceptSuggestion={() => {}}
            onRetagType={readOnly ? undefined : (row, value) => void handleRetagType(row, value)}
            showJobActions={false}
            showTypeActions
          />
          {typeRows.length > 0 && filteredTypeRows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No type rows match your filter.</p>
          ) : null}
        </section>
      ) : null}

      {offSystemRows.length > 0 ? (
        <Collapsible open={offSystemOpen} onOpenChange={setOffSystemOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="flex w-full items-center justify-between px-2">
              <span className="font-medium">Off-system ({offSystemRows.length})</span>
              <ChevronDown
                className={cn('size-4 transition-transform', offSystemOpen && 'rotate-180')}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Person</th>
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    {!readOnly ? <th className="px-3 py-2 font-medium">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredOffSystemRows.map((row) => {
                    const key = rowKey(row)
                    const busy = reassigningKey === key
                    return (
                      <tr key={key} className="border-b last:border-0">
                        <td className="px-3 py-2">{row.personName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.periodLabel}</td>
                        <td className="px-3 py-2 tabular-nums">{amountLabel(row)}</td>
                        <td className="px-3 py-2">{typeLabel(row, catalogs)}</td>
                        {!readOnly ? (
                          <td className="px-3 py-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={row.periodLocked || busy}
                              onClick={() => void handleUnmarkOffSystem(row)}
                            >
                              Un-mark
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
