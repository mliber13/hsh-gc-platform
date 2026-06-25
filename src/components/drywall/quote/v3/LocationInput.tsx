import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const LOCATION_COLUMN_TOOLTIP =
  'Used for visual grouping within each trade section. Lines with the same location cluster together. Free-text — use whatever matches the GC\'s budget breakout.'

export const LOCATION_INPUT_PLACEHOLDER = 'e.g. 1st Floor, Master Bedroom…'

type Props = {
  value: string
  readOnly: boolean
  compact?: boolean
  onChange: (value: string) => void
}

/** Always-visible location input — selects all on focus for easy replacement. */
export function LocationInput({ value, readOnly, compact, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  if (readOnly) {
    return (
      <span
        className="block truncate text-xs"
        title={value || undefined}
      >
        {value || '—'}
      </span>
    )
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      value={value}
      placeholder={LOCATION_INPUT_PLACEHOLDER}
      title={value ? value : LOCATION_INPUT_PLACEHOLDER}
      className={cn(
        'h-7 w-full min-w-0 text-xs',
        compact && 'text-[11px]',
      )}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function normalizeLocationLabel(location: string | undefined): string {
  const trimmed = location?.trim()
  return trimmed || 'Unassigned'
}

/** Last location on a line of the given type (for inherit-on-add). */
export function lastLocationForLineType(
  lines: { type: string; location?: string }[],
  type: string,
): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].type === type) return lines[i].location ?? ''
  }
  return ''
}
