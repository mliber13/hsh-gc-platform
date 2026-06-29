import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Plus, Trash2, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateHrId } from '@/lib/hrTeamUtils'
import {
  buildPayrollPieceTypeOptions,
  defaultPhasesForPieceKey,
  defaultRateForPieceKey,
  isLegacyPayrollWorkType,
  labelForPieceKey,
  resolvePieceEntryKey,
  type PayrollPieceTypeOption,
} from '@/lib/drywall/payrollPieceKeys'
import { entryHasNonZeroAdjustments } from '@/lib/payrollMath'
import {
  PAYROLL_WORK_TYPES,
  getRateFromJob,
  getSqftFromJob,
  recalcPieceEntryAmount,
  type PayrollRowPerson,
} from '@/lib/payrollMath'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type {
  PayrollEntry,
  PayrollHourEntry,
  PayrollPieceCatalogSource,
  PayrollPieceEntry,
  PayrollProjectOption,
} from '@/types/payroll'
import { formatCurrency } from './payrollFormat'
import { JobCombobox } from './JobCombobox'

interface PayrollPersonRowProps {
  person: PayrollRowPerson
  entry: PayrollEntry
  gross: number
  totalHours: number
  hourlyPay: number
  piecePay: number
  locked: boolean
  projects: PayrollProjectOption[]
  allPeople: PayrollRowPerson[]
  drywallCatalogs: OrgDrywallCatalogs | null
  onChange: (entry: PayrollEntry) => void
  onToggleDone: () => void
}

function resolvePieceRate(
  pieceKey: string,
  catalogSource: PayrollPieceCatalogSource | undefined,
  project: PayrollProjectOption | undefined,
  catalogs: OrgDrywallCatalogs | null,
): number | null {
  const source =
    catalogSource ??
    (isLegacyPayrollWorkType(pieceKey) ? 'legacy' : catalogs ? 'v3_drywall' : 'legacy')

  if (source === 'v3_drywall' && catalogs) {
    return defaultRateForPieceKey(pieceKey, catalogs)
  }

  return project ? getRateFromJob(project, pieceKey) : null
}

function pieceTypePatchForSelection(
  pieceKey: string,
  option: PayrollPieceTypeOption | undefined,
  catalogs: OrgDrywallCatalogs | null,
  project: PayrollProjectOption | undefined,
  currentRate: PayrollPieceEntry['rate'],
): Partial<PayrollPieceEntry> {
  const catalogSource = option?.catalogSource ?? 'legacy'
  const rate = resolvePieceRate(pieceKey, catalogSource, project, catalogs)
  const defaultPhases =
    option?.defaultPhases ??
    (catalogs ? defaultPhasesForPieceKey(pieceKey, catalogs) : 1)

  return {
    piece_key: catalogSource === 'v3_drywall' ? pieceKey : undefined,
    workType: pieceKey,
    catalog_source: catalogSource,
    totalPhases: defaultPhases,
    rate: rate != null ? String(rate) : catalogSource === 'v3_drywall' ? '' : currentRate,
  }
}

