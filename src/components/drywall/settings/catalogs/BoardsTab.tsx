import { ArrowDownUp, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { BoardCatalogEntry } from '@/types/drywallCatalogs'
import { formatCatalogRate, parseCatalogRate, useCatalogSearchSort } from './catalogShared'

type Props = {
  items: BoardCatalogEntry[]
  readOnly: boolean
  onChange: (items: BoardCatalogEntry[]) => void
}

export function BoardsTab({ items, readOnly, onChange }: Props) {
  const { search, setSearch, sortAsc, setSortAsc, filtered } = useCatalogSearchSort(
    items,
    (b) => `${b.display_name} ${b.id}`,
    (b) => b.display_name,
  )

  const patch = (id: string, patch: Partial<BoardCatalogEntry>) => {
    onChange(items.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Board catalog</CardTitle>
        <CardDescription>
          Material and hanger labor rates per sqft plus default waste % for each board type. Seeded
          entries are locked by id; edit rates inline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search boards…"
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
                <th className="px-4 py-3 font-medium">Board</th>
                <th className="px-4 py-3 font-medium w-[132px] text-right">Material $/sqft</th>
                <th className="px-4 py-3 font-medium w-[132px] text-right">Hanger rate ($/sqft)</th>
                <th className="px-4 py-3 font-medium w-[120px]">Waste %</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((board) => (
                <tr key={board.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{board.display_name}</div>
                    <div className="text-muted-foreground text-xs">{board.id}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {readOnly ? (
                      formatCatalogRate(board.material_rate)
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="h-8 tabular-nums text-right"
                        value={board.material_rate === 0 ? '0' : String(board.material_rate)}
                        onChange={(e) =>
                          patch(board.id, { material_rate: parseCatalogRate(e.target.value) })
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {readOnly ? (
                      formatCatalogRate(board.hanger_rate)
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="h-8 tabular-nums text-right"
                        value={board.hanger_rate === 0 ? '0' : String(board.hanger_rate)}
                        onChange={(e) =>
                          patch(board.id, { hanger_rate: parseCatalogRate(e.target.value) })
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      `${board.default_waste_pct}%`
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="h-8 tabular-nums"
                        value={String(board.default_waste_pct)}
                        onChange={(e) =>
                          patch(board.id, {
                            default_waste_pct: parseCatalogRate(e.target.value),
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      (board.notes ?? '—')
                    ) : (
                      <Input
                        className="h-8"
                        value={board.notes ?? ''}
                        onChange={(e) => patch(board.id, { notes: e.target.value })}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
