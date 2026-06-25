import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Download, FileText, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatCurrency } from '@/components/hr/payroll/payrollFormat'
import {
  PoIntakeDialog,
  poDataToFormValues,
} from '@/components/drywall/intake/PoIntakeDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import {
  fetchDrywallProjectById,
  getPoDataFromLegacy,
  getQuoteOutcomeFromLegacy,
} from '@/services/drywallProjectsService'
import { cn } from '@/lib/utils'

interface PoSummaryCardProps {
  projectId: string
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

export function PoSummaryCard({ projectId }: PoSummaryCardProps) {
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [client, setClient] = useState('')
  const [address, setAddress] = useState('')
  const [poReference, setPoReference] = useState('')
  const [customerContact, setCustomerContact] = useState('')
  const [customerSqft, setCustomerSqft] = useState(0)
  const [agreedUnitRate, setAgreedUnitRate] = useState(0)
  const [scopeText, setScopeText] = useState('')
  const [expectedStartDate, setExpectedStartDate] = useState<string | null>(null)
  const [intakeAt, setIntakeAt] = useState<string | null>(null)
  const [bidTotal, setBidTotal] = useState<number | null>(null)
  const [formInitial, setFormInitial] = useState<ReturnType<typeof poDataToFormValues> | null>(
    null,
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const project = await fetchDrywallProjectById(projectId)
      if (!project) {
        toast.error('Project not found')
        return
      }

      const po = getPoDataFromLegacy(project.legacy)
      if (!po) {
        toast.error('PO data not found on this project')
        return
      }

      const { bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy)

      setProjectName(project.name)
      setClient(project.client)
      setAddress(project.address)
      setPoReference(po.poReference)
      setCustomerContact(po.customerContact ?? '')
      setCustomerSqft(po.customerSqft)
      setAgreedUnitRate(po.agreedUnitRate)
      setScopeText(po.scopeText)
      setExpectedStartDate(po.expectedStartDate ?? null)
      setIntakeAt(po.intakeAt)
      setBidTotal(bidSnapshot?.total ?? po.customerSqft * po.agreedUnitRate)
      setFormInitial(poDataToFormValues(project, po))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load PO summary')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  const total = bidTotal ?? customerSqft * agreedUnitRate

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileText className="h-5 w-5 text-primary" />
              Purchase Order
            </CardTitle>
            {intakeAt && (
              <p className="text-sm text-muted-foreground mt-1">
                Approved · Intake {format(new Date(intakeAt), 'MMM d, yyyy')}
              </p>
            )}
          </div>
          <span
            className={cn(
              'rounded-full border px-3 py-0.5 text-xs font-medium shrink-0',
              'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
            )}
          >
            Approved
          </span>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailRow label="PO #" value={poReference} />
            <DetailRow label="Customer" value={client || projectName} />
            <DetailRow label="Contact" value={customerContact} />
            <DetailRow label="Address" value={address} />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-1">Pricing</p>
            <p className="text-2xl font-semibold tabular-nums">
              {customerSqft.toLocaleString()} sqft × {formatCurrency(agreedUnitRate)} ={' '}
              {formatCurrency(total)}
            </p>
          </div>

          {scopeText.trim() && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Scope</p>
              <p className="text-sm whitespace-pre-wrap">{scopeText}</p>
            </div>
          )}

          {expectedStartDate && (
            <DetailRow
              label="Expected Start"
              value={format(new Date(expectedStartDate), 'MMMM d, yyyy')}
            />
          )}

          {intakeAt && (
            <p className="text-xs text-muted-foreground">
              Bid baseline: {formatCurrency(total)} locked on{' '}
              {format(new Date(intakeAt), 'MMM d, yyyy')}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {!readOnly && formInitial && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit PO
              </Button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" disabled>
                      <Download className="mr-2 h-4 w-4" />
                      Download PO PDF
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Coming soon</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {formInitial && (
        <PoIntakeDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          projectId={projectId}
          initialValues={formInitial}
          onUpdated={() => setReloadKey((k) => k + 1)}
        />
      )}
    </>
  )
}
