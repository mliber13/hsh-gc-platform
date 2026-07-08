import { useMemo, useState } from 'react'
import { Archive, Eye, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Contractor1099, Employee, JobPosition } from '@/types/hr'
import { getPositionName, isArchivedMember } from '@/lib/hrTeamUtils'
import { divisionLabel } from '@/lib/divisions'
import { formatCurrency } from '@/components/hr/payroll/payrollFormat'
import type { MemberKind } from './MemberFormDialog'

type MembersTabProps = {
  kind: MemberKind
  title: string
  description: string
  members: Employee[] | Contractor1099[]
  positions: JobPosition[]
  readOnly: boolean
  onAdd: () => void
  onEdit: (member: Employee | Contractor1099) => void
  onArchive: (id: string) => void
  onRestore: (id: string) => void
  onRemove: (id: string) => void
}

export function MembersTab({
  kind,
  title,
  description,
  members,
  positions,
  readOnly,
  onAdd,
  onEdit,
  onArchive,
  onRestore,
  onRemove,
}: MembersTabProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [positionFilter, setPositionFilter] = useState('all')

  const filtered = useMemo(() => {
    let list = [...members]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((m) => {
        const name = (m.name ?? '').toLowerCase()
        const email = (m.email ?? '').toLowerCase()
        const phone = (m.phone ?? '').toLowerCase()
        const company =
          kind === 'contractor'
            ? ((m as Contractor1099).company ?? '').toLowerCase()
            : ''
        return (
          name.includes(q) ||
          email.includes(q) ||
          phone.includes(q) ||
          company.includes(q)
        )
      })
    }
    if (positionFilter !== 'all') {
      list = list.filter((m) => m.positionId === positionFilter)
    }
    if (statusFilter === 'active') {
      list = list.filter((m) => !isArchivedMember(m))
    } else if (statusFilter === 'archived') {
      list = list.filter((m) => isArchivedMember(m))
    }
    list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    return list
  }, [members, search, statusFilter, positionFilter, kind])

  const divisionSummary = (member: Employee | Contractor1099): string => {
    const allocations = (member.divisionAllocations ?? [])
      .filter((a) => (Number(a.pct) || 0) > 0 && a.division)
      .sort((a, b) => (Number(b.pct) || 0) - (Number(a.pct) || 0))
    if (allocations.length === 0) return ''
    return allocations
      .map((a) => `${divisionLabel(a.division)} ${Number(a.pct)}%`)
      .join(' · ')
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {!readOnly && (
          <Button onClick={onAdd} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Add {kind === 'employee' ? 'employee' : 'contractor'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All positions</SelectItem>
              {positions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center text-muted-foreground">
            <UserPlus className="mb-2 h-10 w-10 opacity-40" />
            <p className="text-sm">No {kind === 'employee' ? 'employees' : 'contractors'} match your filters.</p>
            {!readOnly && statusFilter === 'active' && (
              <Button variant="link" className="mt-2" onClick={onAdd}>
                Add someone
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Name</th>
                  {kind === 'contractor' && (
                    <th className="px-4 py-3 font-medium">Company</th>
                  )}
                  <th className="px-4 py-3 font-medium">Position</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium text-right">Fuel / wk</th>
                  <th className="px-4 py-3 font-medium text-right">Banked hrs</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const archived = isArchivedMember(m)
                  const fuelPerWeek = parseFloat(String(m.gasAllowance)) || 0
                  const bankedHours = parseFloat(String(m.bankedHours)) || 0
                  const divisions = divisionSummary(m)
                  return (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <div>{m.name}</div>
                        {divisions ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            {divisions}
                          </div>
                        ) : null}
                      </td>
                      {kind === 'contractor' && (
                        <td className="px-4 py-3 text-muted-foreground">
                          {(m as Contractor1099).company || '—'}
                        </td>
                      )}
                      <td className="px-4 py-3">{getPositionName(positions, m.positionId)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.phone || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.email || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {fuelPerWeek > 0 ? formatCurrency(fuelPerWeek) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {bankedHours.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            archived
                              ? 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                              : 'inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300'
                          }
                        >
                          {archived ? 'Archived' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(m)}
                            title={readOnly ? 'View' : 'Edit'}
                          >
                            {readOnly ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <Pencil className="h-4 w-4" />
                            )}
                          </Button>
                          {!readOnly && (
                            <>
                              {archived ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onRestore(m.id)}
                                  title="Restore"
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onArchive(m.id)}
                                  title="Archive"
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => onRemove(m.id)}
                                title="Remove from roster"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
