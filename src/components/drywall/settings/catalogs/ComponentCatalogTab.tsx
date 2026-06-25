import type { ReactNode } from 'react'
import { ArrowDownUp, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCatalogSearchSort } from './catalogShared'

type Column<T> = {
  key: string
  header: string
  cell: (item: T) => ReactNode
  className?: string
}

type Props<T extends { id: string; display_name: string }> = {
  title: string
  description: string
  emptyMessage: string
  items: T[]
  readOnly: boolean
  columns: Column<T>[]
  searchText: (item: T) => string
  onChange: (items: T[]) => void
  onAdd: () => void
  onEdit: (item: T) => void
}

export function ComponentCatalogTab<T extends { id: string; display_name: string }>({
  title,
  description,
  emptyMessage,
  items,
  readOnly,
  columns,
  searchText,
  onChange,
  onAdd,
  onEdit,
}: Props<T>) {
  const { search, setSearch, sortAsc, setSortAsc, filtered } = useCatalogSearchSort(
    items,
    searchText,
    (item) => item.display_name,
  )

  const confirmDelete = (item: T) => {
    if (
      !window.confirm(
        `Remove "${item.display_name}" from the catalog? Save to persist this change.`,
      )
    ) {
      return
    }
    onChange(items.filter((i) => i.id !== item.id))
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {!readOnly && (
          <Button onClick={onAdd} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add entry
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setSortAsc((v) => !v)}>
            <ArrowDownUp className="mr-2 h-4 w-4" />
            Sort {sortAsc ? 'A–Z' : 'Z–A'}
          </Button>
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
            {items.length === 0 ? emptyMessage : 'No entries match your search.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  {columns.map((col) => (
                    <th key={col.key} className={`px-4 py-3 font-medium ${col.className ?? ''}`}>
                      {col.header}
                    </th>
                  ))}
                  {!readOnly && (
                    <th className="px-4 py-3 text-right font-medium w-[100px]">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                        {col.cell(item)}
                      </td>
                    ))}
                    {!readOnly && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDelete(item)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
