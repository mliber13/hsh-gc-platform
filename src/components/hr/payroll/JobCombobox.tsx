import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import type { PayrollProjectOption } from '@/types/payroll'

export interface JobSelection {
  jobId: string
  jobName: string
}

interface JobComboboxProps {
  jobId?: string
  jobName?: string
  projects: PayrollProjectOption[]
  disabled?: boolean
  placeholder?: string
  className?: string
  onChange: (selection: JobSelection) => void
}

function resolveDisplayLabel(
  jobId: string | undefined,
  jobName: string | undefined,
  projects: PayrollProjectOption[],
): string {
  const id = String(jobId || '').trim()
  if (id && id !== 'other') {
    const project = projects.find((p) => p.id === id)
    if (project) return project.name
    if (jobName) return jobName
  }
  if (id === 'other' || jobName) {
    return String(jobName || '').trim()
  }
  return ''
}

function findExactProject(
  query: string,
  projects: PayrollProjectOption[],
): PayrollProjectOption | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return projects.find((p) => p.name.trim().toLowerCase() === q)
}

export function JobCombobox({
  jobId,
  jobName,
  projects,
  disabled,
  placeholder = 'Job',
  className,
  onChange,
}: JobComboboxProps) {
  const displayLabel = useMemo(
    () => resolveDisplayLabel(jobId, jobName, projects),
    [jobId, jobName, projects],
  )

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(displayLabel)

  useEffect(() => {
    if (!open) setSearch(displayLabel)
  }, [displayLabel, open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, search])

  const exactMatch = findExactProject(search, projects)
  const trimmed = search.trim()
  const showCustomOption =
    trimmed.length > 0 && (!exactMatch || exactMatch.name.trim() !== trimmed)

  const commitProject = (project: PayrollProjectOption) => {
    onChange({ jobId: project.id, jobName: project.name })
    setOpen(false)
  }

  const commitCustom = (name: string) => {
    const value = name.trim()
    if (!value) {
      onChange({ jobId: '', jobName: '' })
    } else {
      onChange({ jobId: 'other', jobName: value })
    }
    setOpen(false)
  }

  const commitFromSearch = () => {
    const exact = findExactProject(search, projects)
    if (exact) commitProject(exact)
    else commitCustom(search)
  }

  const selectedProjectId =
    jobId && jobId !== 'other' && jobId !== '' ? jobId : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn('relative min-w-0', className)}>
          <Input
            disabled={disabled}
            placeholder={placeholder}
            value={search}
            className="pr-8"
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
            onFocus={() => {
              setSearch(displayLabel)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitFromSearch()
              }
              if (e.key === 'Escape') {
                setOpen(false)
                setSearch(displayLabel)
              }
            }}
          />
          <ChevronsUpDown
            className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] border-border bg-popover p-1 text-popover-foreground"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 && !trimmed && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Type to search projects
            </p>
          )}
          {filtered.map((project) => (
            <button
              key={project.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted',
                selectedProjectId === project.id && 'bg-muted/80',
              )}
              onClick={() => commitProject(project)}
            >
              <Check
                className={cn(
                  'size-4 shrink-0',
                  selectedProjectId === project.id ? 'opacity-100' : 'opacity-0',
                )}
              />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
          {showCustomOption && (
            <button
              type="button"
              className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-muted"
              onClick={() => commitCustom(search)}
            >
              Use &ldquo;{trimmed}&rdquo; as custom name
            </button>
          )}
        </div>
        {trimmed && (
          <button
            type="button"
            className="mt-1 w-full border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              onChange({ jobId: '', jobName: '' })
              setSearch('')
              setOpen(false)
            }}
          >
            Clear job
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
