import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Copy, Link2, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Contractor1099, Employee } from '@/types/hr'
import type { CrewAccountStatus, CrewInviteToken, CrewProfileLink } from '@/types/crew'
import { fetchTeam } from '@/services/hrTeamService'
import { fetchCrewProfileLinks } from '@/services/userService'
import {
  buildCrewSignupUrl,
  fetchCrewInvitesForOrg,
  generateCrewInviteToken,
  revokeCrewInviteToken,
} from '@/services/crewInviteService'
import { getPositionName, isArchivedMember } from '@/lib/hrTeamUtils'

type PersonRow = {
  id: string
  name: string
  email?: string | null
  positionId?: string | null
  kind: 'employee' | 'contractor'
}

function statusForPerson(
  person: PersonRow,
  links: CrewProfileLink[],
  invites: CrewInviteToken[],
): CrewAccountStatus {
  const link = links.find((l) => l.personId === person.id && l.personType === person.kind)
  if (link) return 'linked'

  const pending = invites.find((inv) =>
    person.kind === 'employee'
      ? inv.linkedEmployeeId === person.id
      : inv.linkedContractorId === person.id,
  )
  if (pending) return 'invite_pending'

  return 'none'
}

function CrewPersonTable({
  title,
  description,
  people,
  positions,
  links,
  invites,
  onGenerateInvite,
  onCopyInvite,
  onRevokeInvite,
  busyPersonId,
}: {
  title: string
  description: string
  people: PersonRow[]
  positions: { id: string; name: string }[]
  links: CrewProfileLink[]
  invites: CrewInviteToken[]
  onGenerateInvite: (person: PersonRow) => void
  onCopyInvite: (person: PersonRow) => void
  onRevokeInvite: (person: PersonRow) => void
  busyPersonId: string | null
}) {
  const activePeople = people

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {activePeople.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active members in this list.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activePeople.map((person) => {
                const status = statusForPerson(person, links, invites)
                const link = links.find(
                  (l) => l.personId === person.id && l.personType === person.kind,
                )
                const invite = invites.find((inv) =>
                  person.kind === 'employee'
                    ? inv.linkedEmployeeId === person.id
                    : inv.linkedContractorId === person.id,
                )
                const busy = busyPersonId === person.id

                return (
                  <tr key={person.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{person.name}</div>
                      {person.email ? (
                        <div className="text-xs text-muted-foreground">{person.email}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {getPositionName(positions, person.positionId)}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'linked' && link ? (
                        <div className="flex items-start gap-2 text-sm">
                          <UserCheck className="mt-0.5 size-4 shrink-0 text-green-600" />
                          <div>
                            <div>Account active</div>
                            <div className="text-xs text-muted-foreground">{link.email}</div>
                            <div className="text-xs text-muted-foreground">
                              Updated{' '}
                              {formatDistanceToNow(new Date(link.updatedAt), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                      ) : status === 'invite_pending' ? (
                        <div className="flex items-center gap-2 text-sm text-amber-700">
                          <Link2 className="size-4 shrink-0" />
                          Invite pending
                          {invite ? (
                            <span className="text-xs text-muted-foreground">
                              (expires{' '}
                              {formatDistanceToNow(new Date(invite.expiresAt), {
                                addSuffix: true,
                              })}
                              )
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <UserX className="size-4 shrink-0" />
                          No account
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                      {status === 'none' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onGenerateInvite(person)}
                        >
                          Generate invite link
                        </Button>
                      ) : null}
                      {status === 'invite_pending' ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => onCopyInvite(person)}
                          >
                            <Copy className="mr-1 size-3.5" />
                            Copy link
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => onRevokeInvite(person)}
                          >
                            Revoke
                          </Button>
                        </>
                      ) : null}
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

export function CrewAccountsPage() {
  usePageTitle('HR — Crew accounts')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [contractors, setContractors] = useState<Contractor1099[]>([])
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([])
  const [links, setLinks] = useState<CrewProfileLink[]>([])
  const [invites, setInvites] = useState<CrewInviteToken[]>([])
  const [loading, setLoading] = useState(true)
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null)
  const [inviteDialogUrl, setInviteDialogUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [team, crewLinks, crewInvites] = await Promise.all([
        fetchTeam(),
        fetchCrewProfileLinks(),
        fetchCrewInvitesForOrg(),
      ])
      setEmployees(team.employees)
      setContractors(team.contractors1099)
      setPositions(team.positions)
      setLinks(crewLinks)
      setInvites(crewInvites)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load crew accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const inviteByPersonKey = useMemo(() => {
    const map = new Map<string, CrewInviteToken>()
    for (const inv of invites) {
      if (inv.linkedEmployeeId) map.set(`employee:${inv.linkedEmployeeId}`, inv)
      if (inv.linkedContractorId) map.set(`contractor:${inv.linkedContractorId}`, inv)
    }
    return map
  }, [invites])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Invite link copied')
    } catch {
      toast.error('Could not copy — select and copy the link manually')
    }
  }

  const handleGenerateInvite = async (person: PersonRow) => {
    setBusyPersonId(person.id)
    try {
      const token = await generateCrewInviteToken({
        linkedEmployeeId: person.kind === 'employee' ? person.id : undefined,
        linkedContractorId: person.kind === 'contractor' ? person.id : undefined,
        invitedEmail: person.email ?? undefined,
      })
      const url = buildCrewSignupUrl(token.token)
      setInviteDialogUrl(url)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate invite')
    } finally {
      setBusyPersonId(null)
    }
  }

  const handleCopyInvite = async (person: PersonRow) => {
    const inv = inviteByPersonKey.get(`${person.kind}:${person.id}`)
    if (!inv) {
      toast.error('No pending invite found')
      return
    }
    await copyToClipboard(buildCrewSignupUrl(inv.token))
  }

  const handleRevokeInvite = async (person: PersonRow) => {
    const inv = inviteByPersonKey.get(`${person.kind}:${person.id}`)
    if (!inv) {
      toast.error('No pending invite found')
      return
    }
    setBusyPersonId(person.id)
    try {
      await revokeCrewInviteToken(inv.id)
      toast.success('Invite revoked')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to revoke invite')
    } finally {
      setBusyPersonId(null)
    }
  }

  const employeeRows: PersonRow[] = employees
    .filter((e) => !isArchivedMember(e))
    .map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      positionId: e.positionId,
      kind: 'employee' as const,
    }))

  const contractorRows: PersonRow[] = contractors
    .filter((c) => !isArchivedMember(c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      positionId: c.positionId,
      kind: 'contractor' as const,
    }))

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Crew accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate one-time invite links for W2 employees and 1099 contractors. Copy the link
          and send it by text or email.
        </p>
      </div>

      <CrewPersonTable
        title="Employees (W2)"
        description="Field and shop crew on payroll."
        people={employeeRows}
        positions={positions}
        links={links}
        invites={invites}
        onGenerateInvite={handleGenerateInvite}
        onCopyInvite={handleCopyInvite}
        onRevokeInvite={handleRevokeInvite}
        busyPersonId={busyPersonId}
      />

      <CrewPersonTable
        title="1099 contractors"
        description="Subcontractor crew tied to assigned companies."
        people={contractorRows}
        positions={positions}
        links={links}
        invites={invites}
        onGenerateInvite={handleGenerateInvite}
        onCopyInvite={handleCopyInvite}
        onRevokeInvite={handleRevokeInvite}
        busyPersonId={busyPersonId}
      />

      <Dialog open={!!inviteDialogUrl} onOpenChange={(open) => !open && setInviteDialogUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite link ready</DialogTitle>
            <DialogDescription>
              Copy this link and send it to the crew member. It expires in one week and can only
              be used once.
            </DialogDescription>
          </DialogHeader>
          {inviteDialogUrl ? (
            <div className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
              {inviteDialogUrl}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => inviteDialogUrl && void copyToClipboard(inviteDialogUrl)}
            >
              <Copy className="mr-2 size-4" />
              Copy to clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
