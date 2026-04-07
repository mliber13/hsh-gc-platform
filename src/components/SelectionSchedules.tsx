import React, { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Image as ImageIcon,
  Library,
  PanelLeftClose,
  PanelLeft,
  Printer,
  RefreshCw,
  Save,
  Upload,
  X,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'
import { Project, Trade, SubItem } from '@/types'
import {
  SelectionScheduleDocument,
  SelectionScheduleRow,
  SelectionScheduleType,
} from '@/types/selectionSchedule'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import {
  loadSelectionScheduleDraft,
  loadSelectionScheduleVersionById,
  listSelectionScheduleVersions,
  removeSelectionScheduleRowImageFromStorage,
  saveSelectionScheduleDraft,
  saveSelectionScheduleVersion,
  uploadSelectionScheduleRowImage,
} from '@/services/selectionScheduleService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SelectionSchedulesProps {
  project: Project
  onBack: () => void
}

const SCHEDULE_LABELS: Record<SelectionScheduleType, string> = {
  'interior-paint': 'Interior Paint',
  'exterior-finishes': 'Exterior Finishes',
  flooring: 'Flooring',
  tiling: 'Tiling',
  'lighting-electrical': 'Lighting + Electrical',
  'cabinetry-millwork': 'Cabinetry / Millwork',
  'countertops-slab': 'Countertops + Slab',
  'plumbing-fixtures-hardware': 'Plumbing Fixtures + Hardware',
  'doors-windows-trim': 'Doors / Windows / Trim',
  appliances: 'Appliances',
  other: 'Other',
}

type ScheduleFieldPreset = {
  productLabel: string
  productPlaceholder: string
  specLabel: string
  specPlaceholder: string
  quantityLabel: string
  quantityUnitPlaceholder: string
  notesPlaceholder: string
}

const SCHEDULE_FIELD_PRESETS: Record<SelectionScheduleType, ScheduleFieldPreset> = {
  'interior-paint': {
    productLabel: 'Paint Product',
    productPlaceholder: 'Brand + color name',
    specLabel: 'Surface / Sheen',
    specPlaceholder: 'Walls eggshell, trim satin...',
    quantityLabel: 'Coverage Qty',
    quantityUnitPlaceholder: 'sqft',
    notesPlaceholder: 'Application notes (coats, prep, etc.)',
  },
  'exterior-finishes': {
    productLabel: 'Product / System',
    productPlaceholder: 'e.g. James Hardie lap, GAF Timberline HDZ, 6" K-style gutter',
    specLabel: 'Color / Profile / Gauge',
    specPlaceholder: 'Color, exposure, metal gauge, shingle series...',
    quantityLabel: 'Qty',
    quantityUnitPlaceholder: 'sqft / lf / squares',
    notesPlaceholder: 'Warranty, transitions, drip edge, ice & water, etc.',
  },
  flooring: {
    productLabel: 'Flooring Product',
    productPlaceholder: 'Product + collection',
    specLabel: 'Type / Pattern',
    specPlaceholder: 'LVP, tile, herringbone...',
    quantityLabel: 'Qty',
    quantityUnitPlaceholder: 'sqft',
    notesPlaceholder: 'Install pattern and underlayment notes',
  },
  tiling: {
    productLabel: 'Tile Product',
    productPlaceholder: 'Tile name + size',
    specLabel: 'Layout / Grout',
    specPlaceholder: 'Offset, grout color, trim profile...',
    quantityLabel: 'Qty',
    quantityUnitPlaceholder: 'sqft',
    notesPlaceholder: 'Tile layout notes and transitions',
  },
  'lighting-electrical': {
    productLabel: 'Fixture / Device',
    productPlaceholder: 'Pendant, sconce, switch...',
    specLabel: 'Finish / Rating',
    specPlaceholder: 'Matte black, wet rated, dimmable...',
    quantityLabel: 'Count',
    quantityUnitPlaceholder: 'ea',
    notesPlaceholder: 'Mounting heights, dimmer grouping, controls',
  },
  'cabinetry-millwork': {
    productLabel: 'Cabinet / Millwork Item',
    productPlaceholder: 'Cabinet line or custom item',
    specLabel: 'Style / Finish',
    specPlaceholder: 'Shaker, stain color, hardware...',
    quantityLabel: 'Qty',
    quantityUnitPlaceholder: 'lf',
    notesPlaceholder: 'Construction, edge profile, reveal details',
  },
  'countertops-slab': {
    productLabel: 'Countertop / Slab',
    productPlaceholder: 'Material + colorway',
    specLabel: 'Edge / Thickness',
    specPlaceholder: '2cm eased edge...',
    quantityLabel: 'Qty',
    quantityUnitPlaceholder: 'sqft',
    notesPlaceholder: 'Seam and overhang notes',
  },
  'plumbing-fixtures-hardware': {
    productLabel: 'Fixture / Hardware',
    productPlaceholder: 'Faucet, shower trim, pulls...',
    specLabel: 'Finish / Collection',
    specPlaceholder: 'Brushed nickel, collection name...',
    quantityLabel: 'Count',
    quantityUnitPlaceholder: 'ea',
    notesPlaceholder: 'Mounting type and rough-in notes',
  },
  'doors-windows-trim': {
    productLabel: 'Door / Window / Trim Item',
    productPlaceholder: 'Door style, window type, trim profile...',
    specLabel: 'Species / Finish',
    specPlaceholder: 'Poplar painted, oak stained...',
    quantityLabel: 'Qty',
    quantityUnitPlaceholder: 'ea',
    notesPlaceholder: 'Casing/base profile and install notes',
  },
  appliances: {
    productLabel: 'Appliance',
    productPlaceholder: 'Brand + model',
    specLabel: 'Panel / Finish',
    specPlaceholder: 'Panel-ready, stainless...',
    quantityLabel: 'Count',
    quantityUnitPlaceholder: 'ea',
    notesPlaceholder: 'Power/water requirements and clearances',
  },
  other: {
    productLabel: 'Product',
    productPlaceholder: 'Product name',
    specLabel: 'Spec / Finish',
    specPlaceholder: 'Color, finish, model...',
    quantityLabel: 'Qty',
    quantityUnitPlaceholder: 'ea',
    notesPlaceholder: 'Additional notes',
  },
}

