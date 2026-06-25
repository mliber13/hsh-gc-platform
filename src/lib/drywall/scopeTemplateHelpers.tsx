import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function appendScopeTemplate(current: string, template: string): string {
  const trimmed = current.trim()
  if (!trimmed) return template
  const sep = trimmed.endsWith('.') || trimmed.endsWith(',') ? ' ' : ', '
  return trimmed + sep + template
}

function removeScopeTemplate(current: string, template: string): string {
  // Strip the template plus any surrounding separator (comma+space, period+space, leading/trailing).
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `(?:,\\s*)?\\b${escaped}\\b(?:\\s*,)?`,
    'g',
  )
  return current
    .replace(pattern, '')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .trim()
}

/** Legacy chip row — kept for v2 callers. New v3 code should use ScopeTemplatePopover. */
export function ScopeTemplateChips({
  templates,
  readOnly,
  onPick,
}: {
  templates: readonly string[]
  readOnly: boolean
  onPick: (template: string) => void
}) {
  if (readOnly) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {templates.map((template) => (
        <Button
          key={template}
          type="button"
          variant="outline"
          size="sm"
          title={template}
          className="h-7 max-w-full px-2 py-0 text-xs whitespace-normal"
          onClick={() => onPick(template)}
        >
          + {template.length > 35 ? `${template.slice(0, 32)}…` : template}
        </Button>
      ))}
    </div>
  )
}

/**
 * Popover-triggered multi-select for scope templates. Toggles each template in/out of the
 * current text string. Saves vertical space vs the chip-row pattern.
 */
export function ScopeTemplatePopover({
  templates,
  readOnly,
  currentText,
  onChange,
}: {
  templates: readonly string[]
  readOnly: boolean
  currentText: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (readOnly) return null

  const selectedCount = templates.filter((t) => currentText.includes(t)).length

  const toggle = (template: string) => {
    if (currentText.includes(template)) {
      onChange(removeScopeTemplate(currentText, template))
    } else {
      onChange(appendScopeTemplate(currentText, template))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 justify-between gap-2">
          <span>
            {selectedCount > 0 ? `${selectedCount} template${selectedCount === 1 ? '' : 's'}` : 'Add template'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-1" align="start">
        <div className="max-h-72 overflow-y-auto">
          {templates.map((template) => {
            const isSelected = currentText.includes(template)
            return (
              <button
                key={template}
                type="button"
                onClick={() => toggle(template)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
                  'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none',
                )}
              >
                <Check
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    isSelected ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="leading-snug">{template}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
