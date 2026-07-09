import { useEffect, useMemo, useState } from 'react'
import { format, endOfWeek, startOfWeek } from 'date-fns'
import { CalendarRange, Copy, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { generateHrId, isArchivedMember } from '@/lib/hrTeamUtils'
import {
  aggregateRunTotalGross,
  buildPayrollPeople,
  calculateGross,
  calculateHourlyPayComponent,
  calculateHoursTotal,
  getNetPieceTotal,
  isPayrollDraftEmpty,
  payrollRowVisibleWhenHidingEmpty,
  personKey,
  type PayrollRowPerson,
} from '@/lib/payrollMath'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { PayPeriod, PayrollEntry, PayrollProjectOption } from '@/types/payroll'
import type { Contractor1099, Employee } from '@/types/hr'
import { PayrollPersonRow } from './PayrollPersonRow'
import { PayrollSummaryBar } from './PayrollSummaryBar'

export type DraftEntries = Record<string, PayrollEntry>

// Archived members' pay is historical — never recompute it from the current roster
// (their salary/rate may be gone or changed, which would zero or inflate paid amounts).
// Preserve the stored entry gross; fall back to calculateGross only when there's no stored value.
function resolvePayrollGross(
  person: Parameters<typeof calculateGross>[0],
  entry: Parameters<typeof calculateGross>[1],
  is1099: boolean,
  allEntries: Record<string, PayrollEntry>,
  pk: string,
): number {
  if (isArchivedMember(person as { status?: string | null; active?: boolean })) {
    const stored = Number(entry?.gross)
    if (entry && Number.isFinite(stored)) return stored
  }
  return calculateGross(person, entry, is1099, allEntries, pk)
}

interface PayrollRunTabProps {
  periodStart: string
  periodEnd: string
  onPeriodStartChange: (v: string) => void
  onPeriodEndChange: (v: string) => void
  entries: DraftEntries
  onEntriesChange: (e: DraftEntries) => void
  editingRun: PayPeriod | null
  locked: boolean
  employees: Employee[]
  contractors: Contractor1099[]
  projects: PayrollProjectOption[]
  onSave: () => void
  onImportTimeClock: () => void
  onStartNextFromLast: () => void
  canStartNextFromLast: boolean
  onThisWeek: () => void
  onLastWeek: () => void
  showManualRows: boolean
  onBeginManualEntry: () => void
  saving: boolean
  isDirty: boolean
  importingTimeClock: boolean
  rowResetKey: string
}

function defaultWeekRange() {
  const today = new Date()
  return {
    start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}

export function defaultPayrollPeriodDates() {
  return defaultWeekRange()
}

export function entriesFromRun(run: PayPeriod): DraftEntries {
  const loaded: DraftEntries = {}
  ;(run.entries || []).forEach((e) => {
    const pk = e.personType === 'w2' ? `w2-${e.personId}` : `c-${e.personId}`
    loaded[pk] = {
      ...e,
      hourEntries: (e.hourEntries || []).map((he) => ({
        ...he,
        id: he.id || generateHrId(),
        overtimeType: he.overtimeType || 'regular',
      })),
      pieceEntries: (e.pieceEntries || []).map((pe) => ({
        ...pe,
        id: pe.id || generateHrId(),
      })),
    }
  })
  return loaded
}

export function PayrollRunTab({
  periodStart,
  periodEnd,
  onPeriodStartChange,
  onPeriodEndChange,
  entries,
  onEntriesChange,
  editingRun,
  locked,
  employees,
  contractors,
  projects,
  onSave,
  onImportTimeClock,
  onStartNextFromLast,
  canStartNextFromLast,
  onThisWeek,
  onLastWeek,
  showManualRows,
  onBeginManualEntry,
  saving,
  isDirty,
  importingTimeClock,
  rowResetKey,
}: PayrollRunTabProps) {
  const [hideEmptyRows, setHideEmptyRows] = useState(false)
  const [drywallCatalogs, setDrywallCatalogs] = useState<OrgDrywallCatalogs | null>(null)

  const retainedPersonKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const k of Object.keys(entries)) keys.add(k)
    return keys
  }, [entries])

  const people = useMemo(
    () => buildPayrollPeople(employees, contractors, false, retainedPersonKeys),
    [employees, contractors, retainedPersonKeys],
  )

  const rows = useMemo(() => {
    return people.map((person) => {
      const entry =
        entries[person.personKey] ||
        ({
          personId: person.id,
          personType: person.personType === 'w2' ? 'w2' : '1099',
          personName: person.name,
          hourEntries: [],
          pieceEntries: [],
        } as PayrollEntry)
      const is1099 = person.personType === '1099'
      const gross = resolvePayrollGross(person, entry, is1099, entries, person.personKey)
      const netPiece = getNetPieceTotal(entry.pieceEntries, entries, person.personKey)
      const totalHours = calculateHoursTotal(entry.hourEntries, entry.hours)
      const hourlyPay = calculateHourlyPayComponent(person, entry)
      return { person, entry, gross, netPiece, totalHours, hourlyPay }
    })
  }, [people, entries])

  const savedEntries = useMemo((): PayrollEntry[] => {
    return rows.map((r) => ({
      personId: r.person.id,
      personType: r.person.personType === 'w2' ? 'w2' : '1099',
      personName: r.person.name,
      hourEntries: r.entry.hourEntries || [],
      hours: r.entry.hourEntries?.reduce((s, h) => s + (parseFloat(String(h.hours)) || 0), 0) || 0,
      pieceEntries: r.entry.pieceEntries || [],
      pieceTotal: r.netPiece,
      reimbursement: r.entry.reimbursement ?? '',
      perDiem: r.entry.perDiem ?? '',
      bankedHoursUsed: r.entry.bankedHoursUsed ?? '',
      hoursToBank: r.entry.hoursToBank ?? '',
      gross: r.gross,
      done: r.entry.done ?? false,
    }))
  }, [rows])

  const totalGross = aggregateRunTotalGross(savedEntries)
  const w2Total = savedEntries
    .filter((e) => e.personType === 'w2')
    .reduce((s, e) => s + (parseFloat(String(e.gross)) || 0), 0)
  const c1099Total = totalGross - w2Total
  const withPay = savedEntries.filter((e) => (parseFloat(String(e.gross)) || 0) > 0).length

  const draftEmpty = isPayrollDraftEmpty(entries) && !showManualRows

  useEffect(() => {
    if (draftEmpty) return
    let cancelled = false
    fetchOrgDrywallCatalogs()
      .then((catalogs) => {
        if (!cancelled) setDrywallCatalogs(catalogs)
      })
      .catch((err) => {
        console.error('PayrollRunTab: failed to load drywall catalogs', err)
      })
    return () => {
      cancelled = true
    }
  }, [draftEmpty])

  const visibleRows = useMemo(() => {
    const base = locked ? rows.filter((r) => r.gross > 0) : rows
    if (!hideEmptyRows) return base
    return base.filter((r) => payrollRowVisibleWhenHidingEmpty(r.gross, r.entry))
  }, [rows, locked, hideEmptyRows])

  const setEntry = (personKey: string, entry: PayrollEntry) => {
    onEntriesChange({ ...entries, [personKey]: entry })
  }

  const togglePersonDone = (personKey: string) => {
    const current = entries[personKey]
    if (!current) return
    setEntry(personKey, { ...current, done: !current.done })
  }

  const startNextButton = (
    <Button
      type="button"
      variant="default"
      size="sm"
      disabled={!canStartNextFromLast || locked}
      onClick={onStartNextFromLast}
    >
      <Copy className="mr-1 size-4" />
      Start next period from last
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44">
            <Label htmlFor="period-start">Period start</Label>
            <Input
              id="period-start"
              type="date"
              disabled={locked}
              value={periodStart}
              onChange={(e) => onPeriodStartChange(e.target.value)}
            />
          </div>
          <div className="min-w-44">
            <Label htmlFor="period-end">Period end</Label>
            <Input
              id="period-end"
              type="date"
              disabled={locked}
              value={periodEnd}
              onChange={(e) => onPeriodEndChange(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={locked} onClick={onLastWeek}>
            Last week
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={locked} onClick={onThisWeek}>
            This week
          </Button>
          {canStartNextFromLast ? (
            startNextButton
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">{startNextButton}</span>
              </TooltipTrigger>
              <TooltipContent>No previous payroll to copy from</TooltipContent>
            </Tooltip>
          )}
          {editingRun?.locked && (
            <span className="flex items-center gap-1 text-sm text-amber-700">
              <Lock className="size-4" />
              Locked — unlock from Past payrolls to edit
            </span>
          )}
        </div>
      </div>

      <PayrollSummaryBar
        totalGross={totalGross}
        w2Total={w2Total}
        c1099Total={c1099Total}
        entryCount={withPay}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={hideEmptyRows}
              onChange={(e) => setHideEmptyRows(e.target.checked)}
            />
            Hide empty rows
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked || importingTimeClock}
            onClick={onImportTimeClock}
          >
            {importingTimeClock ? 'Loading import…' : 'Import from TimeClock'}
          </Button>
        </div>
        <Button
          type="button"
          disabled={locked || saving || !periodStart || !periodEnd}
          onClick={onSave}
        >
          {saving ? 'Saving…' : isDirty ? 'Save payroll' : 'Save payroll (no changes)'}
        </Button>
      </div>

      {draftEmpty ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center">
          <CalendarRange className="mx-auto mb-3 size-10 text-muted-foreground/60" />
          <p className="text-lg font-medium">Start this pay period</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Copy last week&apos;s jobs and row structure with hours and piece pay zeroed, or enter
            payroll manually.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {canStartNextFromLast ? (
              <Button type="button" size="lg" disabled={locked} onClick={onStartNextFromLast}>
                <Copy className="mr-2 size-4" />
                Start next period from last
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button type="button" size="lg" disabled>
                      <Copy className="mr-2 size-4" />
                      Start next period from last
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>No previous payroll to copy from</TooltipContent>
              </Tooltip>
            )}
            <Button type="button" variant="outline" size="lg" disabled={locked} onClick={onBeginManualEntry}>
              Add manually
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={locked || importingTimeClock}
              onClick={onImportTimeClock}
            >
              {importingTimeClock ? 'Loading…' : 'Import from TimeClock'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((r) => (
            <PayrollPersonRow
              key={`${r.person.personKey}-${rowResetKey}`}
              person={r.person as PayrollRowPerson}
              entry={r.entry}
              gross={r.gross}
              totalHours={r.totalHours}
              hourlyPay={r.hourlyPay}
              piecePay={r.netPiece}
              locked={locked}
              projects={projects}
              allPeople={people as PayrollRowPerson[]}
              drywallCatalogs={drywallCatalogs}
              onChange={(e) => setEntry(r.person.personKey, e)}
              onToggleDone={() => togglePersonDone(r.person.personKey)}
            />
          ))}
          {visibleRows.length === 0 && hideEmptyRows && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No rows with pay or adjustments. Turn off &quot;Hide empty rows&quot; to see everyone.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Build persisted run payload from current draft rows. */
export function buildRunPayloadFromDraft(
  periodStart: string,
  periodEnd: string,
  entries: DraftEntries,
  employees: Employee[],
  contractors: Contractor1099[],
  existing?: PayPeriod,
): Omit<PayPeriod, 'id'> & { id?: string } {
  const retainedPersonKeys = new Set<string>()
  for (const k of Object.keys(entries)) retainedPersonKeys.add(k)
  for (const prev of existing?.entries ?? []) {
    retainedPersonKeys.add(personKey(prev.personId, prev.personType))
  }

  const people = buildPayrollPeople(employees, contractors, false, retainedPersonKeys)
  const runEntries: PayrollEntry[] = people.map((person) => {
    const entry =
      entries[person.personKey] || {
        personId: person.id,
        personType: person.personType === 'w2' ? 'w2' : '1099',
        personName: person.name,
        hourEntries: [],
        pieceEntries: [],
      }
    const is1099 = person.personType === '1099'
    const gross = resolvePayrollGross(person, entry, is1099, entries, person.personKey)
    const netPiece = getNetPieceTotal(entry.pieceEntries, entries, person.personKey)
    const hoursTotal = (entry.hourEntries || []).reduce(
      (s, h) => s + (parseFloat(String(h.hours)) || 0),
      0,
    )
    return {
      personId: person.id,
      personType: person.personType === 'w2' ? 'w2' : '1099',
      personName: person.name,
      hourEntries: entry.hourEntries || [],
      hours: hoursTotal,
      pieceEntries: entry.pieceEntries || [],
      pieceTotal: netPiece,
      reimbursement: entry.reimbursement ?? '',
      perDiem: entry.perDiem ?? '',
      bankedHoursUsed: entry.bankedHoursUsed ?? '',
      hoursToBank: entry.hoursToBank ?? '',
      gross,
      done: entry.done ?? false,
    }
  })

  const emitted = new Set(runEntries.map((e) => personKey(e.personId, e.personType)))
  for (const prev of existing?.entries ?? []) {
    const k = personKey(prev.personId, prev.personType)
    if (!emitted.has(k)) runEntries.push(prev)
  }

  const totalGross = aggregateRunTotalGross(runEntries)
  return {
    ...(existing || {}),
    startDate: periodStart,
    endDate: periodEnd,
    completedAt: new Date().toISOString(),
    entries: runEntries,
    totalGross,
    locked: existing?.locked ?? false,
  }
}
