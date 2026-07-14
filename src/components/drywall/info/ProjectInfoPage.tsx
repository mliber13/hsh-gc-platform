import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  FileText,
  MapPin,
  Phone,
  Trash2,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import {
  deleteDrywallProject,
  DrywallProjectPermissionError,
  type FieldTakeoffSiteInfo,
  fetchDrywallProjectById,
  saveFieldTakeoffSiteInfo,
  updateDrywallProjectInfo,
} from '@/services/drywallProjectsService'
import type { ProjectInfoForm } from '@/types/drywall'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { CommsLogPanel } from '@/components/drywall/comms/CommsLogPanel'

function toForm(project: {
  name: string
  client: string
  address: string
  notes: string
}): ProjectInfoForm {
  return {
    name: project.name ?? '',
    client: project.client ?? '',
    address: project.address ?? '',
    notes: project.notes ?? '',
  }
}

const EMPTY_SITE: FieldTakeoffSiteInfo = {
  siteContact: '',
  contactPhone: '',
  meetingLocation: '',
  accessNotes: '',
  hazards: '',
}

/** Pull the shared site/access fields out of the project's field takeoff (metadata.legacy). */
function extractSite(legacy: Record<string, unknown> | undefined): FieldTakeoffSiteInfo {
  const raw =
    legacy?.fieldTakeoff && typeof legacy.fieldTakeoff === 'object' && !Array.isArray(legacy.fieldTakeoff)
      ? (legacy.fieldTakeoff as Record<string, unknown>)
      : {}
  const str = (key: keyof FieldTakeoffSiteInfo) =>
    typeof raw[key] === 'string' ? (raw[key] as string) : ''
  return {
    siteContact: str('siteContact'),
    contactPhone: str('contactPhone'),
    meetingLocation: str('meetingLocation'),
    accessNotes: str('accessNotes'),
    hazards: str('hazards'),
  }
}

