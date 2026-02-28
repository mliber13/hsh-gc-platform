// ============================================================================
// Trade categories: DB-backed list with fallback to code constants
// ============================================================================

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { getTradeCategories } from '@/services/tradeCategoryService'
import { TRADE_CATEGORIES } from '@/types/constants'
import type { TradeCategoryRecord } from '@/types/tradeCategory'

interface TradeCategoriesContextType {
  categories: TradeCategoryRecord[]
  byKey: Record<string, { label: string; icon: string }>
  loading: boolean
  refetch: () => Promise<void>
}

const TradeCategoriesContext = createContext<TradeCategoriesContextType | undefined>(undefined)

function buildByKey(categories: TradeCategoryRecord[]): Record<string, { label: string; icon: string }> {
  const out: Record<string, { label: string; icon: string }> = {}
  for (const c of categories) {
    out[c.key] = { label: c.label, icon: c.icon }
  }
  return out
}

const fallbackByKey = buildByKey(
  (Object.entries(TRADE_CATEGORIES) as [string, { label: string; icon: string }][]).map(([key, v], i) => ({
    id: `fallback-${key}`,
    key,
    label: v.label,
    icon: v.icon,
    sortOrder: i + 1,
    isSystem: true,
  }))
)

export function TradeCategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<TradeCategoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const list = await getTradeCategories()
      setCategories(list)
    } catch (e) {
      console.error('Failed to load trade categories:', e)
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const byKey = useMemo(() => {
    if (categories.length === 0) return fallbackByKey
    return buildByKey(categories)
  }, [categories])

  const value = useMemo(
    () => ({
      categories: categories.length > 0 ? categories : (Object.entries(TRADE_CATEGORIES).map(([key, v], i) => ({
        id: `fallback-${key}`,
        key,
        label: v.label,
        icon: v.icon,
        sortOrder: i + 1,
        isSystem: true,
      })) as TradeCategoryRecord[]),
      byKey,
      loading,
      refetch: fetchCategories,
    }),
    [categories, byKey, loading]
  )

  return (
    <TradeCategoriesContext.Provider value={value}>
      {children}
    </TradeCategoriesContext.Provider>
  )
}

export function useTradeCategories(): TradeCategoriesContextType {
  const ctx = useContext(TradeCategoriesContext)
  if (ctx === undefined) {
    throw new Error('useTradeCategories must be used within TradeCategoriesProvider')
  }
  return ctx
}
