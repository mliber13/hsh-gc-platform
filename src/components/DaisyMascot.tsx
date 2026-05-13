import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

export type DaisyPose =
  | 'sitting'
  | 'curious'
  | 'sleeping'
  | 'confused'
  | 'success'

interface DaisyMascotProps {
  pose: DaisyPose
  /**
   * sm = 80px (inline accents)
   * md = 140px (empty states)
   * lg = 220px (404 / splash)
   */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Daisy — HSH's Head of Happiness — as a mascot for empty states and
 * accents while the Daisy theme is active. Returns null in other themes
 * so existing fallbacks stay clean for light/dark users.
 */
export function DaisyMascot({ pose, size = 'md', className }: DaisyMascotProps) {
  const { theme } = useTheme()
  if (theme !== 'daisy') return null

  const px = size === 'sm' ? 80 : size === 'lg' ? 220 : 140

  return (
    <img
      src={`/daisy/daisy-${pose}.png`}
      alt={`Daisy — ${pose}`}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      className={cn('inline-block select-none', className)}
      draggable={false}
    />
  )
}
