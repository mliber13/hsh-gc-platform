import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Strip commas and parse a non-negative quantity. */
export function parseQuantityInput(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim()
  if (cleaned === '') return 0
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function formatQuantityDisplay(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

type Props = {
  value: number
  unit: string
  readOnly: boolean
  compact?: boolean
  onChange: (quantity: number) => void
}

/**
 * Text input: formatted with commas when blurred; raw numeric string when focused.
 * Accepts comma-separated paste while editing.
 */
export function QuantityInput({ value, unit, readOnly, compact, onChange }: Props) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  if (readOnly) {
    return (
      <div className="flex items-center justify-end gap-1 text-xs tabular-nums">
        <span>{value === 0 ? '0' : formatQuantityDisplay(value)}</span>
        <span className="text-muted-foreground shrink-0 text-[10px]">{unit}</span>
      </div>
    )
  }

  const rawForEdit = value === 0 ? '' : String(value)

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="text"
        inputMode="decimal"
        value={focused ? draft : formatQuantityDisplay(value)}
        placeholder="0"
        className={cn(
          'h-7 min-w-0 flex-1 px-1.5 text-right text-xs tabular-nums',
          compact && 'text-[11px]',
        )}
        onFocus={(e) => {
          setDraft(rawForEdit)
          setFocused(true)
          requestAnimationFrame(() => e.target.select())
        }}
        onBlur={() => {
          onChange(parseQuantityInput(focused ? draft : rawForEdit))
          setFocused(false)
          setDraft('')
        }}
        onChange={(e) => {
          if (focused) setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <span className="text-muted-foreground shrink-0 whitespace-nowrap text-[10px]" title={unit}>
        {unit}
      </span>
    </div>
  )
}
