import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatCurrency, formatPayPeriodRange } from '@/components/hr/payroll/payrollFormat'
import { buildPayrollPieceTypeOptions } from '@/lib/drywall/payrollPieceKeys'
import type { DrywallProjectLaborEntryFlat } from '@/lib/drywall/projectLaborMath'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  reassignLaborEntry,
  retagLaborEntry,
  type LaborEntryEditRef,
  type ReassignTarget,
} from '@/services/drywallLaborEntryEditService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { DrywallProjectListItem } from '@/types/drywall'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  entries: DrywallProjectLaborEntryFlat[]
  onDataChanged?: () => void
}

function typeLabel(entry: DrywallProjectLaborEntryFlat): string {
  if (entry.source === 'hour') return 'Hourly'
  return entry.pieceKey ?? entry.workType ?? '—'
}

function qtyLabel(entry: DrywallProjectLaborEntryFlat): string {
  if (entry.source === 'hour') {
    return entry.hours != null ? `${entry.hours.toFixed(2)} h` : '—'
  }
  return entry.pieces != null ? `${Math.round(entry.pieces).toLocaleString()} pcs` : '—'
}

function editRefFromEntry(entry: DrywallProjectLaborEntryFlat): LaborEntryEditRef {
  return {
    payPeriodId: entry.payPeriodId,
    personId: entry.personId,
    personType: String(entry.personType),
    source: entry.source,
    entryIndex: entry.entryIndex,
    jobId: entry.jobId,
    hours: entry.hours,
    pieceKey: entry.pieceKey,
    workType: entry.workType,
  }
}

function LaborRowActions({
  entry,
  projects,
  catalogs,
  editable,
  onDataChanged,
}: {
  entry: DrywallProjectLaborEntryFlat
  projects: DrywallProjectListItem[]
  catalogs: OrgDrywallCatalogs | null
  editable: boolean
  onDataChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)

  const pieceTypeOptions = useMemo(
    () => (catalogs ? buildPayrollPieceTypeOptions(catalogs) : []),
    [catalogs],
  )

  const drywallOptions = useMemo(
    () => pieceTypeOptions.filter((o) => o.group === 'drywall'),
    [pieceTypeOptions],
  )
  const componentOptions = useMemo(
    () => pieceTypeOptions.filter((o) => o.group === 'component'),
    [pieceTypeOptions],
  )
  const legacyOptions = useMemo(
    () => pieceTypeOptions.filter((o) => o.group === 'legacy'),
    [pieceTypeOptions],
  )

  if (!editable) return null

  const locked = entry.periodLocked

  const runReassign = async (target: ReassignTarget) => {
    if (locked) return

    setBusy(true)
    try {
      await reassignLaborEntry(editRefFromEntry(entry), target)
      toast.success('Job assignment updated')
      onDataChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reassign failed')
    } finally {
      setBusy(false)
    }
  }

  const runRetag = async (value: string) => {
    if (!catalogs || locked || entry.source !== 'piece') return
    const opt = pieceTypeOptions.find((o) => o.value === value)
    if (!opt) return

    const patch = {
      piece_key: opt.catalogSource === 'v3_drywall' ? opt.value : undefined,
      workType: opt.value,
      catalog_source: opt.catalogSource,
    }

    setBusy(true)
    try {
      await retagLaborEntry(editRefFromEntry(entry), patch)
      toast.success('Type updated')
      onDataChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Re-tag failed')
    } finally {
      setBusy(false)
    }
  }

  const editTrigger = (
    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2" disabled={busy || locked}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
      Edit
      <ChevronDown className="size-3.5 opacity-60" />
    </Button>
  )

  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">{editTrigger}</span>
        </TooltipTrigger>
        <TooltipContent>Unlock this pay period in the payroll editor to edit.</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{editTrigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Reassign job</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-auto">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() =>
                  void runReassign({ kind: 'project', projectId: p.id, projectName: p.name })
                }
              >
                {p.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void runReassign({ kind: 'off-system' })}>
              Off-system
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void runReassign({ kind: 'unassign' })}>
              Unassign
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {entry.source === 'piece' ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={pieceTypeOptions.length === 0}>
              Re-tag type
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-auto">
              <DropdownMenuLabel>Drywall</DropdownMenuLabel>
              {drywallOptions.map((o) => (
                <DropdownMenuItem key={o.value} onSelect={() => void runRetag(o.value)}>
                  {o.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuLabel>Component labor</DropdownMenuLabel>
              {componentOptions.map((o) => (
                <DropdownMenuItem key={o.value} onSelect={() => void runRetag(o.value)}>
                  {o.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuLabel>Legacy (v2)</DropdownMenuLabel>
              {legacyOptions.map((o) => (
                <DropdownMenuItem key={o.value} onSelect={() => void runRetag(o.value)}>
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground">
            Hourly labor isn&apos;t trade-attributed
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LaborBreakdownModal({ open, onOpenChange, title, entries, onDataChanged }: Props) {
  const [projects, setProjects] = useState<DrywallProjectListItem[]>([])
  const [catalogs, setCatalogs] = useState<OrgDrywallCatalogs | null>(null)
  const editDataLoadedRef = useRef(false)

  useEffect(() => {
    if (!open || !onDataChanged || editDataLoadedRef.current) return
    editDataLoadedRef.current = true
    void Promise.all([
      fetchDrywallProjects(),
      fetchOrgDrywallCatalogs().catch(() => null),
    ]).then(([nextProjects, nextCatalogs]) => {
      setProjects(nextProjects)
      setCatalogs(nextCatalogs)
    })
  }, [open, onDataChanged])

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.amount - a.amount),
    [entries],
  )
  const total = useMemo(() => sorted.reduce((sum, e) => sum + e.amount, 0), [sorted])
  const showActions = Boolean(onDataChanged)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Payroll lines that make up this actual labor bucket.</DialogDescription>
        </DialogHeader>

        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No entries.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 border-b bg-muted/80 backdrop-blur-sm">
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  {showActions ? <th className="px-3 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, i) => (
                  <tr
                    key={`${entry.payPeriodId}:${entry.personId}:${entry.personType}:${entry.source}:${entry.entryIndex}:${i}`}
                    className="border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium">{entry.personName ?? entry.personId}</span>
                      {entry.periodLocked ? (
                        <span
                          className={cn(
                            'ml-2 inline-flex rounded-full border border-amber-500/40',
                            'bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase',
                            'tracking-wide text-amber-800 dark:text-amber-200',
                          )}
                        >
                          locked
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatPayPeriodRange(entry.periodStart, entry.periodEnd)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{typeLabel(entry)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {qtyLabel(entry)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(entry.amount)}
                    </td>
                    {showActions ? (
                      <td className="px-3 py-2 text-right">
                        <LaborRowActions
                          entry={entry}
                          projects={projects}
                          catalogs={catalogs}
                          editable
                          onDataChanged={onDataChanged}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">
              {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
            </span>
            <span className="font-semibold">{formatCurrency(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Actual labor — incl. W2 burden.</p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
