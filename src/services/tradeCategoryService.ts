// ============================================================================
// Trade category service: DB when online, code fallback when offline
// ============================================================================

import { isOnlineMode } from '@/lib/supabase'
import { getCurrentUserProfile } from './userService'
import {
  fetchTradeCategoriesInDB,
  createTradeCategoryInDB,
  updateTradeCategoryInDB,
  deleteTradeCategoryFromDB,
} from './supabaseService'
import { TRADE_CATEGORIES } from '@/types/constants'
import type { TradeCategoryRecord, TradeCategoryInput } from '@/types/tradeCategory'
import type { TradeCategory } from '@/types/constants'

const SYSTEM_ORDER: TradeCategory[] = [
  'planning', 'site-prep', 'excavation-foundation', 'utilities', 'water-sewer',
  'rough-framing', 'windows-doors', 'exterior-finishes', 'roofing', 'masonry-paving',
  'porches-decks', 'insulation', 'plumbing', 'electrical', 'hvac', 'drywall',
  'interior-finishes', 'kitchen', 'bath', 'appliances', 'other',
]

function fallbackFromCode(): TradeCategoryRecord[] {
  return SYSTEM_ORDER.map((key, i) => ({
    id: `system-${key}`,
    key,
    label: TRADE_CATEGORIES[key]?.label ?? key,
    icon: TRADE_CATEGORIES[key]?.icon ?? '📦',
    sortOrder: i + 1,
    isSystem: true,
  }))
}

export async function getTradeCategories(): Promise<TradeCategoryRecord[]> {
  if (!isOnlineMode()) return fallbackFromCode()
  const profile = await getCurrentUserProfile()
  const organizationId = profile?.organization_id ?? 'default-org'
  const rows = await fetchTradeCategoriesInDB(organizationId)
  if (rows.length === 0) return fallbackFromCode()
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    icon: r.icon,
    sortOrder: r.sort_order,
    isSystem: r.is_system,
  }))
}

export async function createTradeCategory(input: TradeCategoryInput): Promise<TradeCategoryRecord | null> {
  const profile = await getCurrentUserProfile()
  const organizationId = profile?.organization_id ?? 'default-org'
  if (!isOnlineMode()) return null
  const created = await createTradeCategoryInDB(organizationId, {
    key: input.key,
    label: input.label,
    icon: input.icon,
    sortOrder: input.sortOrder,
  })
  return created
    ? {
        id: created.id,
        key: created.key,
        label: created.label,
        icon: created.icon,
        sortOrder: created.sortOrder,
        isSystem: created.isSystem,
      }
    : null
}

export async function updateTradeCategory(
  id: string,
  updates: { label?: string; icon?: string; sortOrder?: number }
): Promise<boolean> {
  return updateTradeCategoryInDB(id, updates)
}

export async function deleteTradeCategory(id: string): Promise<boolean> {
  return deleteTradeCategoryFromDB(id)
}