/** Preview-only library items (org-wide library + drag-and-drop will replace this). */
type MockLibraryKind = 'paint' | 'lighting' | 'plumbing' | 'flooring'

interface MockLibraryItem {
  id: string
  kind: MockLibraryKind
  name: string
  detail: string
  swatch?: string
}

const MOCK_LIBRARY_ITEMS: MockLibraryItem[] = [
  { id: 'm1', kind: 'paint', name: 'Agreeable Gray', detail: 'Sherwin-Williams 7029', swatch: '#cfc8bf' },
  { id: 'm2', kind: 'paint', name: 'Pure White', detail: 'Sherwin-Williams 7005', swatch: '#f2f0e8' },
  { id: 'm3', kind: 'paint', name: 'Urbane Bronze', detail: 'Sherwin-Williams 7048', swatch: '#54504a' },
  { id: 'm4', kind: 'lighting', name: 'Alta sconce', detail: 'Schoolhouse · Matte black' },
  { id: 'm5', kind: 'lighting', name: 'Disk LED trim', detail: '4" · 2700K · Dimmable' },
  { id: 'm6', kind: 'plumbing', name: 'Lenta pull-down', detail: 'Delta · SpotShield stainless' },
  { id: 'm7', kind: 'plumbing', name: 'Lahara bath set', detail: 'Champagne bronze' },
  { id: 'm8', kind: 'flooring', name: 'Whisper White oak', detail: 'Engineered 7" · Matte finish' },
  { id: 'm9', kind: 'flooring', name: 'Bianco porcelain', detail: '24×24 · Large format' },
]

const LIBRARY_FILTER_LABELS: Record<MockLibraryKind | 'all', string> = {
  all: 'All',
  paint: 'Paint',
  lighting: 'Lighting',
  plumbing: 'Plumbing',
  flooring: 'Flooring',
}

function selectionObjectHasContent(sel?: Record<string, unknown>): boolean {
  if (!sel || typeof sel !== 'object') return false
  return Object.keys(sel).some((k) => k !== 'includeInSchedule')
}

/** Maps saved rows from older versions (e.g. renamed schedule types). */
function normalizeScheduleRows(rows: SelectionScheduleRow[]): SelectionScheduleRow[] {
  return rows.map((r) => {
    if ((r.scheduleType as string) === 'exterior-paint') {
      return { ...r, scheduleType: 'exterior-finishes' }
    }
    return r
  })
}

