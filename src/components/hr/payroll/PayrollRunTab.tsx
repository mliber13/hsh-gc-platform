import { useMemo } from 'react'
import { format, endOfWeek, startOfWeek } from 'date-fns'
import { Calculator, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateHrId } from '@/lib/hrTeamUtils'
import {
  aggregateRunTotalGross,
  buildPayrollPeople,
  calculateGross,
  getCalculationDetail,
  getNetPieceTotal,
  type PayrollRowPerson,
} from '@/lib/payrollMath'
import type { PayPeriod, PayrollEntry, PayrollProjectOption } from '@/types/payroll'
import type { Contractor1099, Employee } from '@/types/hr'
import { PayrollPersonRow } from './PayrollPersonRow'
import { PayrollSummaryBar } from './PayrollSummaryBar'
import { CalculationDetailDialog } from './CalculationDetailDialog'
import { useState } from 'react'

export type DraftEntries = Record<string, PayrollEntry>

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
  saving: boolean
  isDirty: boolean
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
  saving,
  isDirty,
}: PayrollRunTabProps) {
  const [calcOpen, setCalcOpen] = useState(false)

  const people = useMemo(
    () => buildPayrollPeople(employees, contractors, true),
    [employees, contractors],
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
      const gross = calculateGross(person, entry, is1099, entries, person.personKey)
      const netPiece = getNetPieceTotal(entry.pieceEntries, entries, person.personKey)
      return { person, entry, gross, netPiece }
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

  const calcDetails = useMemo(
    () =>
      getCalculationDetail(
        { entries: savedEntries.filter((e) => (parseFloat(String(e.gross)) || 0) > 0) },
        employees,
        contractors,
      ),
    [savedEntries, employees, contractors],
  )

  const setEntry = (personKey: string, entry: PayrollEntry) => {
    onEntriesChange({ ...entries, [personKey]: entry })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
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
        <Button type="button" variant="outline" size="sm" onClick={() => setCalcOpen(true)}>
          <Calculator className="mr-1 size-4" />
          View calculations
        </Button>
        <Button
          type="button"
          disabled={locked || saving || !periodStart || !periodEnd}
          onClick={onSave}
        >
          {saving ? 'Saving…' : isDirty ? 'Save payroll' : 'Save payroll (no changes)'}
        </Button>
      </div>

      <div className="space-y-3">
        {rows
          .filter((r) => r.gross > 0 || !locked)
          .map((r) => (
            <PayrollPersonRow
              key={r.person.personKey}
              person={r.person as PayrollRowPerson}
              entry={r.entry}
              gross={r.gross}
              locked={locked}
              projects={projects}
              allPeople={people as PayrollRowPerson[]}
              onChange={(e) => setEntry(r.person.personKey, e)}
            />
          ))}
      </div>

      <CalculationDetailDialog
        open={calcOpen}
        onOpenChange={setCalcOpen}
        details={calcDetails}
        title={`Calculations · ${periodStart} – ${periodEnd}`}
      />
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
  const people = buildPayrollPeople(employees, contractors, true)
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
    const gross = calculateGross(person, entry, is1099, entries, person.personKey)
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
