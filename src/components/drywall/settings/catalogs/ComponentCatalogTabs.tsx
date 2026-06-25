import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { generateCatalogEntryId } from '@/lib/drywall/catalogUtils'
import type {
  AcousticCatalogEntry,
  DrywallCatalogKey,
  FrpCatalogEntry,
  InsulationCatalogEntry,
  MetalStudCatalogEntry,
  OrgDrywallCatalogs,
  RcChannelCatalogEntry,
  SuspendedGridCatalogEntry,
} from '@/types/drywallCatalogs'
import { ComponentCatalogTab } from './ComponentCatalogTab'
import { formatCatalogRate, parseCatalogRate } from './catalogShared'

type CatalogUpdater = <K extends DrywallCatalogKey>(
  key: K,
  items: OrgDrywallCatalogs[K],
) => void

type TabProps = {
  readOnly: boolean
  onUpdate: CatalogUpdater
  catalogs: OrgDrywallCatalogs
}

function EntryDialog({
  open,
  title,
  onOpenChange,
  onSave,
  children,
  saveDisabled,
}: {
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
  onSave: () => void
  saveDisabled?: boolean
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">{children}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saveDisabled}>
            Save entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function RcChannelTab({ readOnly, onUpdate, catalogs }: TabProps) {
  const items = catalogs.rc_channel
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<RcChannelCatalogEntry | null>(null)

  const startEdit = (entry?: RcChannelCatalogEntry) => {
    setDraft(
      entry ?? {
        id: generateCatalogEntryId('rc'),
        display_name: '',
        size: '',
        material_rate_per_piece: 0,
        labor_rate: 0,
      },
    )
    setOpen(true)
  }

  const save = () => {
    if (!draft?.display_name.trim() || !draft.size.trim()) return
    const next = items.some((i) => i.id === draft.id)
      ? items.map((i) => (i.id === draft.id ? draft : i))
      : [...items, draft]
    onUpdate('rc_channel', next)
    setOpen(false)
  }

  return (
    <>
      <ComponentCatalogTab
        title="RC channel"
        description="RC channel sizes, gauges, material and labor rates per LF installed."
        emptyMessage="No RC channel entries yet. Add your first entry to seed rates for quotes."
        items={items}
        readOnly={readOnly}
        searchText={(i) => `${i.display_name} ${i.size} ${i.gauge ?? ''}`}
        onChange={(next) => onUpdate('rc_channel', next)}
        onAdd={() => startEdit()}
        onEdit={startEdit}
        columns={[
          { key: 'name', header: 'Name', cell: (i) => i.display_name },
          { key: 'size', header: 'Size', cell: (i) => i.size },
          { key: 'mat', header: 'Mat $/piece', cell: (i) => formatCatalogRate(i.material_rate_per_piece), className: 'tabular-nums' },
          { key: 'labor', header: 'Labor $/LF', cell: (i) => formatCatalogRate(i.labor_rate), className: 'tabular-nums' },
        ]}
      />
      <EntryDialog
        open={open}
        title={draft && items.some((i) => i.id === draft.id) ? 'Edit RC channel' : 'Add RC channel'}
        onOpenChange={setOpen}
        onSave={save}
        saveDisabled={!draft?.display_name.trim() || !draft?.size.trim()}
      >
        {draft && (
          <>
            <Field label="Display name *">
              <Input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
            </Field>
            <Field label="Size *">
              <Input value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })} placeholder='7/8"' />
            </Field>
            <Field label="Gauge">
              <Input value={draft.gauge ?? ''} onChange={(e) => setDraft({ ...draft, gauge: e.target.value })} />
            </Field>
            <Field label="Spacing">
              <Input value={draft.spacing ?? ''} onChange={(e) => setDraft({ ...draft, spacing: e.target.value })} />
            </Field>
            <Field label="Material rate ($/piece) *">
              <Input type="number" min={0} step={0.01} value={String(draft.material_rate_per_piece)} onChange={(e) => setDraft({ ...draft, material_rate_per_piece: parseCatalogRate(e.target.value) })} />
            </Field>
            <Field label="Labor rate ($/LF) *">
              <Input type="number" min={0} step={0.01} value={String(draft.labor_rate)} onChange={(e) => setDraft({ ...draft, labor_rate: parseCatalogRate(e.target.value) })} />
            </Field>
          </>
        )}
      </EntryDialog>
    </>
  )
}