function mapCategoryToScheduleType(category?: string): SelectionScheduleType {
  const c = (category || '').toLowerCase()
  // Envelope / exterior finishes (siding, roofing, gutters, etc.) — before generic "paint"
  if (c === 'roofing' || c === 'exterior-finishes') return 'exterior-finishes'
  if (
    c.includes('gutter') ||
    c.includes('siding') ||
    c.includes('soffit') ||
    c.includes('fascia') ||
    c.includes('cladding') ||
    c.includes('downspout') ||
    (c.includes('roof') && !c.includes('under') && !c.includes('green'))
  ) {
    return 'exterior-finishes'
  }
  if (c.includes('paint')) {
    if (c.includes('exterior') || c.includes(' ext')) return 'exterior-finishes'
    return 'interior-paint'
  }
  if (c.includes('floor')) return 'flooring'
  if (c.includes('tile')) return 'tiling'
  if (c.includes('light') || c.includes('electr')) return 'lighting-electrical'
  if (c.includes('cabinet') || c.includes('millwork')) return 'cabinetry-millwork'
  if (c.includes('counter') || c.includes('slab')) return 'countertops-slab'
  if (c.includes('plumb') || c.includes('fixture') || c.includes('hardware')) return 'plumbing-fixtures-hardware'
  if (c.includes('door') || c.includes('window') || c.includes('trim')) return 'doors-windows-trim'
  if (c.includes('appliance')) return 'appliances'
  return 'other'
}

function tradeHasSelection(trade: Trade): boolean {
  if (Boolean((trade.selection as Record<string, unknown> | undefined)?.includeInSchedule)) return true
  if (trade.selection && selectionObjectHasContent(trade.selection as Record<string, unknown>)) return true
  const subItems = trade.subItems || []
  return subItems.some(
    (s) =>
      s.selectionOnly ||
      Boolean((s.selection as Record<string, unknown> | undefined)?.includeInSchedule) ||
      (s.selection && selectionObjectHasContent(s.selection as Record<string, unknown>)),
  )
}

function toRowFromTrade(trade: Trade): SelectionScheduleRow {
  return {
    id: uuidv4(),
    scheduleType: mapCategoryToScheduleType(trade.category),
    roomAreaType: 'room',
    roomAreaLabel: '',
    sourceType: 'trade',
    sourceId: trade.id,
    sourceName: trade.name,
    itemName: trade.name,
    quantity: trade.quantity,
    quantityUnit: trade.unit,
    notes: trade.description,
    status: 'flagged',
  }
}

function toRowsFromSubItems(trade: Trade): SelectionScheduleRow[] {
  const subItems = (trade.subItems || []).filter(
    (s: SubItem) =>
      s.selectionOnly ||
      Boolean((s.selection as Record<string, unknown> | undefined)?.includeInSchedule) ||
      (s.selection && selectionObjectHasContent(s.selection as Record<string, unknown>)),
  )
  return subItems.map((sub) => ({
    id: uuidv4(),
    scheduleType: mapCategoryToScheduleType(trade.category),
    roomAreaType: 'room',
    roomAreaLabel: '',
    sourceType: 'sub-item',
    sourceId: sub.id,
    sourceName: sub.name,
    itemName: sub.name,
    quantity: sub.quantity,
    quantityUnit: sub.unit,
    notes: sub.description,
    status: 'flagged',
  }))
}

function buildRowsFromSelectionFlags(trades: Trade[]): SelectionScheduleRow[] {
  const rows: SelectionScheduleRow[] = []
  trades.forEach((trade) => {
    if (!tradeHasSelection(trade)) return
    rows.push(toRowFromTrade(trade), ...toRowsFromSubItems(trade))
  })
  return rows
}

const SHEET_INPUT =
  'h-10 w-full min-w-0 text-sm border-slate-200 bg-white shadow-sm focus-visible:ring-1 focus-visible:ring-slate-300'

