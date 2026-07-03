import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  autoAssignNameMatches,
  countNameMatchSuggestions,
  fetchDrywallLaborAudit,
  reassignLaborEntryJob,
  summarizeMislabeledLaborAudit,
  MISLABELED_LABOR_PROBLEM_LABELS,
  type MislabeledLaborEntry,
  type MislabeledLaborProblem,
} from '@/services/drywallLaborAuditService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { cn } from '@/lib/utils'
import type { DrywallProjectListItem } from '@/types/drywall'
import { formatCurrency } from './payrollFormat'

function rowKey(row: MislabeledLaborEntry): string {
  return `${row.payPeriodId}:${row.personId}:${row.personType}:${row.entryType}:${row.entryIndex}`
}

function currentJobLabel(row: MislabeledLaborEntry): string {
  if (!row.jobId && !row.jobName) return '—'
  if (row.jobId === 'unassigned') return 'Unassigned'
  if (row.jobId === 'other' && row.jobName) return row.jobName
  if (row.jobName) return row.jobName
  if (row.jobId) return row.jobId
  return '—'
}

function quantityLabel(row: MislabeledLaborEntry): string {
  if (row.entryType === 'hour') {
    return row.hours != null ? `${row.hours.toFixed(2)} hr` : '—'
  }
  const parts: string[] = []
  if (row.pieces != null && row.pieces > 0) {
    parts.push(`${Math.round(row.pieces).toLocaleString()} sqft`)
  }
  if (row.amount != null && row.amount > 0) {
    parts.push(formatCurrency(row.amount))
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

const PROBLEM_ORDER: MislabeledLaborProblem[] = [
  'no_job',
  'unassigned',
  'custom_name',
  'stale_project_id',
]

export function LaborAssignmentAudit() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MislabeledLaborEntry[]>([])
  const [projects, setProjects] = useState<DrywallProjectListItem[]>([])
  const [filter, setFilter] = useState('')
  const [includeAllUnassigned, setIncludeAllUnassigned] = useState(false)
  const [reassigningKey, setReassigningKey] = useState<string | null>(null)
  const [bulkAssigning, setBulkAssigning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [auditRows, drywallProjects] = await Promise.all([
        fetchDrywallLaborAudit({ includeAllUnassigned }),
        fetchDrywallProjects(),
      ])
      setRows(auditRows)
      setProjects(drywallProjects)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load labor audit'
      toast.error(message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [includeAllUnassigned])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => summarizeMislabeledLaborAudit(rows), [rows])
  const nameMatchCounts = useMemo(() => countNameMatchSuggestions(rows), [rows])

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const haystack = [
        row.personName,
        row.periodLabel,
        row.jobName,
        row.jobId,
        row.suggestedProjectName,
        row.pieceKeyOrWorkType,
        MISLABELED_LABOR_PROBLEM_LABELS[row.problem],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, filter])

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
    try {
      await reassignLaborEntryJob(row, project.id, project.name)
      setRows((prev) => prev.filter((r) => rowKey(r) !== key))
      toast.success(`Assigned to ${project.name}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Reassignment failed'
      toast.error(message)
      if (message.includes('Refresh')) {
        void load()
      }
    } finally {
      setReassigningKey(null)
    }
  }

  const handleAcceptSuggestion = async (row: MislabeledLaborEntry) => {
    if (!row.suggestedProjectId || !row.suggestedProjectName) return
    await handleReassign(row, row.suggestedProjectId, row.suggestedProjectName)
  }

  const handleBulkAutoAssign = async () => {
    setBulkAssigning(true)
    try {
      const result = await autoAssignNameMatches(rows)
      const parts = [`Assigned ${result.assigned}`]
      if (result.skippedLocked > 0) {
        parts.push(`skipped ${result.skippedLocked} locked`)
      }
      if (result.failed > 0) {
        parts.push(`${result.failed} failed`)
      }
      toast.success(parts.join(' · '))
      await load()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Bulk assign failed'
      toast.error(message)
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Labor assignment audit</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Drywall labor that is not linked to a project (blank job, unassigned, custom name, or
            stale ID). Reassign here so it flows into project labor costs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={nameMatchCounts.unlocked === 0 || bulkAssigning}
            onClick={() => void handleBulkAutoAssign()}
          >
            {bulkAssigning ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Auto-assign {nameMatchCounts.unlocked} name{' '}
            {nameMatchCounts.unlocked === 1 ? 'match' : 'matches'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-medium">
            {summary.total} {summary.total === 1 ? 'entry needs' : 'entries need'} a job
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            {PROBLEM_ORDER.filter((p) => summary.byProblem[p] > 0).map((problem) => (
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
      ) : (
        <div className="rounded-md border border-dashed px-6 py-10 text-center text-muted-foreground">
          <p className="text-base font-medium text-foreground">All drywall labor is assigned. 🎉</p>
          <p className="mt-1 text-sm">No mislabeled entries found in payroll history.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Filter by person, job, or period…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <input
            id="include-all-unassigned"
            type="checkbox"
            className="size-4 rounded border"
            checked={includeAllUnassigned}
            onChange={(e) => setIncludeAllUnassigned(e.target.checked)}
          />
          <Label htmlFor="include-all-unassigned" className="text-sm font-normal">
            Include blank hourly rows (no drywall signal)
          </Label>
        </div>
      </div>

      {filteredRows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Hours / pieces</th>
                <th className="px-3 py-2 font-medium">Current job</th>
                <th className="px-3 py-2 font-medium">Problem</th>
                <th className="px-3 py-2 font-medium">Reassign</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const key = rowKey(row)
                const busy = reassigningKey === key || bulkAssigning
                const disabled = row.periodLocked || busy
                const hasSuggestion = Boolean(row.suggestedProjectId)

                return (
                  <tr
                    key={key}
                    className={cn(
                      'border-b last:border-0',
                      hasSuggestion && 'bg-emerald-50/60 dark:bg-emerald-950/20',
                    )}
                  >
                    <td className="px-3 py-2">{row.personName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.periodLabel}</td>
                    <td className="px-3 py-2 capitalize">
                      {row.entryType}
                      {row.pieceKeyOrWorkType ? (
                        <span className="block text-xs text-muted-foreground">
                          {row.pieceKeyOrWorkType}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{quantityLabel(row)}</td>
                    <td className="px-3 py-2">{currentJobLabel(row)}</td>
                    <td className="px-3 py-2">
                      {MISLABELED_LABOR_PROBLEM_LABELS[row.problem]}
                      {row.periodLocked ? (
                        <span className="mt-0.5 block text-xs text-amber-600">Period locked</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 min-w-[240px]">
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
                            onClick={() => void handleAcceptSuggestion(row)}
                          >
                            Accept
                          </Button>
                        </div>
                      ) : null}
                      <Select
                        disabled={disabled || projects.length === 0}
                        onValueChange={(projectId) => void handleReassign(row, projectId)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue
                            placeholder={
                              row.periodLocked
                                ? 'Locked'
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && filteredRows.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No rows match your filter.</p>
      )}
    </div>
  )
}
