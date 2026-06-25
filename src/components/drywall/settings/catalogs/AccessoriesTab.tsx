import { ArrowDownUp, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { generateCatalogEntryId } from '@/lib/drywall/catalogUtils'
import type { AccessoryCatalogEntry, AccessoryCategory, AccessoryCatalogUnit } from '@/types/drywallCatalogs'
import { formatCatalogRate, parseCatalogRate, useCatalogSearchSort } from './catalogShared'

const CATEGORIES: AccessoryCategory[] = [
  'joint_compound',
  'tape',
  'screws',
  'corner_bead',
  'other',
]

const UNITS: AccessoryCatalogUnit[] = ['bucket', 'roll', 'box', 'bag', 'lf', 'each']

type Props = {
  items: AccessoryCatalogEntry[]
  readOnly: boolean
  onChange: (items: AccessoryCatalogEntry[]) => void
}

export function AccessoriesTab({ items, readOnly, onChange }: Props) {
  const { search, setSearch, sortAsc, setSortAsc, filtered } = useCatalogSearchSort(
    items,
    (a) => `${a.display_name} ${a.id} ${a.category}`,
    (a) => a.display_name,
  )

  const patch = (id: string, patch: Partial<AccessoryCatalogEntry>) => {
    onChange(items.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const addRow = () => {
    onChange([
      ...items,
      {
        id: generateCatalogEntryId('acc'),
        display_name: 'New accessory',
        category: 'other',
        unit: 'each',
        material_rate: 0,
        sqft_per_unit: 0,
      },
    ])
  }

  const removeRow = (id: string) => {
    if (!window.confirm('Remove this accessory catalog entry?')) return
    onChange(items.filter((a) => a.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accessory catalog</CardTitle>
        <CardDescription>
          Finish-scope-driven accessory unit rates and sqft-per-unit baselines. Quantity formulas
          follow v2 accessoryCalc parity in quote math (Q.C.1).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search accessories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setSortAsc((v) => !v)}>
            <ArrowDownUp className="mr-2 h-4 w-4" />
            Sort {sortAsc ? 'A–Z' : 'Z–A'}
          </Button>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="mr-2 h-4 w-4" />
              Add accessory
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium w-[120px]">Category</th>
                <th className="px-4 py-3 font-medium w-[88px]">Unit</th>
                <th className="px-4 py-3 font-medium w-[108px] text-right">$/unit</th>
                <th className="px-4 py-3 font-medium w-[108px] text-right">Sqft/unit</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                {!readOnly && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    {readOnly ? (
                      <div>
                        <div className="font-medium">{row.display_name}</div>
                        <div className="text-muted-foreground text-xs">{row.id}</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Input
                          className="h-8"
                          value={row.display_name}
                          onChange={(e) => patch(row.id, { display_name: e.target.value })}
                        />
                        <div className="text-muted-foreground text-xs">{row.id}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      row.category
                    ) : (
                      <select
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={row.category}
                        onChange={(e) =>
                          patch(row.id, { category: e.target.value as AccessoryCategory })
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      row.unit
                    ) : (
                      <select
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={row.unit}
                        onChange={(e) =>
                          patch(row.id, { unit: e.target.value as AccessoryCatalogUnit })
                        }
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {readOnly ? (
                      formatCatalogRate(row.material_rate)
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="h-8 tabular-nums text-right"
                        value={row.material_rate === 0 ? '0' : String(row.material_rate)}
                        onChange={(e) =>
                          patch(row.id, { material_rate: parseCatalogRate(e.target.value) })
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {readOnly ? (
                      row.sqft_per_unit > 0 ? row.sqft_per_unit.toLocaleString() : '—'
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="h-8 tabular-nums text-right"
                        value={String(row.sqft_per_unit)}
                        onChange={(e) =>
                          patch(row.id, { sqft_per_unit: parseCatalogRate(e.target.value) })
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      (row.notes ?? '—')
                    ) : (
                      <Input
                        className="h-8"
                        value={row.notes ?? ''}
                        placeholder="Optional"
                        onChange={(e) => patch(row.id, { notes: e.target.value })}
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeRow(row.id)}
                        aria-label="Delete accessory"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