export function SelectionSchedules({ project, onBack }: SelectionSchedulesProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingVersion, setSavingVersion] = useState(false)
  const [rows, setRows] = useState<SelectionScheduleRow[]>([])
  const [message, setMessage] = useState<string>('')
  const [selectedScheduleType, setSelectedScheduleType] = useState<SelectionScheduleType | 'all'>('all')
  const [versions, setVersions] = useState<
    Array<{ id: string; label: string; isDraft: boolean }>
  >([])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('latest')
  const [newVersionLabel, setNewVersionLabel] = useState('')
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor')
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [libraryFilter, setLibraryFilter] = useState<MockLibraryKind | 'all'>('all')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  const filteredLibraryItems = useMemo(() => {
    if (libraryFilter === 'all') return MOCK_LIBRARY_ITEMS
    return MOCK_LIBRARY_ITEMS.filter((i) => i.kind === libraryFilter)
  }, [libraryFilter])

  const typeCounts = useMemo(() => {
    const m = {} as Record<SelectionScheduleType, number>
    ;(Object.keys(SCHEDULE_LABELS) as SelectionScheduleType[]).forEach((k) => {
      m[k] = 0
    })
    rows.forEach((r) => {
      m[r.scheduleType] = (m[r.scheduleType] || 0) + 1
    })
    return m
  }, [rows])

  const visibleRows = useMemo(
    () =>
      selectedScheduleType === 'all'
        ? rows
        : rows.filter((r) => r.scheduleType === selectedScheduleType),
    [rows, selectedScheduleType],
  )

  const groupedVisibleRows = useMemo(() => {
    const group: Record<SelectionScheduleType, SelectionScheduleRow[]> = {
      'interior-paint': [],
      'exterior-finishes': [],
      flooring: [],
      tiling: [],
      'lighting-electrical': [],
      'cabinetry-millwork': [],
      'countertops-slab': [],
      'plumbing-fixtures-hardware': [],
      'doors-windows-trim': [],
      appliances: [],
      other: [],
    }
    visibleRows.forEach((row) => {
      group[row.scheduleType].push(row)
    })
    return group
  }, [visibleRows])

  const refreshVersions = async () => {
    const listed = await listSelectionScheduleVersions(project.id)
    setVersions(
      listed.map((v) => ({
        id: v.id,
        isDraft: v.isDraft,
        label: v.isDraft
          ? `Draft${v.versionLabel ? ` - ${v.versionLabel}` : ''}`
          : `V${v.versionNumber}${v.versionLabel ? ` - ${v.versionLabel}` : ''}`,
      })),
    )
  }

  const loadData = async () => {
    setLoading(true)
    try {
      await refreshVersions()
      if (selectedVersionId !== 'latest') {
        const selected = await loadSelectionScheduleVersionById(selectedVersionId)
        if (selected?.data?.rows?.length) {
          setRows(normalizeScheduleRows(selected.data.rows))
          setLoading(false)
          return
        }
      }

      const [draft, trades] = await Promise.all([
        loadSelectionScheduleDraft(project.id),
        getTradesForEstimate_Hybrid(project.estimate.id),
      ])
      if (draft?.data?.rows?.length) {
        setRows(normalizeScheduleRows(draft.data.rows))
      } else {
        setRows(buildRowsFromSelectionFlags(trades))
      }
    } catch (error) {
      console.error('Error loading selection schedules:', error)
      setMessage('Unable to load selection schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, selectedVersionId])

  const regenerateFromEstimate = async () => {
    const trades = await getTradesForEstimate_Hybrid(project.estimate.id)
    setRows(buildRowsFromSelectionFlags(trades))
    setMessage('Draft rows regenerated from estimate selection flags.')
  }

  const saveDraft = async () => {
    setSaving(true)
    const payload: SelectionScheduleDocument = {
      projectName: project.name,
      preparedDate: new Date().toISOString().split('T')[0],
      versionLabel: 'Draft',
      rows,
    }
    const ok = await saveSelectionScheduleDraft(project.id, payload, 'Draft')
    setSaving(false)
    await refreshVersions()
    setMessage(ok ? 'Selection schedule draft saved.' : 'Failed to save draft.')
  }

  const saveVersion = async () => {
    setSavingVersion(true)
    const payload: SelectionScheduleDocument = {
      projectName: project.name,
      preparedDate: new Date().toISOString().split('T')[0],
      versionLabel: newVersionLabel || undefined,
      rows,
    }
    const ok = await saveSelectionScheduleVersion(project.id, payload, newVersionLabel || undefined)
    setSavingVersion(false)
    if (ok) {
      setNewVersionLabel('')
      await refreshVersions()
      setMessage('Selection schedule version saved.')
    } else {
      setMessage('Failed to save selection schedule version.')
    }
  }

  const updateRow = (id: string, updates: Partial<SelectionScheduleRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
  }

  const handleRowImageFile = async (row: SelectionScheduleRow, file: File | null) => {
    if (!file) return
    setUploadingRowId(row.id)
    try {
      if (row.imageStoragePath) {
        await removeSelectionScheduleRowImageFromStorage(row.imageStoragePath)
      }
      const result = await uploadSelectionScheduleRowImage(project.id, row.id, file)
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      updateRow(row.id, {
        imageUrl: result.imageUrl,
        imageStoragePath: result.imageStoragePath,
      })
      setMessage('Image uploaded.')
    } finally {
      setUploadingRowId(null)
    }
  }

  const clearRowImage = async (row: SelectionScheduleRow) => {
    if (row.imageStoragePath) {
      await removeSelectionScheduleRowImageFromStorage(row.imageStoragePath)
    }
    updateRow(row.id, { imageUrl: undefined, imageStoragePath: undefined })
  }

  const handlePrintPreview = () => {
    if (viewMode !== 'preview') {
      setViewMode('preview')
      setTimeout(() => {
        window.print()
      }, 50)
      return
    }
    window.print()
  }

  return (
    <>
      <div className="no-print flex w-full max-w-[100vw] flex-col bg-slate-100/60">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 shadow-sm md:px-4">
          <div className="flex min-w-[180px] flex-1 flex-col gap-0.5">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Selection Schedules</h1>
            <p className="text-xs text-slate-500">{project.name} · Full-width sheet</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="w-[240px]">
            <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
              <SelectTrigger>
                <SelectValue placeholder="Load version" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest draft / generated</SelectItem>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className="w-[220px]"
            placeholder="Version label (optional)"
            value={newVersionLabel}
            onChange={(e) => setNewVersionLabel(e.target.value)}
          />
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button variant="outline" onClick={regenerateFromEstimate}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerate from Estimate
          </Button>
          <Button onClick={saveDraft} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button variant="outline" onClick={saveVersion} disabled={savingVersion}>
            <Save className="w-4 h-4 mr-2" />
            {savingVersion ? 'Saving Version...' : 'Save Version'}
          </Button>
          <Button variant="outline" onClick={handlePrintPreview}>
            <Printer className="w-4 h-4 mr-2" />
            Print / Save PDF
          </Button>
          </div>
        </header>

        {message && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">{message}</div>
        )}

        <div className="flex min-h-[min(72vh,820px)] w-full min-w-0 flex-1">
          <aside
            className={`no-print flex shrink-0 flex-col border-r border-slate-200 bg-slate-50 transition-[width] duration-200 ease-out ${
              libraryOpen ? 'w-[min(300px,92vw)]' : 'w-11'
            }`}
          >
            {libraryOpen ? (
              <>
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <Library className="h-4 w-4 shrink-0 text-slate-600" />
                      Selection library
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      Sample tiles for layout preview. Drag-and-drop onto rows will connect here next.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setLibraryOpen(false)}
                    title="Collapse library"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 py-2">
                  {(Object.keys(LIBRARY_FILTER_LABELS) as (MockLibraryKind | 'all')[]).map((key) => (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={libraryFilter === key ? 'default' : 'outline'}
                      className="h-7 text-xs"
                      onClick={() => setLibraryFilter(key)}
                    >
                      {LIBRARY_FILTER_LABELS[key]}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 py-2 pb-4">
                  {filteredLibraryItems.map((item) => (
                    <div
                      key={item.id}
                      className="group cursor-default rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition-shadow hover:border-slate-300 hover:shadow"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical
                          className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-400"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {item.swatch ? (
                              <span
                                className="h-6 w-6 shrink-0 rounded border border-slate-200"
                                style={{ backgroundColor: item.swatch }}
                              />
                            ) : (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50">
                                <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                              </span>
                            )}
                            <span className="truncate text-xs font-medium text-slate-900">{item.name}</span>
                          </div>
                          <p className="mt-0.5 pl-8 text-[11px] leading-snug text-slate-500">{item.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center border-b border-slate-200 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setLibraryOpen(true)}
                  title="Show selection library"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </div>
            )}
          </aside>

          <main className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2">
              <span className="text-xs font-medium text-slate-500">Filter</span>
              <Button
                type="button"
                size="sm"
                variant={selectedScheduleType === 'all' ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setSelectedScheduleType('all')}
              >
                All ({rows.length})
              </Button>
              {(Object.keys(SCHEDULE_LABELS) as SelectionScheduleType[]).map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={selectedScheduleType === key ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setSelectedScheduleType(key)}
                >
                  {SCHEDULE_LABELS[key]} ({typeCounts[key]})
                </Button>
              ))}
              <div className="ml-auto flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'editor' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setViewMode('editor')}
                >
                  Sheet
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'preview' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setViewMode('preview')}
                >
                  Client preview
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3 md:p-5">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-gray-600">
              No rows in this schedule yet.
            </p>
          ) : viewMode === 'preview' ? (
            <div className="space-y-6">
              <div className="border rounded bg-white p-6 md:p-10 min-h-[520px] flex flex-col justify-between">
                <div>
                  <img
                    src={hshLogo}
                    alt="HSH Contractor"
                    className="w-[220px] h-auto max-h-[72px] object-contain"
                  />
                </div>
                <div className="text-center py-8">
                  <h2 className="text-4xl font-bold leading-tight">Selection Schedules</h2>
                  <p className="text-xl text-gray-700 mt-3">{project.name}</p>
                  <p className="text-sm text-gray-500 mt-2">
                    {selectedScheduleType === 'all' ? 'All Schedule Sections' : SCHEDULE_LABELS[selectedScheduleType]}
                  </p>
                </div>
                <div className="border-t pt-3 text-xs text-gray-500 space-y-1">
                  <p>Prepared Date: {new Date().toLocaleDateString()}</p>
                  <p>Total Rows Included: {visibleRows.length}</p>
                  <p>Generated from estimate selection flags and schedule assignments</p>
                </div>
              </div>

              {(Object.keys(SCHEDULE_LABELS) as SelectionScheduleType[])
                .filter((type) => groupedVisibleRows[type].length > 0)
                .map((type) => (
                  <div key={type} className="space-y-2">
                    <h3 className="text-sm font-semibold">{SCHEDULE_LABELS[type]}</h3>
                    <div className="overflow-x-auto border rounded">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 w-24">Image</th>
                            <th className="text-left px-3 py-2">Room/Area</th>
                            <th className="text-left px-3 py-2">Item</th>
                            <th className="text-left px-3 py-2">{SCHEDULE_FIELD_PRESETS[type].productLabel}</th>
                            <th className="text-left px-3 py-2">{SCHEDULE_FIELD_PRESETS[type].specLabel}</th>
                            <th className="text-left px-3 py-2">{SCHEDULE_FIELD_PRESETS[type].quantityLabel}</th>
                            <th className="text-left px-3 py-2">Supplier / Link</th>
                            <th className="text-left px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedVisibleRows[type].map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="px-3 py-2 align-middle">
                                {row.imageUrl ? (
                                  <img
                                    src={row.imageUrl}
                                    alt=""
                                    className="h-14 w-14 object-cover rounded border bg-gray-50"
                                  />
                                ) : (
                                  <span className="text-gray-400 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2">{row.roomAreaLabel || '-'}</td>
                              <td className="px-3 py-2">{row.itemName || '-'}</td>
                              <td className="px-3 py-2">{row.productName || '-'}</td>
                              <td className="px-3 py-2">{row.specFinish || '-'}</td>
                              <td className="px-3 py-2">
                                {row.quantity != null ? `${row.quantity}${row.quantityUnit ? ` ${row.quantityUnit}` : ''}` : '-'}
                              </td>
                              <td className="px-3 py-2">{row.supplierLink || '-'}</td>
                              <td className="px-3 py-2 capitalize">{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      <th className="w-[7.5rem] min-w-[7.5rem] px-2 py-3 align-bottom">Img</th>
                      <th className="min-w-[120px] px-2 py-3 align-bottom">Room</th>
                      <th className="min-w-[140px] px-2 py-3 align-bottom">Item</th>
                      <th className="min-w-[160px] px-2 py-3 align-bottom">Product</th>
                      <th className="min-w-[140px] px-2 py-3 align-bottom">Spec</th>
                      <th className="w-28 px-2 py-3 align-bottom">Qty</th>
                      <th className="w-24 px-2 py-3 align-bottom">Unit</th>
                      <th className="w-[128px] px-2 py-3 align-bottom">Status</th>
                      <th className="w-12 px-1 py-3 align-bottom" aria-label="Row details" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50/80">
                          <td className="px-2 py-3 align-middle">
                            {row.imageUrl ? (
                              <img
                                src={row.imageUrl}
                                alt=""
                                className="h-24 w-24 rounded-md border border-slate-200 object-cover shadow-sm"
                              />
                            ) : (
                              <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50">
                                <ImageIcon className="h-8 w-8 text-slate-300" />
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-3 align-top">
                            <Input
                              className={SHEET_INPUT}
                              value={row.roomAreaLabel || ''}
                              onChange={(e) =>
                                updateRow(row.id, { roomAreaLabel: e.target.value, status: 'scheduled' })
                              }
                              placeholder="Kitchen, exterior…"
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <Input
                              className={SHEET_INPUT}
                              value={row.itemName}
                              onChange={(e) => updateRow(row.id, { itemName: e.target.value })}
                              placeholder="Line item"
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <Input
                              className={SHEET_INPUT}
                              value={row.productName || ''}
                              onChange={(e) =>
                                updateRow(row.id, { productName: e.target.value, status: 'scheduled' })
                              }
                              placeholder={SCHEDULE_FIELD_PRESETS[row.scheduleType].productPlaceholder}
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <Input
                              className={SHEET_INPUT}
                              value={row.specFinish || ''}
                              onChange={(e) =>
                                updateRow(row.id, { specFinish: e.target.value, status: 'scheduled' })
                              }
                              placeholder={SCHEDULE_FIELD_PRESETS[row.scheduleType].specPlaceholder}
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <Input
                              className={SHEET_INPUT}
                              type="number"
                              value={row.quantity ?? ''}
                              onChange={(e) =>
                                updateRow(row.id, { quantity: parseFloat(e.target.value) || undefined })
                              }
                              placeholder="0"
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <Input
                              className={SHEET_INPUT}
                              value={row.quantityUnit || ''}
                              onChange={(e) => updateRow(row.id, { quantityUnit: e.target.value })}
                              placeholder={SCHEDULE_FIELD_PRESETS[row.scheduleType].quantityUnitPlaceholder}
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <Select
                              value={row.status}
                              onValueChange={(v) =>
                                updateRow(row.id, { status: v as SelectionScheduleRow['status'] })
                              }
                            >
                              <SelectTrigger className="h-10 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="flagged">Flagged</SelectItem>
                                <SelectItem value="scheduled">Scheduled</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-1 py-3 align-middle">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0"
                              aria-expanded={expandedRowId === row.id}
                              onClick={() =>
                                setExpandedRowId((id) => (id === row.id ? null : row.id))
                              }
                              title="More fields"
                            >
                              {expandedRowId === row.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                        </tr>
                        {expandedRowId === row.id && (
                          <tr className="bg-slate-50/95">
                            <td colSpan={9} className="border-b border-slate-100 px-4 py-3">
                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-slate-600">Schedule</Label>
                                  <Select
                                    value={row.scheduleType}
                                    onValueChange={(v) =>
                                      updateRow(row.id, { scheduleType: v as SelectionScheduleType })
                                    }
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(SCHEDULE_LABELS).map(([k, label]) => (
                                        <SelectItem key={k} value={k}>
                                          {label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-slate-600">Area type</Label>
                                  <Select
                                    value={row.roomAreaType}
                                    onValueChange={(v) =>
                                      updateRow(row.id, {
                                        roomAreaType: v as SelectionScheduleRow['roomAreaType'],
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="room">Room</SelectItem>
                                      <SelectItem value="whole-home">Whole Home</SelectItem>
                                      <SelectItem value="exterior">Exterior</SelectItem>
                                      <SelectItem value="site">Site</SelectItem>
                                      <SelectItem value="custom">Custom</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-slate-600">Lead time</Label>
                                  <Input
                                    className={SHEET_INPUT}
                                    value={row.leadTime || ''}
                                    onChange={(e) => updateRow(row.id, { leadTime: e.target.value })}
                                    placeholder="e.g. 3–4 weeks"
                                  />
                                </div>
                                <div className="space-y-1.5 md:col-span-2">
                                  <Label className="text-xs text-slate-600">Supplier / link</Label>
                                  <Input
                                    className={SHEET_INPUT}
                                    value={row.supplierLink || ''}
                                    onChange={(e) => updateRow(row.id, { supplierLink: e.target.value })}
                                    placeholder="https://…"
                                  />
                                </div>
                                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                                  <Label className="text-xs text-slate-600">Notes</Label>
                                  <Input
                                    className={SHEET_INPUT}
                                    value={row.notes || ''}
                                    onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                                    placeholder={SCHEDULE_FIELD_PRESETS[row.scheduleType].notesPlaceholder}
                                  />
                                </div>
                                <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 md:col-span-2 lg:col-span-3 sm:flex-row">
                                  <div className="shrink-0">
                                    {row.imageUrl ? (
                                      <div className="relative inline-block">
                                        <img
                                          src={row.imageUrl}
                                          alt=""
                                          className="h-24 w-24 rounded border border-slate-200 bg-white object-cover"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-white shadow-sm"
                                          onClick={() => void clearRowImage(row)}
                                          title="Remove image"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed border-slate-200 bg-white text-slate-400">
                                        <ImageIcon className="h-8 w-8" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <Label className="text-xs text-slate-600">
                                      Reference image (swatch / product photo)
                                    </Label>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        id={`schedule-row-img-${row.id}`}
                                        onChange={(e) => {
                                          const f = e.target.files?.[0] ?? null
                                          void handleRowImageFile(row, f)
                                          e.target.value = ''
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={uploadingRowId === row.id}
                                        onClick={() =>
                                          document.getElementById(`schedule-row-img-${row.id}`)?.click()
                                        }
                                      >
                                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                                        {uploadingRowId === row.id ? 'Uploading…' : 'Upload'}
                                      </Button>
                                      <span className="text-xs text-slate-500">
                                        Stored in your project files (same as Selection Book images).
                                      </span>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-slate-500">Or paste image URL</Label>
                                      <Input
                                        className={`mt-0.5 ${SHEET_INPUT}`}
                                        value={row.imageStoragePath ? '' : row.imageUrl || ''}
                                        readOnly={Boolean(row.imageStoragePath)}
                                        placeholder={
                                          row.imageStoragePath
                                            ? 'Remove uploaded image above to use a URL instead'
                                            : 'https://…'
                                        }
                                        onChange={(e) => {
                                          const v = e.target.value.trim()
                                          updateRow(row.id, { imageUrl: v || undefined, imageStoragePath: undefined })
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
            </div>
          </main>
        </div>
      </div>

      <div id="printable-content" className="print-only">
        <div className="print-container">
          <div
            className="page-break-after"
            style={{
              minHeight: '9.5in',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '0.5in 0.25in',
            }}
          >
            <div>
              <img
                src={hshLogo}
                alt="HSH Contractor"
                style={{ width: '220px', height: 'auto', maxHeight: '72px', objectFit: 'contain' }}
              />
            </div>

            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <h1 style={{ fontSize: '34px', lineHeight: 1.15, fontWeight: 700, margin: 0 }}>
                Selection Schedules
              </h1>
              <p style={{ fontSize: '18px', margin: '12px 0 0', color: '#374151' }}>
                {project.name}
              </p>
              <p style={{ fontSize: '14px', margin: '8px 0 0', color: '#6b7280' }}>
                {selectedScheduleType === 'all' ? 'All Schedule Sections' : SCHEDULE_LABELS[selectedScheduleType]}
              </p>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#6b7280' }}>
                Prepared Date: {new Date().toLocaleDateString()}
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#6b7280' }}>
                Total Rows Included: {visibleRows.length}
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#6b7280' }}>
                Generated from estimate selection flags and schedule assignments
              </p>
            </div>
          </div>

          <div className="print-header">
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Selection Schedules</h1>
            <p style={{ margin: 0 }}>{project.name}</p>
            <p style={{ margin: 0 }}>
              Prepared: {new Date().toLocaleDateString()} | Scope:{' '}
              {selectedScheduleType === 'all' ? 'All Schedules' : SCHEDULE_LABELS[selectedScheduleType]}
            </p>
          </div>

          {(Object.keys(SCHEDULE_LABELS) as SelectionScheduleType[])
            .filter((type) => groupedVisibleRows[type].length > 0)
            .map((type) => (
              <div key={`print-${type}`} className="print-section page-break-inside-avoid">
                <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '16px 0 8px' }}>
                  {SCHEDULE_LABELS[type]}
                </h2>
                <table>
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Room/Area</th>
                      <th>Item</th>
                      <th>{SCHEDULE_FIELD_PRESETS[type].productLabel}</th>
                      <th>{SCHEDULE_FIELD_PRESETS[type].specLabel}</th>
                      <th>{SCHEDULE_FIELD_PRESETS[type].quantityLabel}</th>
                      <th>Supplier / Link</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedVisibleRows[type].map((row) => (
                      <tr key={`print-row-${row.id}`}>
                        <td style={{ width: '72px' }}>
                          {row.imageUrl ? (
                            <img
                              src={row.imageUrl}
                              alt=""
                              style={{ maxWidth: '64px', maxHeight: '64px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{row.roomAreaLabel || '-'}</td>
                        <td>{row.itemName || '-'}</td>
                        <td>{row.productName || '-'}</td>
                        <td>{row.specFinish || '-'}</td>
                        <td>
                          {row.quantity != null
                            ? `${row.quantity}${row.quantityUnit ? ` ${row.quantityUnit}` : ''}`
                            : '-'}
                        </td>
                        <td>{row.supplierLink || '-'}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      </div>
    </>
  )
}

