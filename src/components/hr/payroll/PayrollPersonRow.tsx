import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
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
import { generateHrId } from '@/lib/hrTeamUtils'
import {
  PAYROLL_WORK_TYPES,
  getRateFromJob,
  recalcPieceEntryAmount,
  type PayrollRowPerson,
} from '@/lib/payrollMath'
import type { PayrollEntry, PayrollHourEntry, PayrollPieceEntry, PayrollProjectOption } from '@/types/payroll'
import { formatCurrency } from './payrollFormat'

interface PayrollPersonRowProps {
  person: PayrollRowPerson
  entry: PayrollEntry
  gross: number
  locked: boolean
  projects: PayrollProjectOption[]
  allPeople: PayrollRowPerson[]
  onChange: (entry: PayrollEntry) => void
}

export function PayrollPersonRow({
  person,
  entry,
  gross,
  locked,
  projects,
  allPeople,
  onChange,
}: PayrollPersonRowProps) {
  const [hoursOpen, setHoursOpen] = useState(false)
  const [pieceOpen, setPieceOpen] = useState(false)

  const update = (patch: Partial<PayrollEntry>) => onChange({ ...entry, ...patch })

  const hourEntries = entry.hourEntries || []
  const pieceEntries = entry.pieceEntries || []

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
    const recalcFields = ['totalPhases', 'phasesCompleted', 'jobTotalSqft', 'rate', 'workType']
    if (Object.keys(patch).some((k) => recalcFields.includes(k))) {
      next = { ...next, amount: recalcPieceEntryAmount(next) }
    }
    if (patch.workType) {
      const wt = PAYROLL_WORK_TYPES.find((w) => w.value === patch.workType)
      if (wt) next.totalPhases = wt.defaultPhases
    }
    list[idx] = next
    update({ pieceEntries: list })
  }

  const setPieceJob = (idx: number, projectId: string) => {
    const pe = pieceEntries[idx] || {}
    const workType = pe.workType || 'finisher'
    if (projectId === 'other') {
      patchPiece(idx, { jobId: 'other', jobName: pe.jobName || '' })
      return
    }
    const project = projects.find((p) => p.id === projectId)
    const rateFromJob = project ? getRateFromJob(project, workType) : null
    patchPiece(idx, {
      jobId: project?.id || projectId,
      jobName: project?.name || 'Unnamed',
      rate: rateFromJob != null ? String(rateFromJob) : pe.rate,
    })
  }

  const removePiece = (idx: number) => {
    update({ pieceEntries: pieceEntries.filter((_, i) => i !== idx) })
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{person.name}</p>
          <p className="text-xs text-muted-foreground">
            {person.personType === 'w2' ? 'W2' : '1099'} · {person.payType || 'hourly'}
          </p>
        </div>
        <p className="text-lg font-semibold tabular-nums">{formatCurrency(gross)}</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Label className="text-xs">Per diem</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            disabled={locked}
            value={entry.perDiem ?? ''}
            onChange={(e) => update({ perDiem: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Reimbursement</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            disabled={locked}
            value={entry.reimbursement ?? ''}
            onChange={(e) => update({ reimbursement: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Banked hours used</Label>
          <Input
            type="number"
            min={0}
            step="0.25"
            disabled={locked}
            value={entry.bankedHoursUsed ?? ''}
            onChange={(e) => update({ bankedHoursUsed: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Hours to bank</Label>
          <Input
            type="number"
            min={0}
            step="0.25"
            disabled={locked}
            value={entry.hoursToBank ?? ''}
            onChange={(e) => update({ hoursToBank: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setHoursOpen((o) => !o)}
        >
          {hoursOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Hours ({hourEntries.length})
        </button>
        {hoursOpen && (
          <div className="mt-2 space-y-2 rounded-md bg-muted/20 p-2">
            {hourEntries.map((he, idx) => (
              <div key={he.id || idx} className="grid gap-2 rounded border bg-card p-2 md:grid-cols-6">
                <Select
                  disabled={locked}
                  value={he.jobId && he.jobId !== '' ? he.jobId : 'none'}
                  onValueChange={(v) => {
                    if (v === 'none') patchHour(idx, { jobId: '', jobName: '' })
                    else if (v === 'other') patchHour(idx, { jobId: 'other', jobName: he.jobName || '' })
                    else {
                      const proj = projects.find((p) => p.id === v)
                      patchHour(idx, { jobId: v, jobName: proj?.name || '' })
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Job" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Job —</SelectItem>
                    <SelectItem value="other">Other (type name)</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {he.jobId === 'other' && (
                  <Input
                    placeholder="Job name"
                    disabled={locked}
                    value={he.jobName ?? ''}
                    onChange={(e) => patchHour(idx, { jobName: e.target.value })}
                  />
                )}
                <Input
                  type="number"
                  min={0}
                  step="0.25"
                  placeholder="Hours"
                  disabled={locked}
                  value={he.hours ?? ''}
                  onChange={(e) => patchHour(idx, { hours: e.target.value })}
                />
                <Select
                  disabled={locked}
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
                  disabled={locked}
                  value={he.rateOverride ?? ''}
                  onChange={(e) => patchHour(idx, { rateOverride: e.target.value })}
                />
                <Select
                  disabled={locked}
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
                {!locked && (
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
            {!locked && (
              <Button type="button" variant="outline" size="sm" onClick={addHour}>
                <Plus className="mr-1 size-4" />
                Add hours row
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 border-t pt-4">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setPieceOpen((o) => !o)}
        >
          {pieceOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Piece ({pieceEntries.length})
        </button>
        {pieceOpen && (
          <div className="mt-2 space-y-2 rounded-md bg-muted/20 p-2">
            {pieceEntries.map((pe, idx) => (
              <div key={pe.id || idx} className="grid gap-2 rounded border bg-card p-2 md:grid-cols-8">
                <Select
                  disabled={locked}
                  value={pe.jobId && pe.jobId !== '' ? pe.jobId : 'none'}
                  onValueChange={(v) => {
                    if (v === 'none') patchPiece(idx, { jobId: '', jobName: '' })
                    else if (v === 'other') patchPiece(idx, { jobId: 'other' })
                    else setPieceJob(idx, v)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Job" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Job —</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  disabled={locked}
                  value={pe.workType || 'finisher'}
                  onValueChange={(v) => {
                    const wt = PAYROLL_WORK_TYPES.find((w) => w.value === v)
                    const proj = projects.find((p) => p.id === pe.jobId)
                    const rate = proj ? getRateFromJob(proj, v) : null
                    patchPiece(idx, {
                      workType: v,
                      totalPhases: wt?.defaultPhases ?? 1,
                      rate: rate != null ? String(rate) : pe.rate,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYROLL_WORK_TYPES.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Phases done"
                  disabled={locked}
                  value={pe.phasesCompleted ?? ''}
                  onChange={(e) => patchPiece(idx, { phasesCompleted: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Total phases"
                  disabled={locked}
                  value={pe.totalPhases ?? ''}
                  onChange={(e) => patchPiece(idx, { totalPhases: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Sqft"
                  disabled={locked}
                  value={pe.jobTotalSqft ?? ''}
                  onChange={(e) => patchPiece(idx, { jobTotalSqft: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Rate"
                  disabled={locked}
                  value={pe.rate ?? ''}
                  onChange={(e) => patchPiece(idx, { rate: e.target.value })}
                />
                <span className="self-center text-right text-sm font-medium tabular-nums">
                  {formatCurrency(parseFloat(String(pe.amount)) || 0)}
                </span>
                {!locked && (
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
            ))}
            {!locked && (
              <Button type="button" variant="outline" size="sm" onClick={addPiece}>
                <Plus className="mr-1 size-4" />
                Add piece row
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
