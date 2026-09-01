import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  parseTakeoffFileV3,
  type ImportedTakeoffLine,
} from '@/lib/drywall/quoteTakeoffImportV3'
import type { QuoteLineItem, QuoteLineItemType } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogs: OrgDrywallCatalogs
  /** Called with the finished v3 line items when the user applies the import. */
  onApply: (lines: QuoteLineItem[]) => void
}

const TYPE_LABEL: Record<QuoteLineItemType, string> = {
  drywall: 'Drywall',
  rc_channel: 'RC channel',
  suspended_grid: 'Susp. grid',
  insulation: 'Insulation',
  acoustic: 'Acoustic',
  metal_stud: 'Metal stud',
  frp: 'FRP',
  door_install: 'Door',
}

/** Which catalog list backs the per-line item picker for a given type (undefined = none). */
function catalogOptionsFor(
  type: QuoteLineItemType,
  catalogs: OrgDrywallCatalogs,
): { id: string; display_name: string }[] | undefined {
  switch (type) {
    case 'drywall':
      return catalogs.boards
    case 'metal_stud':
      return catalogs.metal_stud
    case 'insulation':
      return catalogs.insulation
    case 'frp':
      return catalogs.frp
    default:
      return undefined
  }
}

export function ImportTakeoffDialog({ open, onOpenChange, catalogs, onApply }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [lines, setLines] = useState<ImportedTakeoffLine[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setLines([])
    setWarnings([])
    setFileName('')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setParsing(true)
    setError(null)
    try {
      const result = await parseTakeoffFileV3(file)
      setLines(result.lines)
      setWarnings(result.warnings)
      setFileName(file.name)
    } catch (e) {
      setLines([])
      setWarnings([])
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setParsing(false)
    }
  }

  const patchLine = (id: string, patch: Partial<QuoteLineItem>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, line: { ...l.line, ...patch } } : l)),
    )
  }
  const setInclude = (id: string, include: boolean) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, include } : l)))
  }

  const includedCount = useMemo(() => lines.filter((l) => l.include).length, [lines])
  const needsCatalog = useMemo(
    () =>
      lines.filter(
        (l) =>
          l.include &&
          catalogOptionsFor(l.line.type, catalogs) !== undefined &&
          !l.line.catalog_id,
      ).length,
    [lines, catalogs],
  )

  const handleApply = () => {
    const toAdd = lines.filter((l) => l.include).map((l) => l.line)
    if (toAdd.length === 0) return
    onApply(toAdd)
    toast.success(`Added ${toAdd.length} line${toAdd.length === 1 ? '' : 's'} to the quote`)
    reset()
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import takeoff</DialogTitle>
          <DialogDescription>
            Upload a Togal (or similar) takeoff export. Each assembly becomes a quote line —
            review, adjust, and exclude anything before adding. Quantities come from the file;
            pricing comes from your catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* File picker */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={parsing}
              onClick={() => fileRef.current?.click()}
            >
              {parsing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {lines.length ? 'Choose a different file' : 'Choose file'}
            </Button>
            {fileName && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
              </span>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Review these before adding
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Review table */}
          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-2 py-2 text-center">Add</th>
                    <th className="px-2 py-2 text-left">From takeoff</th>
                    <th className="px-2 py-2 text-left">Type</th>
                    <th className="px-2 py-2 text-right">Quantity</th>
                    <th className="px-2 py-2 text-left">Catalog / options</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const opts = catalogOptionsFor(l.line.type, catalogs)
                    const missingCatalog = l.include && opts !== undefined && !l.line.catalog_id
                    return (
                      <tr
                        key={l.id}
                        className={cn(
                          'border-t align-top',
                          !l.include && 'opacity-50',
                          missingCatalog && 'bg-amber-50/60 dark:bg-amber-950/20',
                        )}
                      >
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={l.include}
                            onChange={(e) => setInclude(l.id, e.target.checked)}
                            aria-label={`Include ${l.sourceClassification}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium">{l.sourceClassification}</div>
                          {l.warning && (
                            <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                              {l.warning}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span className="inline-block rounded border border-border bg-card px-1.5 py-0.5 text-xs font-medium">
                            {TYPE_LABEL[l.line.type]}
                          </span>
                          {l.line.type === 'rc_channel' && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {l.line.rc_surface === 'ceiling'
                                ? 'ceiling'
                                : `wall${l.line.rc_wall_height ? ` @ ${l.line.rc_wall_height}'` : ''}`}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-28 text-right"
                            value={l.line.quantity}
                            disabled={!l.include}
                            onChange={(e) =>
                              patchLine(l.id, { quantity: Math.max(0, Number(e.target.value) || 0) })
                            }
                          />
                          <div className="mt-0.5 text-[10px] uppercase text-muted-foreground">
                            {l.line.type === 'metal_stud' ||
                            (l.line.type === 'rc_channel' && l.line.rc_surface === 'wall')
                              ? 'LF'
                              : l.line.type === 'door_install'
                                ? 'ea'
                                : 'SF'}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {opts ? (
                            <select
                              className={cn(
                                'h-8 w-full max-w-[220px] rounded-md border bg-background px-2 text-sm',
                                missingCatalog ? 'border-amber-400' : 'border-input',
                              )}
                              value={l.line.catalog_id ?? ''}
                              disabled={!l.include}
                              onChange={(e) => patchLine(l.id, { catalog_id: e.target.value })}
                            >
                              <option value="">Select…</option>
                              {opts.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.display_name}
                                </option>
                              ))}
                            </select>
                          ) : l.line.type === 'acoustic' ? (
                            <select
                              className="h-8 w-full max-w-[220px] rounded-md border border-input bg-background px-2 text-sm"
                              value={l.line.acst_tile_size ?? '2x4'}
                              disabled={!l.include}
                              onChange={(e) =>
                                patchLine(l.id, {
                                  acst_tile_size: e.target.value === '2x2' ? '2x2' : '2x4',
                                })
                              }
                            >
                              <option value="2x4">2×4 tile</option>
                              <option value="2x2">2×2 tile</option>
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Priced from {TYPE_LABEL[l.line.type].toLowerCase()} catalog
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="text-sm text-muted-foreground">
            {lines.length > 0 && (
              <>
                {includedCount} of {lines.length} line{lines.length === 1 ? '' : 's'} selected
                {needsCatalog > 0 && (
                  <span className="ml-2 text-amber-700 dark:text-amber-300">
                    · {needsCatalog} need a catalog item
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={includedCount === 0}
              onClick={handleApply}
            >
              Add {includedCount || ''} line{includedCount === 1 ? '' : 's'} to quote
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
