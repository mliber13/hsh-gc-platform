import type { LucideIcon } from 'lucide-react'
import {
  Box,
  Grid3x3,
  Hammer,
  Layers,
  Music2,
  PanelTop,
  Thermometer,
} from 'lucide-react'
import type { QuoteLineItemType } from '@/types/drywall'

export type TradeSectionTheme = {
  icon: LucideIcon
  borderClass: string
  headerClass: string
  subtotalRowClass: string
  locationSubtotalClass: string
}

export const TRADE_SECTION_THEMES: Record<QuoteLineItemType, TradeSectionTheme> = {
  drywall: {
    icon: Hammer,
    borderClass: 'border-l-sky-500',
    headerClass: 'bg-sky-500/10 text-sky-950 dark:text-sky-100',
    subtotalRowClass: 'bg-sky-500/8 border-t border-sky-500/20',
    locationSubtotalClass: 'bg-sky-500/5 border-t border-sky-500/15',
  },
  rc_channel: {
    icon: Layers,
    borderClass: 'border-l-amber-500',
    headerClass: 'bg-amber-500/10 text-amber-950 dark:text-amber-100',
    subtotalRowClass: 'bg-amber-500/8 border-t border-amber-500/20',
    locationSubtotalClass: 'bg-amber-500/5 border-t border-amber-500/15',
  },
  suspended_grid: {
    icon: Grid3x3,
    borderClass: 'border-l-violet-500',
    headerClass: 'bg-violet-500/10 text-violet-950 dark:text-violet-100',
    subtotalRowClass: 'bg-violet-500/8 border-t border-violet-500/20',
    locationSubtotalClass: 'bg-violet-500/5 border-t border-violet-500/15',
  },
  insulation: {
    icon: Thermometer,
    borderClass: 'border-l-emerald-500',
    headerClass: 'bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
    subtotalRowClass: 'bg-emerald-500/8 border-t border-emerald-500/20',
    locationSubtotalClass: 'bg-emerald-500/5 border-t border-emerald-500/15',
  },
  acoustic: {
    icon: Music2,
    borderClass: 'border-l-fuchsia-500',
    headerClass: 'bg-fuchsia-500/10 text-fuchsia-950 dark:text-fuchsia-100',
    subtotalRowClass: 'bg-fuchsia-500/8 border-t border-fuchsia-500/20',
    locationSubtotalClass: 'bg-fuchsia-500/5 border-t border-fuchsia-500/15',
  },
  metal_stud: {
    icon: Box,
    borderClass: 'border-l-orange-500',
    headerClass: 'bg-orange-500/10 text-orange-950 dark:text-orange-100',
    subtotalRowClass: 'bg-orange-500/8 border-t border-orange-500/20',
    locationSubtotalClass: 'bg-orange-500/5 border-t border-orange-500/15',
  },
  frp: {
    icon: PanelTop,
    borderClass: 'border-l-teal-500',
    headerClass: 'bg-teal-500/10 text-teal-950 dark:text-teal-100',
    subtotalRowClass: 'bg-teal-500/8 border-t border-teal-500/20',
    locationSubtotalClass: 'bg-teal-500/5 border-t border-teal-500/15',
  },
}
