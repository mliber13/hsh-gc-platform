import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Contractor1099, Employee, JobPosition, MemberStatus } from '@/types/hr'
import { formatPayType, generateHrId, normalizeMemberStatus } from '@/lib/hrTeamUtils'

export type MemberKind = 'employee' | 'contractor'

type MemberFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: MemberKind
  member: Employee | Contractor1099 | null
  positions: JobPosition[]
  readOnly: boolean
  onSave: (member: Employee | Contractor1099) => void
}

type FormState = {
  name: string
  company: string
  phone: string
  email: string
  startDate: string
  positionId: string
  payType: string
  hourlyRate: string
  salaryAmount: string
  status: MemberStatus
}

function emptyForm(): FormState {
  return {
    name: '',
    company: '',
    phone: '',
    email: '',
    startDate: '',
    positionId: '',
    payType: 'hourly',
    hourlyRate: '',
    salaryAmount: '',
    status: 'active',
  }
}

function memberToForm(
  member: Employee | Contractor1099 | null,
  kind: MemberKind,
): FormState {
  if (!member) return emptyForm()
  const normalized = normalizeMemberStatus(member)
  return {
    name: member.name ?? '',
    company: kind === 'contractor' ? (member as Contractor1099).company ?? '' : '',
    phone: member.phone ?? '',
    email: member.email ?? '',
    startDate: member.startDate ?? '',
    positionId: member.positionId ?? '',
    payType: formatPayType(member.payType),
    hourlyRate: member.hourlyRate != null ? String(member.hourlyRate) : '',
    salaryAmount: member.salaryAmount != null ? String(member.salaryAmount) : '',
    status: normalized.status,
  }
}

export function MemberFormDialog({
  open,
  onOpenChange,
  kind,
  member,
  positions,
  readOnly,
  onSave,
}: MemberFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => memberToForm(member, kind))

  useEffect(() => {
    if (open) setForm(memberToForm(member, kind))
  }, [open, member, kind])

  const title =
    kind === 'employee'
      ? member
        ? 'Edit employee'
        : 'Add employee'
      : member
        ? 'Edit contractor'
        : 'Add contractor'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    const name = form.name.trim()
    if (!name) return

    const base: Employee | Contractor1099 = {
      ...(member ?? { id: generateHrId() }),
      id: member?.id ?? generateHrId(),
      name,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      startDate: form.startDate || null,
      positionId: form.positionId || null,
      payType: formatPayType(form.payType),
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
      salaryAmount: form.salaryAmount ? Number(form.salaryAmount) : null,
      status: form.status,
      toolRepayments: member?.toolRepayments ?? [],
      ownersDraw: member?.ownersDraw ?? null,
      gasAllowance: member?.gasAllowance ?? null,
      bankedHours: member?.bankedHours ?? null,
      pieceRate: member?.pieceRate ?? null,
    }

    if (kind === 'contractor') {
      ;(base as Contractor1099).company = form.company.trim() || null
    }

    onSave(normalizeMemberStatus(base))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="member-name">Name *</Label>
              <Input
                id="member-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={readOnly}
                required
              />
            </div>

            {kind === 'contractor' && (
              <div className="grid gap-2">
                <Label htmlFor="member-company">Company</Label>
                <Input
                  id="member-company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  disabled={readOnly}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="member-phone">Phone</Label>
                <Input
                  id="member-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={readOnly}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="member-start">Start date</Label>
                <Input
                  id="member-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label>Position</Label>
                <Select
                  value={form.positionId || '_none'}
                  onValueChange={(v) =>
                    setForm({ ...form, positionId: v === '_none' ? '' : v })
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    {positions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Pay setup (for payroll — not shown on list cards)
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Pay type</Label>
                  <Select
                    value={form.payType}
                    onValueChange={(v) => setForm({ ...form, payType: v })}
                    disabled={readOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm({ ...form, status: v as MemberStatus })
                    }
                    disabled={readOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.payType === 'hourly' ? (
                <div className="grid gap-2">
                  <Label htmlFor="member-hourly">Hourly rate ($)</Label>
                  <Input
                    id="member-hourly"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.hourlyRate}
                    onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="member-salary">Salary amount ($)</Label>
                  <Input
                    id="member-salary"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.salaryAmount}
                    onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {!readOnly && <Button type="submit">Save</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
