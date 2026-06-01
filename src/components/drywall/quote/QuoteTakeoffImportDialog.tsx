import { useState } from 'react'
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
  applyImportPreviewToBreakdowns,
  parseTakeoffFile,
  type ImportPreviewRow,
} from '@/lib/drywall/quoteTakeoffImport'
import type { DrywallQuote, QuoteBreakdown } from '@/types/drywall'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  breakdowns: QuoteBreakdown[]
  replaceExisting: boolean
  onReplaceChange: (v: boolean) => void
  onApply: (quotePatch: Partial<DrywallQuote>) => void
}

export function QuoteTakeoffImportDialog({
  open,
  onOpenChange,
  breakdowns,
  replaceExisting,
  onReplaceChange,
  onApply,
}: Props) {
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleFile = async (file: File | null) => {
    if (!file) return
    setLoading(true)
    try {
      const result = await parseTakeoffFile(file)
      setRows(result.previewRows)
      setWarnings(result.warnings)
    } catch (e: unknown) {
      setRows([])
      setWarnings([e instanceof Error ? e.message : 'Import failed'])
    } finally {
      setLoading(false)
    }
  }

  const apply = () => {
    const { breakdowns: next, flags } = applyImportPreviewToBreakdowns(
      rows,
      replaceExisting,
      breakdowns,
    )
    onApply({
      breakdowns: next,
      ...(flags.includeSuspendedGrid ? { includeSuspendedGrid: true } : {}),
      ...(flags.includeMetalStudFraming ? { includeMetalStudFraming: true } : {}),
      ...(flags.includeRcChannel ? { includeRcChannel: true } : {}),
    })
    onOpenChange(false)
    setRows([])
    setWarnings([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import takeoff (Excel / CSV)</DialogTitle>
          <DialogDescription>
            Upload a breakdown export with floor, classification, and quantity columns.
          </DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={loading}
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => onReplaceChange(e.target.checked)}
          />
          Replace existing breakdowns (otherwise merge)
        </label>
        {warnings.length > 0 && (
          <ul className="text-xs text-amber-700 list-disc pl-4 max-h-24 overflow-y-auto">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <div className="text-sm border rounded-md overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="p-2 text-left">Floor</th>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-right">SF</th>
                  <th className="p-2 text-left">Kind</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 40).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{r.floor}</td>
                    <td className="p-2">{r.classification}</td>
                    <td className="p-2 text-right">{r.qtySf}</td>
                    <td className="p-2">{r.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 40 && (
              <p className="p-2 text-muted-foreground">…and {rows.length - 40} more rows</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={rows.length === 0} onClick={apply}>
            Apply to quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
