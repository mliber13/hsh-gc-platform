import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteHrTeam } from '@/routes/RequirePermission'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import type { Contractor1099, Employee, OrgTeamPayload } from '@/types/hr'
import { fetchTeam, HrTeamPermissionError, saveTeam } from '@/services/hrTeamService'
import { isArchivedMember, normalizeMemberStatus } from '@/lib/hrTeamUtils'
import { MembersTab } from './team/MembersTab'
import { PositionsTab } from './team/PositionsTab'
import { MemberFormDialog, type MemberKind } from './team/MemberFormDialog'

export function TeamPage() {
  usePageTitle('HR — Team')
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteHrTeam(effectiveRole)

  const [payload, setPayload] = useState<OrgTeamPayload | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogKind, setDialogKind] = useState<MemberKind>('employee')
  const [editingMember, setEditingMember] = useState<Employee | Contractor1099 | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTeam()
      setPayload(data)
      setSavedSnapshot(JSON.stringify(data))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load team')
      setPayload({ employees: [], contractors1099: [], positions: [] })
      setSavedSnapshot('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isDirty = useMemo(() => {
    if (!payload) return false
    return JSON.stringify(payload) !== savedSnapshot
  }, [payload, savedSnapshot])

  const openAdd = (kind: MemberKind) => {
    setDialogKind(kind)
    setEditingMember(null)
    setDialogOpen(true)
  }

  const openEdit = (kind: MemberKind, member: Employee | Contractor1099) => {
    setDialogKind(kind)
    setEditingMember(member)
    setDialogOpen(true)
  }

  const handleMemberSave = (member: Employee | Contractor1099) => {
    if (!payload) return
    if (dialogKind === 'employee') {
      const exists = payload.employees.some((e) => e.id === member.id)
      setPayload({
        ...payload,
        employees: exists
          ? payload.employees.map((e) => (e.id === member.id ? (member as Employee) : e))
          : [...payload.employees, member as Employee],
      })
    } else {
      const exists = payload.contractors1099.some((c) => c.id === member.id)
      setPayload({
        ...payload,
        contractors1099: exists
          ? payload.contractors1099.map((c) =>
              c.id === member.id ? (member as Contractor1099) : c,
            )
          : [...payload.contractors1099, member as Contractor1099],
      })
    }
  }

  const updateEmployees = (updater: (list: Employee[]) => Employee[]) => {
    if (!payload) return
    setPayload({ ...payload, employees: updater(payload.employees) })
  }

  const updateContractors = (updater: (list: Contractor1099[]) => Contractor1099[]) => {
    if (!payload) return
    setPayload({ ...payload, contractors1099: updater(payload.contractors1099) })
  }

  const handleSave = async () => {
    if (!payload || readOnly) return
    setSaving(true)
    try {
      await saveTeam(payload)
      setSavedSnapshot(JSON.stringify(payload))
      toast.success('Team saved')
    } catch (e: unknown) {
      if (e instanceof HrTeamPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to save team')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !payload) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Team
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            W2 employees, 1099 contractors, and job positions for your organization.
            {readOnly && (
              <span className="block mt-1 text-amber-700 dark:text-amber-300">
                Read-only — you can view the roster but cannot save changes.
              </span>
            )}
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => void load()} disabled={saving}>
              Reload
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
              {saving ? 'Saving…' : isDirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees">
            Employees ({payload.employees.filter((e) => !isArchivedMember(e)).length})
          </TabsTrigger>
          <TabsTrigger value="contractors">
            Contractors ({payload.contractors1099.filter((c) => !isArchivedMember(c)).length})
          </TabsTrigger>
          <TabsTrigger value="positions">Positions ({payload.positions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <MembersTab
            kind="employee"
            title="W2 employees"
            description="Hourly and salaried staff on payroll."
            members={payload.employees}
            positions={payload.positions}
            readOnly={readOnly}
            onAdd={() => openAdd('employee')}
            onEdit={(m) => openEdit('employee', m)}
            onArchive={(id) =>
              updateEmployees((list) =>
                list.map((e) =>
                  e.id === id ? normalizeMemberStatus({ ...e, status: 'archived' }) : e,
                ),
              )
            }
            onRestore={(id) =>
              updateEmployees((list) =>
                list.map((e) =>
                  e.id === id ? normalizeMemberStatus({ ...e, status: 'active' }) : e,
                ),
              )
            }
            onRemove={(id) => updateEmployees((list) => list.filter((e) => e.id !== id))}
          />
        </TabsContent>

        <TabsContent value="contractors">
          <MembersTab
            kind="contractor"
            title="1099 contractors"
            description="Subcontractors and 1099 crew."
            members={payload.contractors1099}
            positions={payload.positions}
            readOnly={readOnly}
            onAdd={() => openAdd('contractor')}
            onEdit={(m) => openEdit('contractor', m)}
            onArchive={(id) =>
              updateContractors((list) =>
                list.map((c) =>
                  c.id === id ? normalizeMemberStatus({ ...c, status: 'archived' }) : c,
                ),
              )
            }
            onRestore={(id) =>
              updateContractors((list) =>
                list.map((c) =>
                  c.id === id ? normalizeMemberStatus({ ...c, status: 'active' }) : c,
                ),
              )
            }
            onRemove={(id) =>
              updateContractors((list) => list.filter((c) => c.id !== id))
            }
          />
        </TabsContent>

        <TabsContent value="positions">
          <PositionsTab
            positions={payload.positions}
            readOnly={readOnly}
            onChange={(positions) => setPayload({ ...payload, positions })}
          />
        </TabsContent>
      </Tabs>

      <MemberFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={dialogKind}
        member={editingMember}
        positions={payload.positions}
        readOnly={readOnly}
        onSave={handleMemberSave}
      />
    </div>
  )
}
