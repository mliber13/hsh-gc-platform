import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function NumField({
  label,
  value,
  onChange,
  readOnly,
  step = '0.01',
  placeholder,
  hint,
}: {
  label: string
  value: string | number | undefined
  onChange: (v: string) => void
  readOnly: boolean
  step?: string
  placeholder?: string
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        disabled={readOnly}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function SpacingSelect({
  label,
  value,
  onChange,
  readOnly,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly: boolean
  options: readonly { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select disabled={readOnly} value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function DetailsSubsection({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2" open={defaultOpen}>
      <summary className="cursor-pointer select-none text-xs font-medium text-foreground">
        {title}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  )
}

export function SectionDivider({ title }: { title: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
      {title}
    </p>
  )
}