export function PayrollPersonRow({
  person,
  entry,
  gross,
  totalHours,
  hourlyPay,
  piecePay,
  locked,
  projects,
  allPeople,
  drywallCatalogs,
  onChange,
  onToggleDone,
}: PayrollPersonRowProps) {
  const personDone = Boolean(entry.done)
  const effectiveLocked = locked || personDone
  const hourEntries = entry.hourEntries || []
  const pieceEntries = entry.pieceEntries || []
  const hasAdjustments = entryHasNonZeroAdjustments(entry)

  const pieceTypeOptions = useMemo(
    () => (drywallCatalogs ? buildPayrollPieceTypeOptions(drywallCatalogs) : []),
    [drywallCatalogs],
  )

  const pieceTypeOptionByValue = useMemo(() => {
    const map = new Map<string, PayrollPieceTypeOption>()
    for (const option of pieceTypeOptions) {
      map.set(option.value, option)
    }
    return map
  }, [pieceTypeOptions])

  const legacyPieceTypeOptions = useMemo(
    () =>
      PAYROLL_WORK_TYPES.map((wt) => ({
        value: wt.value,
        label: wt.label,
        group: 'legacy' as const,
        catalogSource: 'legacy' as const,
        defaultPhases: wt.defaultPhases,
      })),
    [],
  )

  const [hoursOpen, setHoursOpen] = useState(() => hourEntries.length > 0)
  const [pieceOpen, setPieceOpen] = useState(() => pieceEntries.length > 0)
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(() => hasAdjustments)

  const update = (patch: Partial<PayrollEntry>) => {
    const next = { ...entry, ...patch }
    onChange(next)
    if (
      !adjustmentsOpen &&
      entryHasNonZeroAdjustments(next)
    ) {
      setAdjustmentsOpen(true)
    }
  }

  const addHour = () => {
    const row: PayrollHourEntry = {
      id: generateHrId(),
      jobId: '',
      jobName: '',
      hours: '',
      overtimeType: 'regular',
    }
    update({ hourEntries: [...hourEntries, row] })
    setHoursOpen(true)
  }

  const patchHour = (idx: number, patch: Partial<PayrollHourEntry>) => {
    const list = [...hourEntries]
    list[idx] = { ...list[idx], ...patch }
    update({ hourEntries: list })
  }

  const removeHour = (idx: number) => {
    update({ hourEntries: hourEntries.filter((_, i) => i !== idx) })
  }

  const addPiece = () => {
    const row: PayrollPieceEntry = {
      id: generateHrId(),
      jobId: '',
      jobName: '',
      workType: 'finisher',
      totalPhases: 5,
      phasesCompleted: '',
      jobTotalSqft: '',
      rate: '',
    }
    update({ pieceEntries: [...pieceEntries, row] })
    setPieceOpen(true)
  }

  const patchPiece = (idx: number, patch: Partial<PayrollPieceEntry>) => {
    const list = [...pieceEntries]
    let next = { ...list[idx], ...patch }
    const recalcFields = [
      'totalPhases',
      'phasesCompleted',
      'jobTotalSqft',
      'rate',
      'workType',
      'piece_key',
    ]
    if (Object.keys(patch).some((k) => recalcFields.includes(k))) {
      next = { ...next, amount: recalcPieceEntryAmount(next) }
    }
    if (patch.workType || patch.piece_key) {
      const key = resolvePieceEntryKey(next)
      const opt = pieceTypeOptionByValue.get(key)
      if (opt) next.totalPhases = opt.defaultPhases
      else {
        const wt = PAYROLL_WORK_TYPES.find((w) => w.value === key)
        if (wt) next.totalPhases = wt.defaultPhases
      }
    }
    list[idx] = next
    update({ pieceEntries: list })
  }

  const removePiece = (idx: number) => {
    update({ pieceEntries: pieceEntries.filter((_, i) => i !== idx) })
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-sm transition-colors',
        personDone && 'border-emerald-500/30 bg-emerald-500/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-3 border-b pb-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 shrink-0 p-0"
            disabled={locked}
            onClick={onToggleDone}
            title={personDone ? 'Unlock — allow edits' : 'Lock — done with this person'}
          >
            {personDone ? (
              <Lock className="size-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Unlock className="size-4 text-muted-foreground" />
            )}
          </Button>
          <div className="min-w-0">
            <p className="font-medium">{person.name}</p>
            <p className="text-xs text-muted-foreground">
              {person.personType === 'w2' ? 'W2' : '1099'} · {person.payType || 'hourly'}
              {personDone && (
                <span className="ml-2 text-emerald-700 dark:text-emerald-300">· Done</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span title="Total hours entered">
            <span className="font-medium text-foreground tabular-nums">
              {totalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>{' '}
            hrs
          </span>
          <span title="Hourly pay (before piece and adjustments)">
            Hourly{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatCurrency(hourlyPay)}
            </span>
          </span>
          <span title="Net piece pay (after helper deductions)">
            Piece{' '}
            <span className="font-medium text-foreground tabular-nums">
              {formatCurrency(piecePay)}
            </span>
          </span>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">{formatCurrency(gross)}</p>
      </div>

      {/* Hours — primary */}
      <section className="mt-4 rounded-lg border border-border/80 bg-muted/10 p-3">
        <button
          type="button"
          className="flex w-full items-center gap-1 text-sm font-semibold"
          onClick={() => setHoursOpen((o) => !o)}
        >
          {hoursOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Hours ({hourEntries.length})
        </button>
        {hoursOpen ? (
          <div className="mt-3 space-y-2">
            {hourEntries.map((he, idx) => (
              <div key={he.id || idx} className="grid gap-2 rounded border bg-card p-2 md:grid-cols-6">
                <JobCombobox
                  jobId={he.jobId}
                  jobName={he.jobName}
                  projects={projects}
                  disabled={effectiveLocked}
                  onChange={(sel) => patchHour(idx, { jobId: sel.jobId, jobName: sel.jobName })}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.25"
                  placeholder="Hours"
                  disabled={effectiveLocked}
                  value={he.hours ?? ''}
                  onChange={(e) => patchHour(idx, { hours: e.target.value })}
                />
                <Select
                  disabled={effectiveLocked}
                  value={he.overtimeType || 'regular'}
                  onValueChange={(v) => patchHour(idx, { overtimeType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="1.5">OT 1.5×</SelectItem>
                    <SelectItem value="2">OT 2×</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Rate override"
                  disabled={effectiveLocked}
                  value={he.rateOverride ?? ''}
                  onChange={(e) => patchHour(idx, { rateOverride: e.target.value })}
                />
                <Select
                  disabled={effectiveLocked}
                  value={he.assignToPersonId || 'none'}
                  onValueChange={(v) => {
                    const assignee = allPeople.find((p) => p.personKey === v)
                    patchHour(idx, {
                      assignToPersonId: v === 'none' ? '' : v,
                      assignToPersonName: assignee?.name || '',
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Assign to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Assign —</SelectItem>
                    {allPeople
                      .filter((p) => p.personKey !== person.personKey)
                      .map((p) => (
                        <SelectItem key={p.personKey} value={p.personKey}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!effectiveLocked && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="justify-self-end"
                    onClick={() => removeHour(idx)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {!effectiveLocked && (
              <Button type="button" variant="outline" size="sm" onClick={addHour}>
                <Plus className="mr-1 size-4" />
                Add hours row
              </Button>
            )}
          </div>
        ) : (
          !effectiveLocked &&
          hourEntries.length === 0 && (
            <Button type="button" className="mt-3 w-full sm:w-auto" onClick={addHour}>
              <Plus className="mr-1 size-4" />
              Add hours row
            </Button>
          )
        )}
      </section>

      {/* Piece — primary */}
      <section className="mt-3 rounded-lg border border-border/80 bg-muted/10 p-3">
        <button
          type="button"
          className="flex w-full items-center gap-1 text-sm font-semibold"
          onClick={() => setPieceOpen((o) => !o)}
        >
          {pieceOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Piece ({pieceEntries.length})
        </button>
        {pieceOpen ? (
          <div className="mt-3 space-y-2">
            {pieceEntries.map((pe, idx) => {
              const pieceKey = resolvePieceEntryKey(pe)
              const knownOption = pieceTypeOptionByValue.get(pieceKey)
              const orphanLabel =
                !knownOption && pieceKey
                  ? labelForPieceKey(pieceKey, drywallCatalogs)
                  : null

              return (
              <div key={pe.id || idx} className="grid gap-2 rounded border bg-card p-2 md:grid-cols-8">
                <JobCombobox
                  jobId={pe.jobId}
                  jobName={pe.jobName}
                  projects={projects}
                  disabled={effectiveLocked}
                  onChange={(sel) => {
                    if (!sel.jobId) {
                      patchPiece(idx, { jobId: '', jobName: '' })
                      return
                    }
                    if (sel.jobId === 'other') {
                      patchPiece(idx, { jobId: 'other', jobName: sel.jobName })
                      return
                    }
                    const project = projects.find((p) => p.id === sel.jobId)
                    const key = resolvePieceEntryKey(pe)
                    const rate = resolvePieceRate(
                      key,
                      pe.catalog_source,
                      project,
                      drywallCatalogs,
                    )
                    const sqft = project ? getSqftFromJob(project) : null
                    patchPiece(idx, {
                      jobId: sel.jobId,
                      jobName: sel.jobName,
                      rate: rate != null ? String(rate) : pe.rate,
                      jobTotalSqft: sqft != null ? String(sqft) : pe.jobTotalSqft,
                    })
                  }}
                />
                <Select
                  disabled={effectiveLocked}
                  value={pieceKey}
                  onValueChange={(v) => {
                    const opt = pieceTypeOptionByValue.get(v)
                    const proj = projects.find((p) => p.id === pe.jobId)
                    patchPiece(
                      idx,
                      pieceTypePatchForSelection(v, opt, drywallCatalogs, proj, pe.rate),
                    )
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pieceTypeOptions.length > 0 ? (
                      <>
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
                      </>
                    ) : (
                      legacyPieceTypeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))
                    )}
                    {orphanLabel && (
                      <SelectItem value={pieceKey}>{orphanLabel}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Phases done"
                  disabled={effectiveLocked}
                  value={pe.phasesCompleted ?? ''}
                  onChange={(e) => patchPiece(idx, { phasesCompleted: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Total phases"
                  disabled={effectiveLocked}
                  value={pe.totalPhases ?? ''}
                  onChange={(e) => patchPiece(idx, { totalPhases: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Sqft"
                  disabled={effectiveLocked}
                  value={pe.jobTotalSqft ?? ''}
                  onChange={(e) => patchPiece(idx, { jobTotalSqft: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Rate"
                  disabled={effectiveLocked}
                  value={pe.rate ?? ''}
                  onChange={(e) => patchPiece(idx, { rate: e.target.value })}
                />
                <span className="self-center text-right text-sm font-medium tabular-nums">
                  {formatCurrency(parseFloat(String(pe.amount)) || 0)}
                </span>
                {!effectiveLocked && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="justify-self-end"
                    onClick={() => removePiece(idx)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            )})}
            {!effectiveLocked && (
              <Button type="button" variant="outline" size="sm" onClick={addPiece}>
                <Plus className="mr-1 size-4" />
                Add piece row
              </Button>
            )}
          </div>
        ) : (
          !effectiveLocked &&
          pieceEntries.length === 0 && (
            <Button type="button" className="mt-3 w-full sm:w-auto" onClick={addPiece}>
              <Plus className="mr-1 size-4" />
              Add piece row
            </Button>
          )
        )}
      </section>

      {/* Adjustments — secondary */}
      <section className="mt-3 rounded-md border border-dashed border-muted-foreground/25 bg-muted/5 px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
          onClick={() => setAdjustmentsOpen((o) => !o)}
        >
          {adjustmentsOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Adjustments
          {hasAdjustments && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">has values</span>
          )}
        </button>
        {adjustmentsOpen && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <Label className="text-[11px] text-muted-foreground">Per diem</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={effectiveLocked}
                className="h-8 text-sm"
                value={entry.perDiem ?? ''}
                onChange={(e) => update({ perDiem: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Reimbursement</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={effectiveLocked}
                className="h-8 text-sm"
                value={entry.reimbursement ?? ''}
                onChange={(e) => update({ reimbursement: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Banked hours used</Label>
              <Input
                type="number"
                min={0}
                step="0.25"
                disabled={effectiveLocked}
                className="h-8 text-sm"
                value={entry.bankedHoursUsed ?? ''}
                onChange={(e) => update({ bankedHoursUsed: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Hours to bank</Label>
              <Input
                type="number"
                min={0}
                step="0.25"
                disabled={effectiveLocked}
                className="h-8 text-sm"
                value={entry.hoursToBank ?? ''}
                onChange={(e) => update({ hoursToBank: e.target.value })}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
