// ============================================================================
// Trade category icon: Lucide-based picker + render (with emoji fallback)
// ============================================================================

import React from 'react'
import {
  LayoutGrid,
  Paintbrush,
  Lightbulb,
  Home,
  Plug,
  Package,
  ClipboardList,
  DoorOpen,
  Droplets,
  Zap,
  Hammer,
  Wrench,
  HardHat,
  Construction,
  Box,
  Bath,
  Snowflake,
  UtensilsCrossed,
  TreePine,
  Square,
  MoveVertical,
  Palette,
  Boxes,
  type LucideIcon,
} from 'lucide-react'

/** Icon id (Lucide name) and label for the picker. Stored in DB; legacy emoji strings still render. */
export const TRADE_CATEGORY_ICON_OPTIONS: { id: string; label: string }[] = [
  { id: 'LayoutGrid', label: 'Flooring' },
  { id: 'Paintbrush', label: 'Paint' },
  { id: 'Lightbulb', label: 'Light fixtures' },
  { id: 'Home', label: 'Porch / exterior' },
  { id: 'Plug', label: 'Electrical' },
  { id: 'Droplets', label: 'Plumbing' },
  { id: 'Hammer', label: 'Framing' },
  { id: 'Wrench', label: 'Mechanical' },
  { id: 'DoorOpen', label: 'Doors' },
  { id: 'Square', label: 'Windows' },
  { id: 'Bath', label: 'Bath' },
  { id: 'Snowflake', label: 'HVAC' },
  { id: 'UtensilsCrossed', label: 'Kitchen' },
  { id: 'Construction', label: 'Construction' },
  { id: 'HardHat', label: 'Site work' },
  { id: 'MoveVertical', label: 'Ladder / access' },
  { id: 'Package', label: 'General' },
  { id: 'ClipboardList', label: 'Admin' },
  { id: 'Box', label: 'Materials' },
  { id: 'Boxes', label: 'Storage' },
  { id: 'TreePine', label: 'Landscape' },
  { id: 'Palette', label: 'Finish' },
]

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  Paintbrush,
  Lightbulb,
  Home,
  Plug,
  Package,
  ClipboardList,
  DoorOpen,
  Droplets,
  Zap,
  Hammer,
  Wrench,
  HardHat,
  Construction,
  Box,
  Bath,
  Snowflake,
  UtensilsCrossed,
  TreePine,
  Square,
  MoveVertical,
  Palette,
  Boxes,
}

export const TRADE_CATEGORY_DEFAULT_ICON = 'Package'

/** Renders a trade category icon. Uses Lucide if icon is a known id; otherwise renders string (emoji) for legacy data. */
export function TradeCategoryIcon({
  icon,
  className,
  size = 18,
}: {
  icon: string
  className?: string
  size?: number
}) {
  const IconComponent = icon ? ICON_MAP[icon] : ICON_MAP[TRADE_CATEGORY_DEFAULT_ICON]
  if (IconComponent) {
    return <IconComponent className={className} size={size} strokeWidth={2} />
  }
  return (
    <span className={className} style={{ fontSize: size }}>
      {icon || '📦'}
    </span>
  )
}
