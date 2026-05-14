// ============================================================================
// Import Contacts Dialog — CSV upload → preview/map → bulk insert
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload, Download, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import { STANDALONE_CONTACT_LABELS } from '@/types'
import type { ContactInput, PartnerCategory } from '@/types'
import { bulkCreateContacts } from '@/services/contactDirectoryService'
import { createPartnerCategory, fetchPartnerCategories } from '@/services/partnerCategoryService'
import {
  parseContactsCsv,
  resolveCsvCategory,
  downloadContactsCsvTemplate,
  type ParsedContactRow,
  type CategoryResolution,
} from '@/utils/contactsCsvParser'

const CREATE_NEW_CATEGORY_VALUE = '__create_new_category__'

type Step = 'upload' | 'preview' | 'importing'

interface PreviewRowState {
  parsed: ParsedContactRow
  selectedLabel: string | null
  resolution: CategoryResolution
  rowError: string | null
}

export interface ImportContactsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (count: number) => void
}

function resolutionToError(resolution: CategoryResolution): string | null {
  if (resolution.status === 'entity_rejected') {
    return 'Entity-linked categories (Subcontractor, Supplier, etc.) cannot be imported. Create the company first, then add contacts there.'
  }
  return null
}

export function ImportContactsDialog({ open, onOpenChange, onImported }: ImportContactsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<PreviewRowState[]>([])
  const [partnerCategories, setPartnerCategories] = useState<PartnerCategory[]>([])
  const [defaultBlankCategory, setDefaultBlankCategory] = useState<string>('')
  const [skipRowsWithErrors, setSkipRowsWithErrors] = useState(true)
  const [importError, setImportError] = useState<string | null>(null)

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [createCategoryForRowIndex, setCreateCategoryForRowIndex] = useState<number | null>(null)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')
  const [savingNewCategory, setSavingNewCategory] = useState(false)

  const activePartnerCategories = useMemo(
    () => partnerCategories.filter((c) => !c.isArchived),
    [partnerCategories],
  )

  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchPartnerCategories({ includeArchived: true })
      setPartnerCategories(data)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load categories')
    }
  }, [])

  useEffect(() => {
    if (open) void loadCategories()
  }, [open, loadCategories])

  const resetState = () => {
    setStep('upload')
    setParseWarnings([])
    setPreviewRows([])
    setDefaultBlankCategory('')
    setSkipRowsWithErrors(true)
    setImportError(null)
    setCreateCategoryOpen(false)
    setCreateCategoryForRowIndex(null)
    setNewCategoryLabel('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && step !== 'importing') resetState()
    onOpenChange(next)
  }

  const buildPreviewRows = (rows: ParsedContactRow[], categories: PartnerCategory[]): PreviewRowState[] =>
    rows.map((parsed) => {
      const resolution = resolveCsvCategory(parsed.category, categories)
      const rowError = resolutionToError(resolution)
      const selectedLabel = resolution.status === 'matched' ? resolution.label : null
      return { parsed, selectedLabel, resolution, rowError }
    })

  const handleFileSelect = async (file: File) => {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      toast.error(
        "Excel files aren't supported yet. Export your sheet as CSV (File → Save As → CSV) and try again.",
      )
      return
    }
    if (!lower.endsWith('.csv')) {
      toast.error('Please upload a CSV file.')
      return
    }

    try {
      const content = await file.text()
      const { rows, warnings } = parseContactsCsv(content)
      if (rows.length === 0) {
        toast.error('No contact rows found in the CSV.')
        return
      }
      setParseWarnings(warnings)
      setPreviewRows(buildPreviewRows(rows, activePartnerCategories))
      setImportError(null)
      setStep('preview')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to parse CSV')
    }
  }

  const hasBlankCategoryRows = previewRows.some((r) => r.resolution.status === 'blank')

  const effectiveLabel = (row: PreviewRowState): string | null => {
    if (row.selectedLabel) return row.selectedLabel
    if (row.resolution.status === 'blank' && defaultBlankCategory) return defaultBlankCategory
    return null
  }

  const rowIsSkipped = (row: PreviewRowState): boolean =>
    Boolean(skipRowsWithErrors && row.rowError)

  const rowNeedsCategory = (row: PreviewRowState): boolean => {
    if (rowIsSkipped(row)) return false
    if (row.rowError) return false
    return !effectiveLabel(row)
  }

  const rowIsReady = (row: PreviewRowState): boolean => {
    if (rowIsSkipped(row)) return false
    if (row.rowError) return false
    return Boolean(effectiveLabel(row))
  }

  const summary = useMemo(() => {
    const ready = previewRows.filter((r) => rowIsReady(r)).length
    const needs = previewRows.filter((r) => rowNeedsCategory(r)).length
    const skipped = parseWarnings.length + previewRows.filter((r) => rowIsSkipped(r)).length
    return { ready, needs, skipped }
  }, [previewRows, parseWarnings.length, skipRowsWithErrors, defaultBlankCategory])

  const canImport =
    step === 'preview' &&
    summary.ready > 0 &&
    summary.needs === 0 &&
    previewRows.every((r) => rowIsReady(r) || rowIsSkipped(r))

  const peopleOptions = STANDALONE_CONTACT_LABELS
  const partnerOptions = activePartnerCategories

  const updateRowLabel = (index: number, label: string | null) => {
    setPreviewRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        if (!label) {
          const resolution = resolveCsvCategory(row.parsed.category, activePartnerCategories)
          return {
            ...row,
            selectedLabel: null,
            resolution,
            rowError: resolutionToError(resolution),
          }
        }
        return {
          ...row,
          selectedLabel: label,
          rowError: null,
          resolution: { status: 'matched', label },
        }
      }),
    )
  }

  const handleCategorySelect = (index: number, value: string) => {
    if (value === CREATE_NEW_CATEGORY_VALUE) {
      setCreateCategoryForRowIndex(index)
      setNewCategoryLabel('')
      setCreateCategoryOpen(true)
      return
    }
    updateRowLabel(index, value)
  }

  const handleSaveNewCategory = async () => {
    const label = newCategoryLabel.trim()
    if (!label) {
      toast.error('Category name is required')
      return
    }
    setSavingNewCategory(true)
    try {
      const created = await createPartnerCategory({ label })
      await loadCategories()
      if (createCategoryForRowIndex !== null) {
        updateRowLabel(createCategoryForRowIndex, created.key)
      }
      setCreateCategoryOpen(false)
      setCreateCategoryForRowIndex(null)
      toast.success(`Category "${created.label}" created`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create category')
    } finally {
      setSavingNewCategory(false)
    }
  }

  const handleImport = async () => {
    if (!canImport) return
    setImportError(null)
    setStep('importing')

    const inputs: ContactInput[] = previewRows
      .filter((r) => rowIsReady(r))
      .map((r) => {
        const label = effectiveLabel(r)!
        return {
          label,
          name: r.parsed.name,
          email: r.parsed.email || null,
          phone: r.parsed.phone || null,
          role: r.parsed.role || null,
          notes: r.parsed.notes || null,
        }
      })

    try {
      const created = await bulkCreateContacts(inputs)
      onImported(created.length)
      resetState()
      onOpenChange(false)
    } catch (e: unknown) {
      const message =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : e instanceof Error
            ? e.message
            : 'Import failed'
      setImportError(message)
      setStep('preview')
    }
  }

  const rowStatusLabel = (row: PreviewRowState): string => {
    if (rowIsSkipped(row)) return 'Skipped'
    if (row.rowError) return 'Error'
    if (rowNeedsCategory(row)) return 'Needs category'
    if (rowIsReady(row)) return 'OK'
    return '—'
  }

  const categorySelect = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full min-w-[140px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>People</SelectLabel>
          {peopleOptions.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectGroup>
        {partnerOptions.length > 0 && (
          <SelectGroup>
            <SelectLabel>Partners</SelectLabel>
            {partnerOptions.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        <SelectItem value={CREATE_NEW_CATEGORY_VALUE}>+ Create new category…</SelectItem>
      </SelectContent>
    </Select>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import contacts from CSV</DialogTitle>
            <DialogDescription>
              Standalone contacts only — each row becomes a contact with the chosen category as its
              label. Entity-linked companies are not imported via CSV.
            </DialogDescription>
          </DialogHeader>

          {step === 'upload' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Required column: <strong>name</strong> (aliases: full name, contact name). Optional:{' '}
                <strong>category</strong>, email, phone, role, notes. Categories match partner tabs or
                People labels (Employee, 1099, User).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={downloadContactsCsvTemplate}>
                  <Download className="mr-2 size-4" />
                  Download template
                </Button>
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 size-4" />
                  Choose CSV file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleFileSelect(file)
                  }}
                />
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-4 min-h-0 flex-1 overflow-hidden">
              {importError && (
                <div className="flex gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                {summary.ready} row{summary.ready === 1 ? '' : 's'} ready, {summary.needs} need
                {summary.needs === 1 ? 's' : ''} a category
                {summary.skipped > 0 ? `, ${summary.skipped} skipped` : ''}
              </p>

              {parseWarnings.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc pl-4 max-h-20 overflow-y-auto">
                  {parseWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}

              {hasBlankCategoryRows && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <Label className="shrink-0">Default category for blank rows</Label>
                  {categorySelect(defaultBlankCategory, setDefaultBlankCategory, 'Select default…')}
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipRowsWithErrors}
                  onChange={(e) => setSkipRowsWithErrors(e.target.checked)}
                  className="rounded border-input"
                />
                Skip rows with errors
              </label>

              <div className="overflow-auto border rounded-md flex-1 min-h-[200px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">Email</th>
                      <th className="text-left p-2 font-medium">Phone</th>
                      <th className="text-left p-2 font-medium">Role</th>
                      <th className="text-left p-2 font-medium min-w-[160px]">Category</th>
                      <th className="text-left p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => {
                      const selectValue =
                        row.selectedLabel ??
                        (row.resolution.status === 'blank' ? defaultBlankCategory : '') ??
                        ''
                      const status = rowStatusLabel(row)
                      const statusClass =
                        status === 'OK'
                          ? 'text-green-600'
                          : status === 'Needs category'
                            ? 'text-amber-600'
                            : status === 'Error'
                              ? 'text-destructive'
                              : 'text-muted-foreground'

                      return (
                        <tr key={row.parsed.lineNumber} className="border-t border-border/40">
                          <td className="p-2">{row.parsed.name}</td>
                          <td className="p-2 text-muted-foreground">{row.parsed.email || '—'}</td>
                          <td className="p-2 text-muted-foreground">{row.parsed.phone || '—'}</td>
                          <td className="p-2 text-muted-foreground">{row.parsed.role || '—'}</td>
                          <td className="p-2">
                            {!rowIsSkipped(row) && !row.rowError ? (
                              categorySelect(selectValue, (v) => handleCategorySelect(index, v), 'Select…')
                            ) : (
                              <span className="text-muted-foreground text-xs">{row.parsed.category || '—'}</span>
                            )}
                            {row.rowError && (
                              <p className="text-xs text-destructive mt-1 max-w-[200px]">{row.rowError}</p>
                            )}
                          </td>
                          <td className={`p-2 text-xs font-medium ${statusClass}`}>{status}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Importing contacts…</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {step === 'preview' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('upload')
                    setPreviewRows([])
                    setImportError(null)
                  }}
                >
                  Back
                </Button>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void handleImport()} disabled={!canImport}>
                  Import
                  {summary.ready > 0
                    ? ` ${summary.ready} contact${summary.ready === 1 ? '' : 's'}`
                    : ''}
                </Button>
              </>
            )}
            {step === 'upload' && (
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>
              Creates a partner tab and maps this row to the new category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="import-new-category-label">Category name</Label>
              <Input
                id="import-new-category-label"
                value={newCategoryLabel}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                placeholder="e.g. Plumbers"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCategoryOpen(false)} disabled={savingNewCategory}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveNewCategory()} disabled={savingNewCategory}>
              {savingNewCategory ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
