import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DrywallCatalogPermissionError,
  updateDrywallDashboardTargets,
} from '@/services/drywallCatalogsService'
import type { DashboardTargets } from '@/lib/drywall/dashboardTargets'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

type Props = {
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  onSaved: (targets: DashboardTargets) => void
}

export function DashboardTargetsTab({ catalogs, readOnly, onSaved }: Props) {
  const t = catalogs.dashboardTargets
  const [annualRevenueGoal, setAnnualRevenueGoal] = useState(String(t.annualRevenueGoal))
  const [backlogGoal, setBacklogGoal] = useState(String(t.backlogGoal))
  const [workingDaysPerMonth, setWorkingDaysPerMonth] = useState(String(t.workingDaysPerMonth))
  const [hangerCrewSqftPerDay, setHangerCrewSqftPerDay] = useState(String(t.capacity.hangerCrewSqftPerDay))
  const [finisherSqftPerDay, setFinisherSqftPerDay] = useState(String(t.capacity.finisherSqftPerDay))
  const [finisherApprenticeSqftPerDay, setFinisherApprenticeSqftPerDay] = useState(
    String(t.capacity.finisherApprenticeSqftPerDay),
  )
  const [hangersPerCrew, setHangersPerCrew] = useState(String(t.capacity.hangersPerCrew))
  const [revenuePerSqftOverride, setRevenuePerSqftOverride] = useState(
    t.capacity.revenuePerSqftOverride != null ? String(t.capacity.revenuePerSqftOverride) : '',
  )
  const [finishers, setFinishers] = useState(String(t.manpowerTargets.finishers))
  const [hangerCrews, setHangerCrews] = useState(String(t.manpowerTargets.hangerCrews))
  const [offSystemAwardedYtd, setOffSystemAwardedYtd] = useState(String(t.offSystemAwardedYtd))
  const [offSystemAwardedYtdYear, setOffSystemAwardedYtdYear] = useState(
    t.offSystemAwardedYtdYear != null ? String(t.offSystemAwardedYtdYear) : '',
  )
  const [saving, setSaving] = useState(false)

  const handleOffSystemAmountChange = (value: string) => {
    setOffSystemAwardedYtd(value)
    const amount = parseFloat(value)
    if (
      value.trim() !== '' &&
      Number.isFinite(amount) &&
      amount > 0 &&
      offSystemAwardedYtdYear.trim() === ''
    ) {
      setOffSystemAwardedYtdYear(String(new Date().getFullYear()))
    }
  }

  const handleSave = async () => {
    const parsed: DashboardTargets = {
      annualRevenueGoal: parseFloat(annualRevenueGoal),
      backlogGoal: parseFloat(backlogGoal),
      workingDaysPerMonth: parseFloat(workingDaysPerMonth),
      offSystemAwardedYtd: parseFloat(offSystemAwardedYtd) || 0,
      offSystemAwardedYtdYear:
        offSystemAwardedYtdYear.trim() === '' ? null : parseInt(offSystemAwardedYtdYear, 10),
      capacity: {
        hangerCrewSqftPerDay: parseFloat(hangerCrewSqftPerDay),
        finisherSqftPerDay: parseFloat(finisherSqftPerDay),
        finisherApprenticeSqftPerDay: parseFloat(finisherApprenticeSqftPerDay),
        hangersPerCrew: parseFloat(hangersPerCrew),
        revenuePerSqftOverride:
          revenuePerSqftOverride.trim() === '' ? null : parseFloat(revenuePerSqftOverride),
      },
      manpowerTargets: {
        finishers: parseFloat(finishers),
        hangerCrews: parseFloat(hangerCrews),
      },
    }

    if (
      !Number.isFinite(parsed.annualRevenueGoal) ||
      !Number.isFinite(parsed.backlogGoal) ||
      !Number.isFinite(parsed.workingDaysPerMonth) ||
      parsed.workingDaysPerMonth <= 0
    ) {
      toast.error('Check annual revenue, backlog goal, and working days')
      return
    }

    setSaving(true)
    try {
      await updateDrywallDashboardTargets(parsed)
      onSaved(parsed)
      toast.success('Dashboard targets saved')
    } catch (e: unknown) {
      if (e instanceof DrywallCatalogPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Failed to save dashboard targets')
    } finally {
      setSaving(false)
    }
  }

  const monthlyDerived = Number.isFinite(parseFloat(annualRevenueGoal))
    ? parseFloat(annualRevenueGoal) / 12
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard Targets</CardTitle>
        <CardDescription>
          KPI goals for the drywall operational dashboard. Monthly / weekly / daily revenue goals are
          derived from the annual goal.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-2xl gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="annual-revenue">Annual revenue goal ($)</Label>
            <Input
              id="annual-revenue"
              type="number"
              min={0}
              value={annualRevenueGoal}
              disabled={readOnly}
              onChange={(e) => setAnnualRevenueGoal(e.target.value)}
            />
            {monthlyDerived != null ? (
              <p className="text-xs text-muted-foreground">
                Derived monthly ≈ ${Math.round(monthlyDerived).toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="backlog-goal">Backlog goal ($)</Label>
            <Input
              id="backlog-goal"
              type="number"
              min={0}
              value={backlogGoal}
              disabled={readOnly}
              onChange={(e) => setBacklogGoal(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="working-days">Working days per month</Label>
            <Input
              id="working-days"
              type="number"
              min={1}
              value={workingDaysPerMonth}
              disabled={readOnly}
              onChange={(e) => setWorkingDaysPerMonth(e.target.value)}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium">Capacity assumptions</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hanger-sqft">Hanger crew sqft / day</Label>
              <Input
                id="hanger-sqft"
                type="number"
                min={0}
                value={hangerCrewSqftPerDay}
                disabled={readOnly}
                onChange={(e) => setHangerCrewSqftPerDay(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finisher-sqft">Finisher sqft / day</Label>
              <Input
                id="finisher-sqft"
                type="number"
                min={0}
                value={finisherSqftPerDay}
                disabled={readOnly}
                onChange={(e) => setFinisherSqftPerDay(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finisher-apprentice-sqft">
                Apprentice/helper finisher rate (sqft/day)
              </Label>
              <Input
                id="finisher-apprentice-sqft"
                type="number"
                min={0}
                value={finisherApprenticeSqftPerDay}
                disabled={readOnly}
                onChange={(e) => setFinisherApprenticeSqftPerDay(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Reduced finishing rate for helpers who assist rather than run their own jobs.
                Point-up specialists are excluded from capacity entirely.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hangers-per-crew">Hangers per crew</Label>
              <Input
                id="hangers-per-crew"
                type="number"
                min={1}
                value={hangersPerCrew}
                disabled={readOnly}
                onChange={(e) => setHangersPerCrew(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rev-sqft-override">Revenue / sqft override ($)</Label>
              <Input
                id="rev-sqft-override"
                type="number"
                min={0}
                step={0.01}
                placeholder="Auto from approved quotes"
                value={revenuePerSqftOverride}
                disabled={readOnly}
                onChange={(e) => setRevenuePerSqftOverride(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium">Awarded outside HSH (this year)</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="off-system-awarded">Awarded revenue ($)</Label>
              <Input
                id="off-system-awarded"
                type="number"
                min={0}
                value={offSystemAwardedYtd}
                disabled={readOnly}
                onChange={(e) => handleOffSystemAmountChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="off-system-year">Calendar year</Label>
              <Input
                id="off-system-year"
                type="number"
                min={2000}
                max={2100}
                placeholder={String(new Date().getFullYear())}
                value={offSystemAwardedYtdYear}
                disabled={readOnly}
                onChange={(e) => setOffSystemAwardedYtdYear(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            One-time figure for revenue awarded this year on jobs not tracked as HSH quotes (e.g.
            done in Buildertrend). Used for North Star pace only when no QuickBooks billings are
            synced. Reset to 0 each January.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-medium">Manpower targets</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="target-finishers">Finishers</Label>
              <Input
                id="target-finishers"
                type="number"
                min={0}
                value={finishers}
                disabled={readOnly}
                onChange={(e) => setFinishers(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-hanger-crews">Hanger crews</Label>
              <Input
                id="target-hanger-crews"
                type="number"
                min={0}
                value={hangerCrews}
                disabled={readOnly}
                onChange={(e) => setHangerCrews(e.target.value)}
              />
            </div>
          </div>
        </div>

        {!readOnly && (
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save dashboard targets'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
