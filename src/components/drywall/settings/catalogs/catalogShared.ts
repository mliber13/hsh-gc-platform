import { useMemo, useState } from 'react'

export function useCatalogSearchSort<T>(
  items: T[],
  getSearchText: (item: T) => string,
  getSortKey: (item: T) => string,
) {
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(true)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...items]
    if (q) {
      list = list.filter((item) => getSearchText(item).toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      const cmp = getSortKey(a).localeCompare(getSortKey(b))
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [items, search, sortAsc, getSearchText, getSortKey])

  return { search, setSearch, sortAsc, setSortAsc, filtered }
}

export function formatCatalogRate(n: number): string {
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

export function parseCatalogRate(raw: string): number {
  const n = parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
