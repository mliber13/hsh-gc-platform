import { ArrowDownUp, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AccessoryAppliedMap, FinishScopeCatalogEntry } from '@/types/drywallCatalogs'
import { formatCatalogRate, parseCatalogRate, useCatalogSearchSort } from './catalogShared'

const ACCESSORY_LABELS: { key: keyof AccessoryAppliedMap; label: string }[] = [
  { key: 'joint_compound', label: 'Compound' },
  { key: 'tape', label: 'Tape' },
  { key: 'screws', label: 'Screws' },
  { key: 'corner_bead', label: 'Corner bead' },
]

type Props = {
  items: FinishScopeCatalogEntry[]
  readOnly: boolean
  onChange: (items: FinishScopeCatalogEntry[]) => void
}

export function FinishScopesTab({ items, readOnly, onChange }: Props) {
  const { search, setSearch, sortAsc, setSortAsc, filtered } = useCatalogSearchSort(
    items,
    (s) => `${s.display_name} ${s.id} ${s.payroll_piece_key}`,
    (s) => s.display_name,
  )

  const patch = (id: string, patch: Partial<FinishScopeCatalogEntry>) => {
    onChange(items.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const patchAccessory = (id: string, key: keyof AccessoryAppliedMap, value: boolean) => {
    const row = items.find((s) => s.id === id)
    if (!row) return
    patch(id, {
      accessories_applied: { ...row.accessories_applied, [key]: value },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish scope catalog</CardTitle>
        <CardDescription>
          Finisher rates and accessory defaults per finish scope. Payroll piece key matches scope id.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search finish scopes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setSortAsc((v) => !v)}>
            <ArrowDownUp className="mr-2 h-4 w-4" />
            Sort {sortAsc ? 'A–Z' : 'Z–A'}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium w-[130px]">Finisher $/sqft</th>
                <th className="px-4 py-3 font-medium">Accessories</th>
                <th className="px-4 py-3 font-medium w-[140px]">Payroll key</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((scope) => (
                <tr key={scope.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{scope.display_name}</div>
                    <div className="text-muted-foreground text-xs">{scope.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      formatCatalogRate(scope.finisher_rate)
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="h-8 tabular-nums"
                        value={scope.finisher_rate === 0 ? '0' : String(scope.finisher_rate)}
                        onChange={(e) =>
                          patch(scope.id, { finisher_rate: parseCatalogRate(e.target.value) })
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      {ACCESSORY_LABELS.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input"
                            checked={scope.accessories_applied[key]}
                            disabled={readOnly}
                            onChange={(e) => patchAccessory(scope.id, key, e.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{scope.payroll_piece_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
