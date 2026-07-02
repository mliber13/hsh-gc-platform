import { useCallback, useEffect, useMemo, useState } from 'react'
import { Library } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { canEditDrywallCatalogs } from '@/routes/RequirePermission'
import {
  DrywallCatalogPermissionError,
  fetchOrgDrywallCatalogs,
  saveOrgDrywallCatalogs,
} from '@/services/drywallCatalogsService'
import type { DrywallCatalogKey, OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { BoardsTab } from './catalogs/BoardsTab'
import {
  AcousticTab,
  FrpTab,
  InsulationTab,
  MetalStudTab,
  RcChannelTab,
  SuspendedGridTab,
} from './catalogs/ComponentCatalogTabs'
import { AccessoriesTab } from './catalogs/AccessoriesTab'
import { FinishScopesTab } from './catalogs/FinishScopesTab'
import { TargetsTab } from './catalogs/TargetsTab'
import { DashboardTargetsTab } from './catalogs/DashboardTargetsTab'

export function CatalogsPage() {
  usePageTitle('Drywall — Catalogs')
  const { effectiveRole } = usePermissions()
  const readOnly = !canEditDrywallCatalogs(effectiveRole)

  const [catalogs, setCatalogs] = useState<OrgDrywallCatalogs | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchOrgDrywallCatalogs()
      setCatalogs(data)
      setSavedSnapshot(JSON.stringify(data))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load catalogs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const isDirty = useMemo(() => {
    if (!catalogs) return false
    return JSON.stringify(catalogs) !== savedSnapshot
  }, [catalogs, savedSnapshot])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const updateCatalog = useCallback(<K extends DrywallCatalogKey>(key: K, items: OrgDrywallCatalogs[K]) => {
    setCatalogs((prev) => (prev ? { ...prev, [key]: items } : prev))
  }, [])

  const handleSave = async () => {
    if (!catalogs || readOnly) return
    setSaving(true)
    try {
      await saveOrgDrywallCatalogs(catalogs)
      setSavedSnapshot(JSON.stringify(catalogs))
      toast.success('Catalogs saved')
    } catch (e: unknown) {
      if (e instanceof DrywallCatalogPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Failed to save catalogs')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !catalogs) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  const tabProps = { readOnly, onUpdate: updateCatalog, catalogs }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Library className="h-7 w-7 text-primary" />
            Drywall Catalogs
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Org-wide board, finish scope, accessory, and component rate catalogs for line-item quotes.
            {readOnly && (
              <span className="mt-1 block text-amber-700 dark:text-amber-300">
                Read-only — you can view catalogs but cannot save changes.
              </span>
            )}
          </p>
          {isDirty && !readOnly && (
            <p className="mt-2 text-sm text-amber-700">You have unsaved changes.</p>
          )}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={saving}>
              Reload
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
              {saving ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="boards" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="boards">Boards ({catalogs.boards.length})</TabsTrigger>
          <TabsTrigger value="finish">Finish Scopes ({catalogs.finish_scopes.length})</TabsTrigger>
          <TabsTrigger value="accessories">Accessories ({catalogs.accessories.length})</TabsTrigger>
          <TabsTrigger value="rc">RC Channel ({catalogs.rc_channel.length})</TabsTrigger>
          <TabsTrigger value="grid">Suspended Grid ({catalogs.suspended_grid.length})</TabsTrigger>
          <TabsTrigger value="insulation">Insulation ({catalogs.insulation.length})</TabsTrigger>
          <TabsTrigger value="acoustic">Acoustic ({catalogs.acoustic.length})</TabsTrigger>
          <TabsTrigger value="metal">Metal Stud ({catalogs.metal_stud.length})</TabsTrigger>
          <TabsTrigger value="frp">FRP ({catalogs.frp.length})</TabsTrigger>
          <TabsTrigger value="targets">Margin Targets</TabsTrigger>
          <TabsTrigger value="dashboard-targets">Dashboard Targets</TabsTrigger>
        </TabsList>

        <TabsContent value="boards">
          <BoardsTab items={catalogs.boards} readOnly={readOnly} onChange={(items) => updateCatalog('boards', items)} />
        </TabsContent>
        <TabsContent value="finish">
          <FinishScopesTab items={catalogs.finish_scopes} readOnly={readOnly} onChange={(items) => updateCatalog('finish_scopes', items)} />
        </TabsContent>
        <TabsContent value="accessories">
          <AccessoriesTab
            items={catalogs.accessories}
            readOnly={readOnly}
            onChange={(items) => updateCatalog('accessories', items)}
          />
        </TabsContent>
        <TabsContent value="rc"><RcChannelTab {...tabProps} /></TabsContent>
        <TabsContent value="grid"><SuspendedGridTab {...tabProps} /></TabsContent>
        <TabsContent value="insulation"><InsulationTab {...tabProps} /></TabsContent>
        <TabsContent value="acoustic"><AcousticTab {...tabProps} /></TabsContent>
        <TabsContent value="metal"><MetalStudTab {...tabProps} /></TabsContent>
        <TabsContent value="frp"><FrpTab {...tabProps} /></TabsContent>
        <TabsContent value="targets">
          <TargetsTab
            catalogs={catalogs}
            readOnly={readOnly}
            onSaved={(marginFloorTarget, poEstimatedCostPerSqft) => {
              setCatalogs((prev) =>
                prev
                  ? {
                      ...prev,
                      marginFloorTarget,
                      poEstimatedCostPerSqft,
                    }
                  : prev,
              )
            }}
          />
        </TabsContent>
        <TabsContent value="dashboard-targets">
          <DashboardTargetsTab
            catalogs={catalogs}
            readOnly={readOnly}
            onSaved={(dashboardTargets) => {
              setCatalogs((prev) => (prev ? { ...prev, dashboardTargets } : prev))
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