export function ProjectInfoPage() {
  const { projectId, setProjectName } = useOutletContext<DrywallProjectShellContext>()
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [form, setForm] = useState<ProjectInfoForm>({
    name: '',
    client: '',
    address: '',
    notes: '',
  })
  const [site, setSite] = useState<FieldTakeoffSiteInfo>(EMPTY_SITE)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [savedSiteSnapshot, setSavedSiteSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const project = await fetchDrywallProjectById(projectId)
      if (!project) {
        toast.error('Project not found')
        navigate('/drywall', { replace: true })
        return
      }
      const next = toForm(project)
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      const nextSite = extractSite(project.legacy)
      setSite(nextSite)
      setSavedSiteSnapshot(JSON.stringify(nextSite))
      setProjectName(project.name)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId, navigate, setProjectName])

  useEffect(() => {
    void load()
  }, [load])

  const siteDirty = useMemo(
    () => JSON.stringify(site) !== savedSiteSnapshot,
    [site, savedSiteSnapshot],
  )
  const isDirty = useMemo(
    () => JSON.stringify(form) !== savedSnapshot || siteDirty,
    [form, savedSnapshot, siteDirty],
  )

  const validationError = useMemo(() => {
    if (!form.name.trim()) return 'Job name is required.'
    if (!form.client.trim()) return 'Client name is required.'
    return null
  }, [form.name, form.client])

  const handleSave = async (advanceToQuote = false) => {
    if (readOnly || validationError) return
    setSaving(true)
    try {
      const updated = await updateDrywallProjectInfo(projectId, {
        ...form,
        name: form.name.trim(),
        client: form.client.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
        ...(advanceToQuote ? { status: 'quote' as const } : {}),
      })
      // Site/access info lives in the shared field takeoff — save it only when it changed so
      // we don't bump the takeoff's updated timestamp on every project-info save.
      if (siteDirty) {
        const trimmedSite: FieldTakeoffSiteInfo = {
          siteContact: site.siteContact.trim(),
          contactPhone: site.contactPhone.trim(),
          meetingLocation: site.meetingLocation.trim(),
          accessNotes: site.accessNotes.trim(),
          hazards: site.hazards.trim(),
        }
        await saveFieldTakeoffSiteInfo(projectId, trimmedSite)
        setSite(trimmedSite)
        setSavedSiteSnapshot(JSON.stringify(trimmedSite))
      }
      const next = toForm(updated)
      setForm(next)
      setSavedSnapshot(JSON.stringify(next))
      setProjectName(updated.name)
      toast.success(advanceToQuote ? 'Saved — advanced to Quote stage' : 'Project info saved')
      if (advanceToQuote) {
        navigate(`/drywall/projects/${projectId}/quote`)
      }
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (readOnly || deleting) return
    setDeleting(true)
    try {
      await deleteDrywallProject(projectId)
      toast.success('Project deleted')
      setDeleteOpen(false)
      navigate('/drywall', { replace: true })
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to delete project')
      }
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Project Information</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Basic job details — saved explicitly to the project row and legacy metadata mirror.
          {readOnly && (
            <span className="block mt-1 text-amber-700 dark:text-amber-300">
              Read-only — you can view but cannot save changes.
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-primary" />
            Project Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="drywall-job-name">
              Job Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="drywall-job-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Smith Residence — Kitchen"
              disabled={readOnly}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="drywall-client" className="flex items-center gap-1">
              <User className="h-4 w-4" />
              Client Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="drywall-client"
              value={form.client}
              onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
              placeholder="e.g., John Smith"
              disabled={readOnly}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="drywall-address" className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              Project Address
            </Label>
            <Input
              id="drywall-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="123 Main St, City, State"
              disabled={readOnly}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="drywall-notes" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Notes
            </Label>
            <Textarea
              id="drywall-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Additional project information…"
              rows={4}
              disabled={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-primary" />
            Site &amp; Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Shared with the Field stage — anything you enter here is pre-filled when the crew
            measures, and their field updates flow back here. Leave blank if unknown.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="drywall-site-contact" className="flex items-center gap-1">
                <User className="h-4 w-4" />
                Site Contact
              </Label>
              <Input
                id="drywall-site-contact"
                value={site.siteContact}
                onChange={(e) => setSite((s) => ({ ...s, siteContact: e.target.value }))}
                placeholder="On-site contact name"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drywall-site-phone" className="flex items-center gap-1">
                <Phone className="h-4 w-4" />
                Contact Phone
              </Label>
              <Input
                id="drywall-site-phone"
                type="tel"
                value={site.contactPhone}
                onChange={(e) => setSite((s) => ({ ...s, contactPhone: e.target.value }))}
                placeholder="(555) 555-5555"
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="drywall-meeting" className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              Meeting Location
            </Label>
            <Input
              id="drywall-meeting"
              value={site.meetingLocation}
              onChange={(e) => setSite((s) => ({ ...s, meetingLocation: e.target.value }))}
              placeholder="Where to meet on site"
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drywall-access">Access Notes</Label>
            <Textarea
              id="drywall-access"
              rows={3}
              value={site.accessNotes}
              onChange={(e) => setSite((s) => ({ ...s, accessNotes: e.target.value }))}
              placeholder="Gate code, lockbox, parking, entry, hours, keys…"
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drywall-hazards" className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Hazards
            </Label>
            <Textarea
              id="drywall-hazards"
              rows={3}
              value={site.hazards}
              onChange={(e) => setSite((s) => ({ ...s, hazards: e.target.value }))}
              placeholder="Safety hazards, PPE needs…"
              disabled={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button
              onClick={() => void handleSave(false)}
              disabled={saving || !isDirty || Boolean(validationError)}
            >
              {saving ? 'Saving…' : isDirty ? 'Save changes' : 'Saved'}
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={saving}>
              Reload
            </Button>
          </div>
          <Button
            variant="secondary"
            onClick={() => void handleSave(true)}
            disabled={saving || Boolean(validationError)}
          >
            Continue to Quote
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {validationError && !readOnly && (
        <p className="text-sm text-amber-700 dark:text-amber-300">{validationError}</p>
      )}

      <CommsLogPanel projectId={projectId} />

      {!readOnly && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Permanently deletes this project, its quote data, field measurements, orders, comms log,
              and PO data. Payroll entries tagged to this project will keep their pay records but
              their job link will be orphaned. Cannot be undone.
            </p>
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Project
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              This permanently deletes &quot;{form.name || 'this project'}&quot; and all of its data.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
