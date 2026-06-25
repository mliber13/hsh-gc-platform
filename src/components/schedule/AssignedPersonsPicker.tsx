// ============================================================================
// Assigned persons multi-select — org_team members on schedule items (D.6.2)
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fetchTeam } from '@/services/hrTeamService'
import { isArchivedMember } from '@/lib/hrTeamUtils'
import { cn } from '@/lib/utils'

export interface AssignedPersonOption {
  id: string
  name: string
  kind: 'employee' | 'contractor'
  email?: string | null
}

interface AssignedPersonsPickerProps {
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  label?: string
}

export function AssignedPersonsPicker({
  value,
  onChange,
  disabled,
  label = 'Assigned persons',
}: AssignedPersonsPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<AssignedPersonOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTeam()
      .then((team) => {
        if (cancelled) return
        const people: AssignedPersonOption[] = [
          ...team.employees
            .filter((e) => !isArchivedMember(e))
            .map((e) => ({
              id: e.id,
              name: e.name,
              kind: 'employee' as const,
              email: e.email,
            })),
          ...team.contractors1099
            .filter((c) => !isArchivedMember(c))
            .map((c) => ({
              id: c.id,
              name: c.name,
              kind: 'contractor' as const,
              email: c.email,
            })),
        ].sort((a, b) => a.name.localeCompare(b.name))
        setOptions(people)
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.email?.toLowerCase().includes(q) ?? false),
    )
  }, [options, search])

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  const remove = (id: string) => onChange(value.filter((v) => v !== id))

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled || loading}
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-muted-foreground">
              {loading
                ? 'Loading team…'
                : value.length === 0
                  ? 'Select crew members'
                  : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,24rem)] p-0" align="start">
          <div className="border-b p-2">
            <Input
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                No team members match.
              </p>
            ) : (
              filtered.map((person) => {
                const selected = value.includes(person.id)
                return (
                  <button
                    key={person.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
                      selected && 'bg-muted/60',
                    )}
                    onClick={() => toggle(person.id)}
                  >
                    <Check
                      className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{person.name}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                        person.kind === 'employee'
                          ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                          : 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
                      )}
                    >
                      {person.kind === 'employee' ? 'W2' : '1099'}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const person = optionById.get(id)
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
              >
                <span className="max-w-[10rem] truncate">{person?.name ?? id}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={() => remove(id)}
                    aria-label={`Remove ${person?.name ?? id}`}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
