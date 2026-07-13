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
  projectLaborRateForPieceKey,
  resolvePieceEntryKey,
  type PayrollPieceTypeOption,
} from '@/lib/drywall/payrollPieceKeys'
import {
  PAYROLL_WORK_TYPES,
  defaultHelperAssignRate,
  getHelperDeductionForJob,
  getRateFromJob,
  getSqftFromJob,
  helperAssignDeductionAmount,
  listHelperAssignmentsForLeadJob,
  pieceRowHelperDeduction,
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
  /** Full draft map — needed so lead piece rows can show helper deductions. */
  allEntries: Record<string, PayrollEntry>
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
  // Prefer order-approved / quote project rates over org catalog defaults.
  const fromJob = projectLaborRateForPieceKey(pieceKey, project?.laborRates, catalogs)
  if (fromJob != null) return fromJob

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
  allEntries,
  drywallCatalogs,
  onChange,
  onToggleDone,
}: PayrollPersonRowProps) {
  const personDone = Boolean(entry.done)
  const effectiveLocked = locked || personDone
  const hourEntries = entry.hourEntries || []
  const pieceEntries = entry.pieceEntries || []

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

  const fuelAllowance = parseFloat(String(person.gasAllowance)) || 0
  const bankedHoursBalance = parseFloat(String(person.bankedHours)) || 0
  const bankedHoursUsed = parseFloat(String(entry.bankedHoursUsed)) || 0
  const hoursToBank = parseFloat(String(entry.hoursToBank)) || 0
  const bankedPayout =
    bankedHoursUsed * (parseFloat(String(person.hourlyRate)) || 0)
  const showFuelReimbursement = fuelAllowance > 0

  const update = (patch: Partial<PayrollEntry>) => {
    const next = { ...entry, ...patch }
    onChange(next)
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
            <p className="text-[11px] text-muted-foreground">
              Assign helper hours to a piece lead, then set Lead $/hr. That amount is deducted from
              the lead&apos;s piece pay on the same job (helper still keeps their hourly pay).
            </p>
            {hourEntries.map((he, idx) => {
              const canAssign = Boolean(he.jobId && he.jobId !== 'none' && he.jobId !== 'unassigned')
              const assignDeduction = he.assignToPersonId
                ? helperAssignDeductionAmount(he)
                : 0
              return (
              <div
                key={he.id || idx}
                className={cn(
                  'grid gap-2 rounded border bg-card p-2',
                  he.assignToPersonId
                    ? 'md:grid-cols-[minmax(0,1.4fr)_4.5rem_5.5rem_5.5rem_minmax(0,1fr)_auto_5rem_4.5rem_2.25rem]'
                    : 'md:grid-cols-6',
                )}
              >
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
                {canAssign ? (
                  <div className="flex min-w-0 items-center gap-1">
                    <Select
                      disabled={effectiveLocked}
                      value={he.assignToPersonId || 'none'}
                      onValueChange={(v) => {
                        if (v === 'none') {
                          patchHour(idx, {
                            assignToPersonId: '',
                            assignToPersonName: '',
                            assignRate: '',
                            assignAmount: '',
                          })
                          return
                        }
                        const assignee = allPeople.find((p) => p.personKey === v)
                        patchHour(idx, {
                          assignToPersonId: v,
                          assignToPersonName: assignee?.name || '',
                          assignRate: defaultHelperAssignRate(he, person.hourlyRate),
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
                    {!effectiveLocked && he.assignToPersonId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 px-2"
                        title="Use this worker's full hourly rate as the lead deduction"
                        onClick={() =>
                          patchHour(idx, {
                            assignRate: defaultHelperAssignRate(he, person.hourlyRate, {
                              force: true,
                            }),
                          })
                        }
                      >
                        All
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <span className="self-center text-xs text-muted-foreground">Select job first</span>
                )}
                {he.assignToPersonId ? (
                  <>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Lead $/hr"
                      title="Rate the lead pays for this helper (deducted from the lead's piece pay)"
                      disabled={effectiveLocked}
                      value={he.assignRate ?? ''}
                      onChange={(e) => patchHour(idx, { assignRate: e.target.value })}
                    />
                    <span
                      className="self-center text-right text-xs tabular-nums text-muted-foreground"
                      title="Charged to the assigned lead's piece pay on this job (helper still receives hourly pay above)"
                    >
                      {assignDeduction > 0
                        ? `Lead −${formatCurrency(assignDeduction)}`
                        : '—'}
                    </span>
                  </>
                ) : null}
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
              )
            })}
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
            {(() => {
              const notedJobs = new Set<string>()
              return pieceEntries.map((pe, idx) => {
              const pieceKey = resolvePieceEntryKey(pe)
              const knownOption = pieceTypeOptionByValue.get(pieceKey)
              const orphanLabel =
                !knownOption && pieceKey
                  ? labelForPieceKey(pieceKey, drywallCatalogs)
                  : null
              const jobHelperDeduction = getHelperDeductionForJob(
                allEntries,
                person.personKey,
                pe.jobId || '',
                pe.jobName || '',
              )
              const { raw, helperShare, net } = pieceRowHelperDeduction(
                pieceEntries,
                pe,
                jobHelperDeduction,
              )
              const jobNoteKey = `${pe.jobId || ''}::${String(pe.jobName || '').trim().toLowerCase()}`
              const showHelperNote = !notedJobs.has(jobNoteKey)
              if (showHelperNote) notedJobs.add(jobNoteKey)
              const helpersOnJob = showHelperNote
                ? listHelperAssignmentsForLeadJob(
                    allEntries,
                    person.personKey,
                    pe.jobId || '',
                    pe.jobName || '',
                  )
                : []

              return (
              <div key={pe.id || idx} className="space-y-1">
              <div className="grid gap-2 rounded border bg-card p-2 md:grid-cols-8">
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
                <div className="self-center text-right text-sm tabular-nums">
                  <div className="font-medium">{formatCurrency(raw)}</div>
                  {helperShare > 0 && (
                    <>
                      <div className="text-[11px] text-red-600 dark:text-red-400">
                        −{formatCurrency(helperShare)} helper
                      </div>
                      <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(net)} net
                      </div>
                    </>
                  )}
                </div>
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
              {helpersOnJob.length > 0 && (
                <p className="px-1 text-[11px] text-muted-foreground">
                  Helper hours charged to this job:{' '}
                  {helpersOnJob
                    .map((h) => {
                      const name =
                        allPeople.find((p) => p.personKey === h.helperPersonKey)?.name ||
                        h.helperName
                      return `${name} −${formatCurrency(h.amount)}`
                    })
                    .join(' · ')}
                </p>
              )}
              </div>
            )})
            })()}
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

      {/* Adjustments */}
      <section className="mt-3 rounded-lg border border-border/80 bg-muted/10 p-3">
        <p className="text-sm font-semibold">Adjustments</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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
            <Label className="text-[11px] text-muted-foreground">
              Banked hours used
              {bankedHoursBalance > 0 && (
                <span className="ml-1 font-normal">(bal. {bankedHoursBalance})</span>
              )}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={bankedHoursBalance > 0 ? bankedHoursBalance : undefined}
                step="0.25"
                disabled={effectiveLocked}
                className="h-8 text-sm"
                value={entry.bankedHoursUsed ?? ''}
                onChange={(e) => update({ bankedHoursUsed: e.target.value })}
              />
              {bankedPayout > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(bankedPayout)}
                </span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">
              Hours to bank
              {totalHours > 0 && (
                <span className="ml-1 font-normal">
                  (paid {(totalHours - hoursToBank).toFixed(1)} hrs)
                </span>
              )}
            </Label>
            <Input
              type="number"
              min={0}
              max={totalHours > 0 ? totalHours : undefined}
              step="0.25"
              disabled={effectiveLocked}
              className="h-8 text-sm"
              value={entry.hoursToBank ?? ''}
              onChange={(e) => update({ hoursToBank: e.target.value })}
            />
          </div>
          {showFuelReimbursement && (
            <div>
              <Label className="text-[11px] text-muted-foreground">Fuel reimbursement</Label>
              <Input
                type="text"
                readOnly
                disabled
                className="h-8 bg-muted/40 text-sm tabular-nums"
                value={formatCurrency(fuelAllowance)}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">From team profile</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
