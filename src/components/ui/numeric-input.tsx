import * as React from 'react'
import { Input, type InputProps } from '@/components/ui/input'

/**
 * A number field that does not silently discard what was typed.
 *
 * `<input type="number">` rejects a thousands separator: entering "4,410.62"
 * puts the field in the browser's bad-input state, where the text stays visible
 * on screen but `e.target.value` reads as an empty string. The value is stored
 * as "", `parseFloat("") || 0` yields 0, and a priced line quietly becomes free
 * — which is exactly how a $4,410 quote adder shipped as $0.00.
 *
 * So this renders a text field with a decimal input mode (still a numeric
 * keypad on phones) and strips separators before handing the value up. The
 * consumer keeps receiving a plain numeric string, so `parseFloat` callers need
 * no change.
 */
export interface NumericInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  /** Receives a sanitized numeric string — never a value with separators. */
  onChange?: (event: { target: { value: string } }) => void
  /** Allow a leading minus. Off by default: quantities and money are positive here. */
  allowNegative?: boolean
}

/**
 * Keep only what can form a number. Commas and spaces are dropped rather than
 * rejected, so pasting a formatted figure works instead of erasing it.
 */
export function sanitizeNumericInput(raw: string, allowNegative = false): string {
  let out = raw.replace(/[,\s_]/g, '')
  // Strip anything that is not a digit, a dot, or a leading sign.
  out = out.replace(allowNegative ? /[^0-9.-]/g : /[^0-9.]/g, '')
  // Collapse repeated dots — keep the first.
  const firstDot = out.indexOf('.')
  if (firstDot !== -1) {
    out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, '')
  }
  if (allowNegative) {
    // A sign is only meaningful in front.
    const negative = out.startsWith('-')
    out = (negative ? '-' : '') + out.replace(/-/g, '')
  }
  return out
}

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ onChange, allowNegative = false, inputMode, ...props }, ref) => {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode={inputMode ?? 'decimal'}
        onChange={(e) => {
          const clean = sanitizeNumericInput(e.target.value, allowNegative)
          if (clean !== e.target.value) e.target.value = clean
          onChange?.({ target: { value: clean } })
        }}
      />
    )
  },
)
NumericInput.displayName = 'NumericInput'