export function SuspendedGridTab({ readOnly, onUpdate, catalogs }: TabProps) {
  const items = catalogs.suspended_grid
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SuspendedGridCatalogEntry | null>(null)

  const startEdit = (entry?: SuspendedGridCatalogEntry) => {
    setDraft(
      entry ?? {
        id: generateCatalogEntryId('sg'),
        display_name: '',
        component_type: 'mains',
        unit: 'each',
        material_rate: 0,
        labor_rate: 0,
      },
    )
    setOpen(true)
  }

  const save = () => {
    if (!draft?.display_name.trim()) return
    const next = items.some((i) => i.id === draft.id)
      ? items.map((i) => (i.id === draft.id ? draft : i))
      : [...items, draft]
    onUpdate('suspended_grid', next)
    setOpen(false)
  }

  return (
    <>
      <ComponentCatalogTab
        title="Suspended grid"
        description="Grid ceiling components — mains, tees, wire, lags, and angles."
        emptyMessage="No suspended grid entries yet."
        items={items}
        readOnly={readOnly}
        searchText={(i) => `${i.display_name} ${i.component_type}`}
        onChange={(next) => onUpdate('suspended_grid', next)}
        onAdd={() => startEdit()}
        onEdit={startEdit}
        columns={[
          { key: 'name', header: 'Name', cell: (i) => i.display_name },
          { key: 'type', header: 'Type', cell: (i) => i.component_type },
          { key: 'unit', header: 'Unit', cell: (i) => i.unit },
          { key: 'mat', header: 'Mat rate', cell: (i) => formatCatalogRate(i.material_rate), className: 'tabular-nums' },
          { key: 'labor', header: 'Labor rate', cell: (i) => formatCatalogRate(i.labor_rate), className: 'tabular-nums' },
        ]}
      />
      <EntryDialog open={open} title="Suspended grid entry" onOpenChange={setOpen} onSave={save} saveDisabled={!draft?.display_name.trim()}>
        {draft && (
          <>
            <Field label="Display name *">
              <Input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
            </Field>
            <Field label="Component type">
              <Select value={draft.component_type} onValueChange={(v) => setDraft({ ...draft, component_type: v as SuspendedGridCatalogEntry['component_type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['mains', 'tees_4ft', 'tees_2ft', 'wire', 'lags', 'shiny_90', 'wall_angle'] as const).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unit">
              <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v as 'each' | 'lf' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="each">each</SelectItem>
                  <SelectItem value="lf">LF</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Material rate *">
              <Input type="number" min={0} step={0.01} value={String(draft.material_rate)} onChange={(e) => setDraft({ ...draft, material_rate: parseCatalogRate(e.target.value) })} />
            </Field>
            <Field label="Labor rate *">
              <Input type="number" min={0} step={0.01} value={String(draft.labor_rate)} onChange={(e) => setDraft({ ...draft, labor_rate: parseCatalogRate(e.target.value) })} />
            </Field>
          </>
        )}
      </EntryDialog>
    </>
  )
}

export function InsulationTab({ readOnly, onUpdate, catalogs }: TabProps) {
  const items = catalogs.insulation
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<InsulationCatalogEntry | null>(null)

  const startEdit = (entry?: InsulationCatalogEntry) => {
    setDraft(
      entry ?? {
        id: generateCatalogEntryId('ins'),
        display_name: '',
        r_value: '',
        faced: false,
        rigid: false,
        material_rate_per_sqft: 0,
        labor_rate: 0,
      },
    )
    setOpen(true)
  }

  const save = () => {
    if (!draft?.display_name.trim() || !draft.r_value.trim()) return
    const next = items.some((i) => i.id === draft.id)
      ? items.map((i) => (i.id === draft.id ? draft : i))
      : [...items, draft]
    onUpdate('insulation', next)
    setOpen(false)
  }

  return (
    <>
      <ComponentCatalogTab
        title="Insulation"
        description="Insulation types and material rates per sqft."
        emptyMessage="No insulation entries yet."
        items={items}
        readOnly={readOnly}
        searchText={(i) => `${i.display_name} ${i.r_value}`}
        onChange={(next) => onUpdate('insulation', next)}
        onAdd={() => startEdit()}
        onEdit={startEdit}
        columns={[
          { key: 'name', header: 'Name', cell: (i) => i.display_name },
          { key: 'r', header: 'R-value', cell: (i) => i.r_value },
          { key: 'mat', header: 'Mat $/sqft', cell: (i) => formatCatalogRate(i.material_rate_per_sqft), className: 'tabular-nums' },
          { key: 'labor', header: 'Labor $/sqft', cell: (i) => formatCatalogRate(i.labor_rate), className: 'tabular-nums' },
        ]}
      />
      <EntryDialog open={open} title="Insulation entry" onOpenChange={setOpen} onSave={save} saveDisabled={!draft?.display_name.trim() || !draft?.r_value.trim()}>
        {draft && (
          <>
            <Field label="Display name *"><Input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></Field>
            <Field label="R-value *"><Input value={draft.r_value} onChange={(e) => setDraft({ ...draft, r_value: e.target.value })} placeholder="R-13" /></Field>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.faced} onChange={(e) => setDraft({ ...draft, faced: e.target.checked })} /> Faced</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.rigid} onChange={(e) => setDraft({ ...draft, rigid: e.target.checked })} /> Rigid</label>
            </div>
            <Field label="Material rate ($/sqft) *"><Input type="number" min={0} step={0.01} value={String(draft.material_rate_per_sqft)} onChange={(e) => setDraft({ ...draft, material_rate_per_sqft: parseCatalogRate(e.target.value) })} /></Field>
            <Field label="Labor rate ($/sqft) *"><Input type="number" min={0} step={0.01} value={String(draft.labor_rate)} onChange={(e) => setDraft({ ...draft, labor_rate: parseCatalogRate(e.target.value) })} /></Field>
          </>
        )}
      </EntryDialog>
    </>
  )
}

export function AcousticTab({ readOnly, onUpdate, catalogs }: TabProps) {
  const items = catalogs.acoustic
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AcousticCatalogEntry | null>(null)

  const startEdit = (entry?: AcousticCatalogEntry) => {
    setDraft(
      entry ?? {
        id: generateCatalogEntryId('ac'),
        display_name: '',
        component_type: 'tile',
        unit: 'sqft',
        material_rate: 0,
        labor_rate: 0,
      },
    )
    setOpen(true)
  }

  const save = () => {
    if (!draft?.display_name.trim()) return
    const next = items.some((i) => i.id === draft.id)
      ? items.map((i) => (i.id === draft.id ? draft : i))
      : [...items, draft]
    onUpdate('acoustic', next)
    setOpen(false)
  }

  return (
    <>
      <ComponentCatalogTab
        title="Acoustic ceiling"
        description="Acoustic tile and grid component rates."
        emptyMessage="No acoustic ceiling entries yet."
        items={items}
        readOnly={readOnly}
        searchText={(i) => `${i.display_name} ${i.component_type}`}
        onChange={(next) => onUpdate('acoustic', next)}
        onAdd={() => startEdit()}
        onEdit={startEdit}
        columns={[
          { key: 'name', header: 'Name', cell: (i) => i.display_name },
          { key: 'type', header: 'Type', cell: (i) => i.component_type },
          { key: 'mat', header: 'Mat rate', cell: (i) => formatCatalogRate(i.material_rate), className: 'tabular-nums' },
          { key: 'labor', header: 'Labor rate', cell: (i) => formatCatalogRate(i.labor_rate), className: 'tabular-nums' },
        ]}
      />
      <EntryDialog open={open} title="Acoustic entry" onOpenChange={setOpen} onSave={save} saveDisabled={!draft?.display_name.trim()}>
        {draft && (
          <>
            <Field label="Display name *"><Input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></Field>
            <Field label="Component type">
              <Select value={draft.component_type} onValueChange={(v) => setDraft({ ...draft, component_type: v as AcousticCatalogEntry['component_type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['tile', 'mains', 'tees_4ft', 'tees_2ft', 'wire', 'lags', 'wall_angle'] as const).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tile size"><Input value={draft.tile_size ?? ''} onChange={(e) => setDraft({ ...draft, tile_size: e.target.value })} placeholder="2x4" /></Field>
            <Field label="Unit">
              <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v as AcousticCatalogEntry['unit'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqft">sqft</SelectItem>
                  <SelectItem value="each">each</SelectItem>
                  <SelectItem value="lf">LF</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Material rate *"><Input type="number" min={0} step={0.01} value={String(draft.material_rate)} onChange={(e) => setDraft({ ...draft, material_rate: parseCatalogRate(e.target.value) })} /></Field>
            <Field label="Labor rate *"><Input type="number" min={0} step={0.01} value={String(draft.labor_rate)} onChange={(e) => setDraft({ ...draft, labor_rate: parseCatalogRate(e.target.value) })} /></Field>
          </>
        )}
      </EntryDialog>
    </>
  )
}

export function MetalStudTab({ readOnly, onUpdate, catalogs }: TabProps) {
  const items = catalogs.metal_stud
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<MetalStudCatalogEntry | null>(null)

  const startEdit = (entry?: MetalStudCatalogEntry) => {
    setDraft(
      entry ?? {
        id: generateCatalogEntryId('ms'),
        display_name: '',
        size: '',
        gauge: '',
        component: 'stud',
        material_rate_per_piece: 0,
        labor_rate: 0,
      },
    )
    setOpen(true)
  }

  const save = () => {
    if (!draft?.display_name.trim() || !draft.size.trim() || !draft.gauge.trim()) return
    const next = items.some((i) => i.id === draft.id)
      ? items.map((i) => (i.id === draft.id ? draft : i))
      : [...items, draft]
    onUpdate('metal_stud', next)
    setOpen(false)
  }

  return (
    <>
      <ComponentCatalogTab
        title="Metal stud"
        description="Stud and track sizes with material rates per piece."
        emptyMessage="No metal stud entries yet."
        items={items}
        readOnly={readOnly}
        searchText={(i) => `${i.display_name} ${i.size} ${i.gauge}`}
        onChange={(next) => onUpdate('metal_stud', next)}
        onAdd={() => startEdit()}
        onEdit={startEdit}
        columns={[
          { key: 'name', header: 'Name', cell: (i) => i.display_name },
          { key: 'size', header: 'Size', cell: (i) => i.size },
          { key: 'comp', header: 'Component', cell: (i) => i.component },
          { key: 'mat', header: 'Mat $/piece', cell: (i) => formatCatalogRate(i.material_rate_per_piece), className: 'tabular-nums' },
          { key: 'labor', header: 'Labor $/LF', cell: (i) => formatCatalogRate(i.labor_rate), className: 'tabular-nums' },
        ]}
      />
      <EntryDialog open={open} title="Metal stud entry" onOpenChange={setOpen} onSave={save} saveDisabled={!draft?.display_name.trim() || !draft?.size.trim() || !draft?.gauge.trim()}>
        {draft && (
          <>
            <Field label="Display name *"><Input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></Field>
            <Field label="Size *"><Input value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })} /></Field>
            <Field label="Gauge *"><Input value={draft.gauge} onChange={(e) => setDraft({ ...draft, gauge: e.target.value })} /></Field>
            <Field label="Component">
              <Select value={draft.component} onValueChange={(v) => setDraft({ ...draft, component: v as 'stud' | 'track' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stud">Stud</SelectItem>
                  <SelectItem value="track">Track</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Material rate ($/piece) *"><Input type="number" min={0} step={0.01} value={String(draft.material_rate_per_piece)} onChange={(e) => setDraft({ ...draft, material_rate_per_piece: parseCatalogRate(e.target.value) })} /></Field>
            <Field label="Labor rate ($/LF) *"><Input type="number" min={0} step={0.01} value={String(draft.labor_rate)} onChange={(e) => setDraft({ ...draft, labor_rate: parseCatalogRate(e.target.value) })} /></Field>
          </>
        )}
      </EntryDialog>
    </>
  )
}

export function FrpTab({ readOnly, onUpdate, catalogs }: TabProps) {
  const items = catalogs.frp
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FrpCatalogEntry | null>(null)

  const startEdit = (entry?: FrpCatalogEntry) => {
    setDraft(
      entry ?? {
        id: generateCatalogEntryId('frp'),
        display_name: '',
        component_type: 'sheet',
        unit: 'sqft',
        material_rate: 0,
        labor_rate: 0,
      },
    )
    setOpen(true)
  }

  const save = () => {
    if (!draft?.display_name.trim()) return
    const next = items.some((i) => i.id === draft.id)
      ? items.map((i) => (i.id === draft.id ? draft : i))
      : [...items, draft]
    onUpdate('frp', next)
    setOpen(false)
  }

  return (
    <>
      <ComponentCatalogTab
        title="FRP"
        description="FRP sheets, adhesive, and trim component rates."
        emptyMessage="No FRP entries yet."
        items={items}
        readOnly={readOnly}
        searchText={(i) => `${i.display_name} ${i.component_type}`}
        onChange={(next) => onUpdate('frp', next)}
        onAdd={() => startEdit()}
        onEdit={startEdit}
        columns={[
          { key: 'name', header: 'Name', cell: (i) => i.display_name },
          { key: 'type', header: 'Type', cell: (i) => i.component_type },
          { key: 'unit', header: 'Unit', cell: (i) => i.unit },
          { key: 'mat', header: 'Mat rate', cell: (i) => formatCatalogRate(i.material_rate), className: 'tabular-nums' },
          { key: 'labor', header: 'Labor rate', cell: (i) => formatCatalogRate(i.labor_rate), className: 'tabular-nums' },
        ]}
      />
      <EntryDialog open={open} title="FRP entry" onOpenChange={setOpen} onSave={save} saveDisabled={!draft?.display_name.trim()}>
        {draft && (
          <>
            <Field label="Display name *"><Input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></Field>
            <Field label="Component type">
              <Select value={draft.component_type} onValueChange={(v) => setDraft({ ...draft, component_type: v as FrpCatalogEntry['component_type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['sheet', 'adhesive', 'corner_inside', 'corner_outside', 'jmold', 'division'] as const).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Unit">
              <Select value={draft.unit} onValueChange={(v) => setDraft({ ...draft, unit: v as FrpCatalogEntry['unit'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqft">sqft</SelectItem>
                  <SelectItem value="each">each</SelectItem>
                  <SelectItem value="bucket">bucket</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Material rate *"><Input type="number" min={0} step={0.01} value={String(draft.material_rate)} onChange={(e) => setDraft({ ...draft, material_rate: parseCatalogRate(e.target.value) })} /></Field>
            <Field label="Labor rate *"><Input type="number" min={0} step={0.01} value={String(draft.labor_rate)} onChange={(e) => setDraft({ ...draft, labor_rate: parseCatalogRate(e.target.value) })} /></Field>
          </>
        )}
      </EntryDialog>
    </>
  )
}
