// ============================================================================
// Import from QuickBooks - Pending list and allocate flow
// ============================================================================

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Download, Package, Users, ArrowRight, Calculator, ExternalLink, Search, Briefcase } from 'lucide-react'
import {
  getQBJobTransactions,
  getQBChartOfAccounts,
  type QBJobTransaction,
  type QBAccount,
} from '@/services/quickbooksService'
import { getProjects_Hybrid, getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { fetchSubItemsForTrade } from '@/services/supabaseService'
import { addMaterialEntry_Hybrid, addSubcontractorEntry_Hybrid, getProjectActuals_Hybrid } from '@/services/actualsHybridService'
import {
  getQboWageConfig,
  saveQboWageConfig,
  getLaborBurdenGlobalRate,
  setLaborBurdenGlobalRate,
  getLaborImportBatches,
  previewLaborFromQBO,
  importLaborFromQBO,
  type LaborImportBatch,
} from '@/services/laborImportService'
import { useTradeCategories } from '@/contexts/TradeCategoriesContext'
import type { Project, Trade, SubItem } from '@/types'

export interface QuickBooksImportProps {
  /** 'card' = full card with "View pending" (Settings). 'button' = single button (Project Actuals) */
  trigger?: 'card' | 'button'
  /** When opened from Project Actuals, pre-select this project and optionally load its trades */
  preSelectedProject?: { id: string; name: string; estimateId?: string }
  /** Called after a successful import (e.g. to refresh Actuals) */
  onSuccess?: () => void
}

export function QuickBooksImport({ trigger = 'card', preSelectedProject, onSuccess }: QuickBooksImportProps) {
  const { categories } = useTradeCategories()
  const [open, setOpen] = useState(false)
  const [transactions, setTransactions] = useState<QBJobTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [subItems, setSubItems] = useState<SubItem[]>([])
  const [selectedTxn, setSelectedTxn] = useState<QBJobTransaction | null>(null)
  const [step, setStep] = useState<'list' | 'allocate'>('list')
  const [view, setView] = useState<'pending' | 'reconcile' | 'labor'>('pending')
  const [projectId, setProjectId] = useState<string>('')
  const [reconcileAppTotals, setReconcileAppTotals] = useState<Record<string, number>>({})
  const [reconcileQBOTotals, setReconcileQBOTotals] = useState<Record<string, string>>({})
  const [loadingReconcile, setLoadingReconcile] = useState(false)
  const [loadingFillQBO, setLoadingFillQBO] = useState(false)
  const [varianceTip, setVarianceTip] = useState<{
    projectId: string
    projectName: string
    variance: number
    entries: Array<{ description: string; amount: number; type: string }>
  } | null>(null)
  const [loadingVariance, setLoadingVariance] = useState<string | null>(null)
  const [entryType, setEntryType] = useState<'material' | 'subcontractor'>('material')
  const [category, setCategory] = useState<string>('')
  const [tradeId, setTradeId] = useState<string>('')
  const [subItemId, setSubItemId] = useState<string>('')
  const [allocating, setAllocating] = useState(false)

  const [help, setHelp] = useState<string | null>(null)
  const [yourAccounts, setYourAccounts] = useState<{ name: string; type: string }[]>([])
  const [yourClasses, setYourClasses] = useState<string[]>([])
  const [includeUnassigned, setIncludeUnassigned] = useState(false)
  const [laborWageAccountIds, setLaborWageAccountIds] = useState('')
  const [laborNoBurdenAccountIds, setLaborNoBurdenAccountIds] = useState('')
  const [laborDateStart, setLaborDateStart] = useState('')
  const [laborDateEnd, setLaborDateEnd] = useState('')
  const [laborSaving, setLaborSaving] = useState(false)
  const [laborPreviewLoading, setLaborPreviewLoading] = useState(false)
  const [laborPreview, setLaborPreview] = useState<{
    journalEntriesFound: number
    matchingWageLines: number
    totalGrossWages: number
    distinctProjectsAffected: number
  } | null>(null)
  const [laborImporting, setLaborImporting] = useState(false)
  const [laborBatches, setLaborBatches] = useState<LaborImportBatch[]>([])
  const [laborResult, setLaborResult] = useState<{ rowCount: number; totalWages: number; errorCount: number } | null>(null)
  const [laborAccountPickerOpen, setLaborAccountPickerOpen] = useState(false)
  const [laborAccountsFromQB, setLaborAccountsFromQB] = useState<QBAccount[]>([])
  const [laborAccountsLoading, setLaborAccountsLoading] = useState(false)
  const [laborAccountSearch, setLaborAccountSearch] = useState('')
  const [selectedWageAccountIds, setSelectedWageAccountIds] = useState<Set<string>>(new Set())
  const [laborBurdenPercent, setLaborBurdenPercent] = useState<number | null>(null)
  const [laborBurdenEffectiveDate, setLaborBurdenEffectiveDate] = useState<string>('')
  const [laborBurdenSaving, setLaborBurdenSaving] = useState(false)
  const [laborBurdenPercentInput, setLaborBurdenPercentInput] = useState('')
  const [laborBurdenDateInput, setLaborBurdenDateInput] = useState('')
  const loadPending = async () => {
    setLoading(true)
    setError(null)
    setHelp(null)
    setYourAccounts([])
    setYourClasses([])
    const { transactions: list, error: err, help: helpMsg, yourAccounts: accounts, yourClasses: classes } = await getQBJobTransactions(undefined, includeUnassigned)
    setTransactions(list)
    if (err) setError(err)
    if (helpMsg) setHelp(helpMsg)
    if (accounts?.length) setYourAccounts(accounts)
    if (classes?.length) setYourClasses(classes)
    setLoading(false)
  }

  const loadProjects = async () => {
    const list = await getProjects_Hybrid()
    setProjects(list)
  }

  const loadLaborConfigAndBatches = async () => {
    const [config, batches, burdenRate] = await Promise.all([
      getQboWageConfig(),
      getLaborImportBatches(10),
      getLaborBurdenGlobalRate(),
    ])
    if (config) {
      setLaborWageAccountIds((config.accountIds || []).join('\n'))
      setLaborNoBurdenAccountIds((config.accountIdsNoBurden || []).join('\n'))
    }
    setLaborBatches(batches)
    if (burdenRate) {
      setLaborBurdenPercent(burdenRate.method === 'percent' ? burdenRate.value : null)
      setLaborBurdenEffectiveDate(burdenRate.effectiveDate ?? '')
      setLaborBurdenPercentInput(String(burdenRate.method === 'percent' ? burdenRate.value : ''))
      setLaborBurdenDateInput(burdenRate.effectiveDate ?? '')
    } else {
      setLaborBurdenPercent(null)
      setLaborBurdenEffectiveDate('')
      setLaborBurdenPercentInput('')
      setLaborBurdenDateInput('')
    }
  }

  useEffect(() => {
    if (open) {
      setError(null)
      setHelp(null)
      setYourAccounts([])
      setYourClasses([])
      setStep('list')
      setView('pending')
      setSelectedTxn(null)
      setProjectId(preSelectedProject?.id ?? '')
      setCategory('')
      setTradeId('')
      setSubItemId('')
      setTrades([])
      setSubItems([])
      setReconcileAppTotals({})
      setReconcileQBOTotals({})
      setLaborResult(null)
      setLaborPreview(null)
      loadPending()
      loadProjects()
    }
  }, [open, preSelectedProject?.id])

  useEffect(() => {
    if (open && view === 'labor') loadLaborConfigAndBatches()
  }, [open, view])

  const laborWageAccountCount = laborWageAccountIds
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length
  const laborNoBurdenAccountCount = laborNoBurdenAccountIds
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length

  const loadReconcileTotals = async () => {
    if (projects.length === 0) return
    setLoadingReconcile(true)
    try {
      const results = await Promise.all(
        projects.map(async (p) => {
          const actuals = await getProjectActuals_Hybrid(p.id)
          const total = actuals?.totalActualCost ?? 0
          return { projectId: p.id, total }
        })
      )
      const map: Record<string, number> = {}
      results.forEach((r) => { map[r.projectId] = r.total })
      setReconcileAppTotals(map)
    } finally {
      setLoadingReconcile(false)
    }
  }

  useEffect(() => {
    if (open && view === 'reconcile' && projects.length > 0 && !loadingReconcile && Object.keys(reconcileAppTotals).length === 0) {
      loadReconcileTotals()
    }
  }, [open, view, projects.length])

  const handleOpen = () => setOpen(true)
  const handleClose = () => {
    setOpen(false)
    setStep('list')
    setView('pending')
    setSelectedTxn(null)
  }

  const setQBOTotal = (projectId: string, value: string) => {
    setReconcileQBOTotals((prev) => ({ ...prev, [projectId]: value }))
  }

  const projectActualsUrl = (id: string) => {
    if (typeof window === 'undefined') return '#'
    const base = window.location.origin + (window.location.pathname || '/')
    return `${base}?project=${encodeURIComponent(id)}&view=actuals`
  }

  const handleVarianceClick = async (p: Project, variance: number) => {
    setVarianceTip(null)
    setLoadingVariance(p.id)
    try {
      const actuals = await getProjectActuals_Hybrid(p.id)
      const targetAmt = Math.abs(variance)
      const tolerance = 0.02
      const entries: Array<{ description: string; amount: number; type: string }> = []
      const add = (list: any[], type: string, getAmount: (e: any) => number, getDesc: (e: any) => string) => {
        if (!Array.isArray(list)) return
        for (const e of list) {
          const amt = getAmount(e)
          if (Math.abs(amt - targetAmt) <= tolerance) {
            entries.push({ description: getDesc(e), amount: amt, type })
          }
        }
      }
      add(actuals?.laborEntries ?? [], 'Labor', (e) => Number(e?.totalCost ?? e?.amount ?? 0), (e) => (e?.description || 'Labor') as string)
      add(actuals?.materialEntries ?? [], 'Material', (e) => Number(e?.totalCost ?? e?.amount ?? 0), (e) => (e?.description || e?.vendor || 'Material') as string)
      add(actuals?.subcontractorEntries ?? [], 'Subcontractor', (e) => Number(e?.totalPaid ?? e?.amount ?? 0), (e) => (e?.description || e?.subcontractorName || 'Sub') as string)
      setVarianceTip({
        projectId: p.id,
        projectName: p.name ?? '',
        variance,
        entries,
      })
    } finally {
      setLoadingVariance(null)
    }
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

  const estimateId = projectId
    ? (projects.find((p) => p.id === projectId)?.estimate?.id ?? preSelectedProject?.estimateId)
    : null

  useEffect(() => {
    if (!estimateId) {
      setTrades([])
      return
    }
    getTradesForEstimate_Hybrid(estimateId).then(setTrades).catch(() => setTrades([]))
  }, [estimateId])

  useEffect(() => {
    if (!tradeId) {
      setSubItems([])
      setSubItemId('')
      return
    }
    fetchSubItemsForTrade(tradeId).then(setSubItems).catch(() => setSubItems([]))
    setSubItemId('')
  }, [tradeId])

  // When category changes, clear estimate line and sub-item so they match the new category
  useEffect(() => {
    setTradeId('')
    setSubItemId('')
  }, [category])

  const suggestCategoryForTransaction = (txn: QBJobTransaction): string => {
    const text = `${txn.description || ''} ${txn.vendorName || ''}`.toLowerCase()
    if (txn.accountType === 'Utilities') return 'utilities'
    if (txn.accountType === 'Disposal Fees') return 'site-prep'
    if (txn.accountType === 'Fuel Expense') return 'site-prep'

    const keywordMap: Array<{ category: string; keywords: string[] }> = [
      { category: 'electrical', keywords: ['electrical', 'fixture', 'recessed', 'lighting', 'switch', 'outlet', 'panel', 'breaker'] },
      { category: 'plumbing', keywords: ['plumb', 'toilet', 'faucet', 'water heater', 'sewer', 'drain', 'shower', 'tub'] },
      { category: 'hvac', keywords: ['hvac', 'furnace', 'duct', 'air handler', 'condenser', 'heat pump', 'thermostat'] },
      { category: 'roofing', keywords: ['roof', 'shingle', 'flashing', 'gutter'] },
      { category: 'drywall', keywords: ['drywall', 'sheetrock', 'mud', 'tape', 'texture'] },
      { category: 'rough-framing', keywords: ['framing', 'lumber', 'truss', 'joist', 'stud'] },
      { category: 'windows-doors', keywords: ['window', 'door', 'garage door'] },
      { category: 'interior-finishes', keywords: ['paint', 'floor', 'tile', 'trim', 'baseboard', 'casing'] },
      { category: 'kitchen', keywords: ['cabinet', 'countertop', 'backsplash', 'kitchen'] },
      { category: 'bath', keywords: ['bath', 'vanity', 'mirror', 'towel bar'] },
      { category: 'appliances', keywords: ['appliance', 'refrigerator', 'dishwasher', 'range', 'oven', 'microwave'] },
      { category: 'masonry-paving', keywords: ['concrete', 'masonry', 'brick', 'block', 'paving', 'asphalt'] },
      { category: 'insulation', keywords: ['insulation', 'spray foam', 'batt'] },
      { category: 'exterior-finishes', keywords: ['siding', 'soffit', 'fascia', 'stucco', 'exterior paint'] },
    ]

    for (const entry of keywordMap) {
      if (entry.keywords.some((kw) => text.includes(kw))) return entry.category
    }

    return txn.accountType === 'Subcontractor Expense' ? 'other' : 'other'
  }

  // Only show estimate lines that belong to the selected category
  const tradesInCategory = category ? trades.filter((t) => t.category === category) : []

  const handleSelectTransaction = (txn: QBJobTransaction) => {
    setSelectedTxn(txn)
    setStep('allocate')
    setEntryType(txn.accountType === 'Subcontractor Expense' ? 'subcontractor' : 'material')
    setCategory(suggestCategoryForTransaction(txn))
    setTradeId('')
    setSubItemId('')
    const mappedById = projects.find((p) => (p as { qbProjectId?: string }).qbProjectId === txn.qbProjectId)
    const jobName = (txn.qbProjectName ?? '').trim().toLowerCase()
    const mappedByName = !mappedById && jobName
      ? projects.find((p) => (p.name ?? '').trim().toLowerCase() === jobName)
      : null
    setProjectId(preSelectedProject?.id ?? mappedById?.id ?? mappedByName?.id ?? '')
  }

  const handleAllocate = async () => {
    if (!selectedTxn || !projectId || !category) {
      alert('Please select project and category.')
      return
    }
    setAllocating(true)
    try {
      const date = selectedTxn.txnDate ? new Date(selectedTxn.txnDate) : new Date()
      if (entryType === 'material') {
        await addMaterialEntry_Hybrid(projectId, {
          date,
          materialName: selectedTxn.description || `${selectedTxn.vendorName} - ${selectedTxn.docNumber}`,
          totalCost: selectedTxn.amount,
          category: category as any,
          tradeId: tradeId || undefined,
          subItemId: subItemId || undefined,
          vendor: selectedTxn.vendorName,
          invoiceNumber: selectedTxn.docNumber || undefined,
          qbTransactionId: selectedTxn.qbTransactionId,
          qbTransactionType: selectedTxn.qbTransactionType,
          qbLineId: selectedTxn.qbLineId ?? undefined,
        })
      } else {
        await addSubcontractorEntry_Hybrid(projectId, {
          date,
          scopeOfWork: selectedTxn.description || `${selectedTxn.vendorName} - ${selectedTxn.docNumber}`,
          totalPaid: selectedTxn.amount,
          trade: category as any,
          tradeId: tradeId || undefined,
          subItemId: subItemId || undefined,
          subcontractorName: selectedTxn.vendorName,
          invoiceNumber: selectedTxn.docNumber || undefined,
          qbTransactionId: selectedTxn.qbTransactionId,
          qbTransactionType: selectedTxn.qbTransactionType,
          qbLineId: selectedTxn.qbLineId ?? undefined,
        })
      }
      setSelectedTxn(null)
      setStep('list')
      await loadPending()
      onSuccess?.()
    } catch (e) {
      console.error(e)
      alert('Failed to create entry. See console.')
    }
    setAllocating(false)
  }

  const mappedProject = selectedTxn
    ? projects.find((p) => (p as { qbProjectId?: string }).qbProjectId === selectedTxn.qbProjectId) ??
        (selectedTxn.qbProjectName
          ? projects.find((p) => (p.name ?? '').trim().toLowerCase() === (selectedTxn.qbProjectName ?? '').trim().toLowerCase())
          : null)
    : null

  return (
    <>
      {trigger === 'card' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="w-4 h-4" />
              Import from QuickBooks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">
              Pull in material and subcontractor transactions from QuickBooks, then allocate them to a project and trade.
            </p>
            <Button onClick={handleOpen} variant="outline" className="w-full">
              View pending transactions
            </Button>
            <Button
              onClick={async () => {
                const result = await getQBJobTransactions(true)
                if (result._debug) {
                  const excludedCount = Array.isArray(result._excluded) ? result._excluded.length : 0
                  console.log('QB Job Transactions debug: excluded count =', excludedCount)
                  alert(`Debug: excluded count = ${excludedCount}. Full response in Network tab (qb-get-job-transactions).`)
                }
              }}
              variant="ghost"
              size="sm"
              className="w-full text-xs text-gray-500 mt-1"
            >
              Debug QB fetch
            </Button>
          </CardContent>
        </Card>
      )}
      {trigger === 'button' && (
        <Button onClick={handleOpen} variant="outline" className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Import from QuickBooks
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogDescription className="sr-only">
            {step === 'list' ? 'Import from QuickBooks: view pending transactions or reconcile to QBO.' : 'Allocate selected transaction to a project and trade.'}
          </DialogDescription>
          <DialogHeader>
            <DialogTitle>
              {step === 'list' ? 'Import from QuickBooks' : 'Allocate to project'}
            </DialogTitle>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Button
                variant={view === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('pending')}
              >
                Pending
              </Button>
              <Button
                variant={view === 'reconcile' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('reconcile')}
              >
                <Calculator className="w-3 h-3 mr-1" />
                Reconcile to QBO
              </Button>
              <Button
                variant={view === 'labor' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('labor')}
              >
                <Briefcase className="w-3 h-3 mr-1" />
                Import labor
              </Button>
            </div>
          </DialogHeader>

          {view === 'reconcile' && (
            <div className="overflow-auto flex-1 min-h-0 border-t pt-4">
              <p className="text-sm text-gray-600 mb-3">
                Compare app actuals to your QuickBooks report. Enter the total from the QBO Project Profitability (or job cost) report in the &quot;QBO total&quot; column to see variance.
              </p>
              <p className="text-xs text-gray-500 mb-2">
                &quot;Fill from QBO&quot; fills the column from the same transactions we sync (Bills, Purchases, etc.). It will match the app if everything is imported; for the official number from the QBO report, enter it manually.
              </p>
              <div className="flex items-center gap-2 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingFillQBO}
                  onClick={async () => {
                    setLoadingFillQBO(true)
                    setError(null)
                    try {
                      const res = await getQBJobTransactions(undefined, true)
                      const { projectTotals: totals, error: err } = res
                      console.log('Fill from QBO response:', { hasProjectTotals: !!totals, projectTotalsKeys: totals ? Object.keys(totals) : [], sampleProject: projects[0] ? { name: projects[0].name, qbProjectId: projects[0].qbProjectId } : null })
                      if (err) {
                        setError(err)
                        return
                      }
                      if (totals && typeof totals === 'object') {
                        const next: Record<string, string> = {}
                        const keys = Object.keys(totals)
                        for (const p of projects) {
                          const qbId = p.qbProjectId ?? (p as { qb_project_id?: string }).qb_project_id
                          const name = (p.name ?? '').trim()
                          const nameLower = name.toLowerCase()
                          let amount: number | undefined =
                            (qbId && totals[qbId]) ? totals[qbId]
                            : (name && totals[name]) ? totals[name]
                            : (name && totals[nameLower]) ? totals[nameLower]
                            : undefined
                          if (amount == null && name) {
                            const match = keys.find((k) => k === name || k.toLowerCase() === nameLower || k.endsWith(': ' + name) || k.endsWith(':' + name))
                            if (match) amount = totals[match]
                          }
                          if (amount != null && !Number.isNaN(amount)) {
                            next[p.id] = amount.toFixed(2)
                          }
                        }
                        const filledCount = Object.keys(next).length
                        setReconcileQBOTotals((prev) => ({ ...prev, ...next }))
                        if (filledCount === 0 && keys.length > 0) {
                          setError('QBO totals returned but no project names matched. Check console for keys.')
                        } else if (filledCount === 0 && keys.length === 0) {
                          setError('No QBO project totals in response. Redeploy the qb-get-job-transactions edge function.')
                        } else {
                          setError(null)
                        }
                      } else {
                        setError('No QBO project totals in response. Redeploy the qb-get-job-transactions edge function.')
                      }
                    } finally {
                      setLoadingFillQBO(false)
                    }
                  }}
                >
                  {loadingFillQBO ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Fill from QBO
                </Button>
              </div>
              {loadingReconcile && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              )}
              {!loadingReconcile && projects.length > 0 && (
                <div className="border rounded overflow-auto max-h-[50vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Project</th>
                        <th className="text-right p-2">App total</th>
                        <th className="text-right p-2 w-36">QBO total (enter)</th>
                        <th className="text-right p-2">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => {
                        const appTotal = reconcileAppTotals[p.id] ?? 0
                        const qboStr = reconcileQBOTotals[p.id] ?? ''
                        const qboNum = qboStr === '' ? null : parseFloat(qboStr.replace(/[,$]/g, ''))
                        const variance = qboNum != null && !Number.isNaN(qboNum) ? qboNum - appTotal : null
                        const isLoadingVariance = loadingVariance === p.id
                        return (
                          <tr key={p.id} className="border-t hover:bg-gray-50">
                            <td className="p-2 font-medium">
                              <a
                                href={projectActualsUrl(p.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                {p.name}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </td>
                            <td className="p-2 text-right">{formatCurrency(appTotal)}</td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="0.00"
                                className="w-full text-right border rounded px-2 py-1 text-sm"
                                value={qboStr}
                                onChange={(e) => setQBOTotal(p.id, e.target.value)}
                              />
                            </td>
                            <td className="p-2 text-right">
                              {variance != null ? (
                                <button
                                  type="button"
                                  onClick={() => handleVarianceClick(p, variance)}
                                  disabled={isLoadingVariance}
                                  className={`font-medium text-left hover:bg-gray-100 rounded px-1 -mx-1 ${variance > 0 ? 'text-amber-600' : variance < 0 ? 'text-green-600' : 'text-gray-600'}`}
                                  title="Click to find entries that match this variance"
                                >
                                  {isLoadingVariance ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <Search className="w-3.5 h-3.5 inline mr-0.5 opacity-70" />}
                                  {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                                </button>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {varianceTip && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                  <p className="font-medium text-blue-900 mb-1">
                    Variance {varianceTip.variance > 0 ? '+' : ''}{formatCurrency(varianceTip.variance)} on {varianceTip.projectName}
                  </p>
                  {varianceTip.entries.length > 0 ? (
                    <>
                      <p className="text-blue-800 mb-1">Entry(ies) matching this amount (possible misassignment):</p>
                      <ul className="list-disc list-inside text-blue-800 space-y-0.5 mb-2">
                        {varianceTip.entries.map((e, i) => (
                          <li key={i}>{e.type}: {e.description} — {formatCurrency(e.amount)}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-blue-700">No single entry matches this variance. Check multiple entries or the other project.</p>
                  )}
                  <a
                    href={projectActualsUrl(varianceTip.projectId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                  >
                    Open project actuals <ExternalLink className="w-3 h-3" />
                  </a>
                  <button type="button" onClick={() => setVarianceTip(null)} className="ml-3 text-blue-600 hover:underline">
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {view === 'labor' && (
            <div className="overflow-auto flex-1 min-h-0 border-t pt-4 space-y-5">
              {error && (
                <div className="p-2 rounded bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">{error}</p>
                </div>
              )}
              {/* Configuration */}
              <section className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Configuration</p>
                <p className="text-sm text-gray-600">
                  Wage allocation account IDs from your QBO Chart of Accounts (one per line or comma-separated). Saved automatically when you click Save.
                </p>
                <textarea
                  className="w-full min-h-[80px] border rounded px-3 py-2 text-sm font-mono"
                  placeholder="e.g. 1, 2, 3 (one per line or comma-separated)"
                  value={laborWageAccountIds}
                  onChange={(e) => setLaborWageAccountIds(e.target.value)}
                />
                <p className="text-sm text-gray-600 mt-2">
                  Account IDs with no burden (e.g. 1099 subcontractors). Burden % will not be applied to these wage accounts.
                </p>
                <textarea
                  className="w-full min-h-[60px] border rounded px-3 py-2 text-sm font-mono"
                  placeholder="e.g. 198"
                  value={laborNoBurdenAccountIds}
                  onChange={(e) => setLaborNoBurdenAccountIds(e.target.value)}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    disabled={laborSaving}
                    onClick={async () => {
                      setLaborSaving(true)
                      setError(null)
                      const ids = laborWageAccountIds
                        .split(/[\n,]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                      const noBurdenIds = laborNoBurdenAccountIds
                        .split(/[\n,]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                      const result = await saveQboWageConfig(ids, noBurdenIds)
                      setLaborSaving(false)
                      if (result.ok) {
                        setError(null)
                        loadLaborConfigAndBatches()
                      } else setError(result.error ?? 'Failed to save wage account config')
                    }}
                  >
                    {laborSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Save settings
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={laborAccountsLoading}
                    onClick={async () => {
                      setLaborAccountPickerOpen(true)
                      setLaborAccountSearch('')
                      const ids = laborWageAccountIds
                        .split(/[\n,]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                      setSelectedWageAccountIds(new Set(ids))
                      setLaborAccountsLoading(true)
                      setLaborAccountsFromQB([])
                      const { accounts, error: err } = await getQBChartOfAccounts()
                      setLaborAccountsLoading(false)
                      if (err) setError(err)
                      else setLaborAccountsFromQB(accounts)
                    }}
                  >
                    {laborAccountsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
                    Select from QuickBooks
                  </Button>
                  <span className="text-sm text-gray-500">
                    {laborWageAccountCount} wage account{laborWageAccountCount !== 1 ? 's' : ''} configured
                    {laborNoBurdenAccountCount > 0 && (
                      <>, {laborNoBurdenAccountCount} no-burden (e.g. 1099)</>
                    )}
                  </span>
                </div>
              </section>

              {/* Default burden % */}
              <section className="space-y-2 border-t pt-4">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Default burden %</p>
                <p className="text-sm text-gray-600">
                  Applied to imported wages as estimated payroll burden (taxes, benefits, etc.). Used when you run Import labor.
                </p>
                {laborBurdenPercent != null && laborBurdenEffectiveDate && (
                  <p className="text-sm text-gray-700">
                    Current: <strong>{laborBurdenPercent}%</strong> effective {laborBurdenEffectiveDate}
                  </p>
                )}
                {laborBurdenPercent == null && !laborBurdenEffectiveDate && (
                  <p className="text-sm text-gray-500">Not set — imports will use 0% burden.</p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="block text-xs mb-1">Burden %</Label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="w-24 border rounded px-2 py-1.5 text-sm"
                      placeholder="e.g. 25"
                      value={laborBurdenPercentInput}
                      onChange={(e) => setLaborBurdenPercentInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="block text-xs mb-1">Effective date</Label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1.5 text-sm"
                      value={laborBurdenDateInput}
                      onChange={(e) => setLaborBurdenDateInput(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={laborBurdenSaving}
                    onClick={async () => {
                      const pct = laborBurdenPercentInput.trim() === '' ? null : parseFloat(laborBurdenPercentInput)
                      const date = laborBurdenDateInput.trim() || new Date().toISOString().slice(0, 10)
                      if (pct == null || Number.isNaN(pct) || pct < 0 || pct > 100) {
                        setError('Enter a burden % between 0 and 100')
                        return
                      }
                      setLaborBurdenSaving(true)
                      setError(null)
                      const ok = await setLaborBurdenGlobalRate(pct, date)
                      setLaborBurdenSaving(false)
                      if (ok) {
                        setError(null)
                        loadLaborConfigAndBatches()
                      } else setError('Failed to save burden rate')
                    }}
                  >
                    {laborBurdenSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Save burden rate
                  </Button>
                </div>
              </section>

              {/* Wage account picker dialog */}
              <Dialog open={laborAccountPickerOpen} onOpenChange={setLaborAccountPickerOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Select wage allocation accounts</DialogTitle>
                    <DialogDescription>
                      Choose QuickBooks accounts that represent payroll/wage expenses (e.g. 7100 Payroll Expenses: Employee Payroll, 7125 Subcontractors ADP). Expense, Other Expense, and COGS accounts are shown; search by number or name.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2 flex-1 min-h-0">
                    <input
                      type="text"
                      placeholder="Search by number or name..."
                      className="border rounded px-2 py-1.5 text-sm w-full"
                      value={laborAccountSearch}
                      onChange={(e) => setLaborAccountSearch(e.target.value)}
                    />
                    <div className="border rounded overflow-auto flex-1 min-h-0 text-sm">
                      {(() => {
                        const search = laborAccountSearch.trim().toLowerCase()
                        const filtered = laborAccountsFromQB.filter((a) => {
                          const isRelevantType =
                            a.accountType === 'Expense' ||
                            a.accountType === 'Other Expense' ||
                            a.accountType === 'Cost of Goods Sold'
                          const matchesSearch =
                            !search ||
                            (a.accountNumber && a.accountNumber.toLowerCase().includes(search)) ||
                            a.name.toLowerCase().includes(search)
                          return isRelevantType && matchesSearch
                        })
                        return (
                          <>
                            {filtered.map((a) => (
                              <label
                                key={a.id}
                                className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedWageAccountIds.has(a.id)}
                                  onChange={(e) => {
                                    setSelectedWageAccountIds((prev) => {
                                      const next = new Set(prev)
                                      if (e.target.checked) next.add(a.id)
                                      else next.delete(a.id)
                                      return next
                                    })
                                  }}
                                />
                                <span className="font-mono text-gray-600">{a.accountNumber || '—'}</span>
                                <span>{a.name}</span>
                                <span className="text-xs text-gray-400">({a.accountType})</span>
                              </label>
                            ))}
                            {laborAccountsFromQB.length > 0 && filtered.length === 0 && (
                              <p className="p-3 text-gray-500 text-sm">No accounts match your search.</p>
                            )}
                          </>
                        )
                      })()}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setLaborAccountPickerOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          const ids = Array.from(selectedWageAccountIds)
                          setLaborWageAccountIds(ids.join('\n'))
                          const noBurdenIds = laborNoBurdenAccountIds
                            .split(/[\n,]+/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                          const result = await saveQboWageConfig(ids, noBurdenIds)
                          setLaborAccountPickerOpen(false)
                          if (result.ok) {
                            setError(null)
                            loadLaborConfigAndBatches()
                          } else setError(result.error ?? 'Failed to save wage account config')
                        }}
                      >
                        Use selected as wage accounts
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Execution: date range, preview, confirm */}
              <section className="space-y-3 border-t pt-4">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Import</p>
                <p className="text-sm text-gray-600">
                  Choose a date range, preview matching Journal Entry lines, then confirm to import.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="block text-xs mb-1">From</Label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1.5 text-sm"
                      value={laborDateStart}
                      onChange={(e) => { setLaborDateStart(e.target.value); setLaborPreview(null) }}
                    />
                  </div>
                  <div>
                    <Label className="block text-xs mb-1">To</Label>
                    <input
                      type="date"
                      className="border rounded px-2 py-1.5 text-sm"
                      value={laborDateEnd}
                      onChange={(e) => { setLaborDateEnd(e.target.value); setLaborPreview(null) }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={laborPreviewLoading || !laborDateStart || !laborDateEnd || laborWageAccountCount === 0}
                    onClick={async () => {
                      setLaborPreviewLoading(true)
                      setLaborPreview(null)
                      setError(null)
                      const result = await previewLaborFromQBO(laborDateStart, laborDateEnd)
                      setLaborPreviewLoading(false)
                      if (result.error) setError(result.error)
                      else if (result.success)
                        setLaborPreview({
                          journalEntriesFound: result.journalEntriesFound ?? 0,
                          matchingWageLines: result.matchingWageLines ?? 0,
                          totalGrossWages: result.totalGrossWages ?? 0,
                          distinctProjectsAffected: result.distinctProjectsAffected ?? 0,
                        })
                    }}
                  >
                    {laborPreviewLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    disabled={laborImporting || !laborDateStart || !laborDateEnd || laborWageAccountCount === 0}
                    onClick={async () => {
                      setLaborImporting(true)
                      setLaborResult(null)
                      setError(null)
                      const result = await importLaborFromQBO(laborDateStart, laborDateEnd)
                      setLaborImporting(false)
                      if (result.error) setError(result.error)
                      else if (result.success) {
                        setLaborResult({
                          rowCount: result.rowCount ?? 0,
                          totalWages: result.totalWages ?? 0,
                          errorCount: result.errorCount ?? 0,
                        })
                        if ((result.rowCount ?? 0) === 0 && result.firstError) setError(result.firstError)
                        else setError(null)
                        setLaborPreview(null)
                        loadLaborConfigAndBatches()
                        onSuccess?.()
                      }
                    }}
                  >
                    {laborImporting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                    Confirm Import
                  </Button>
                </div>
                {laborPreview && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
                    <p className="font-medium mb-1">Preview</p>
                    <ul className="space-y-0.5 text-blue-800">
                      <li>Journal entries found: {laborPreview.journalEntriesFound}</li>
                      <li>Matching wage lines (with project): {laborPreview.matchingWageLines}</li>
                      <li>Total gross wages: {formatCurrency(laborPreview.totalGrossWages)}</li>
                      <li>Distinct projects affected: {laborPreview.distinctProjectsAffected}</li>
                    </ul>
                    {laborPreview.journalEntriesFound === 0 && (
                      <p className="mt-2 text-blue-700 text-xs">
                        No journal entries in QuickBooks for this date range. Try a different range or confirm JEs exist in QBO.
                      </p>
                    )}
                  </div>
                )}
                {laborResult && (
                  <div className={`p-3 rounded text-sm ${laborResult.rowCount > 0 ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                    {laborResult.rowCount > 0 ? (
                      <>
                        Imported {laborResult.rowCount} row(s), {formatCurrency(laborResult.totalWages)} total wages.
                        {laborResult.errorCount > 0 && ` ${laborResult.errorCount} line(s) skipped (no matching project).`}
                      </>
                    ) : (
                      <>No rows imported.{laborResult.errorCount > 0 && ` ${laborResult.errorCount} line(s) had errors.`} Check the error message above.</>
                    )}
                  </div>
                )}
              </section>

              {/* Last import summary */}
              {laborBatches.length > 0 && (
                <section className="border-t pt-4">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Last import</p>
                  {(() => {
                    const last = laborBatches[0]
                    return (
                      <div className="text-sm text-gray-700">
                        <span>
                          {last.periodStart}–{last.periodEnd}: {last.rowCount} rows, {formatCurrency(last.totalWages)}
                          {last.errorCount > 0 && ` (${last.errorCount} skipped)`}
                        </span>
                        <span className={last.status === 'failed' ? ' text-red-600 font-medium' : ''}>
                          {' '}
                          — {last.status === 'failed' ? 'Failed' : 'Completed'}
                        </span>
                      </div>
                    )
                  })()}
                  {laborBatches.length > 1 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Previous: {laborBatches.slice(1, 4).map((b) => `${b.periodStart}–${b.periodEnd}`).join('; ')}
                    </p>
                  )}
                </section>
              )}
            </div>
          )}

          {view === 'pending' && step === 'list' && (
            <div className="overflow-auto flex-1 min-h-0">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeUnassigned}
                    onChange={(e) => setIncludeUnassigned(e.target.checked)}
                  />
                  Include unassigned from QuickBooks
                </label>
                <Button variant="outline" size="sm" onClick={() => loadPending()} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-500"
                  disabled={loading}
                  onClick={async () => {
                    const result = await getQBJobTransactions(true, includeUnassigned)
                    const d = result._debug as Record<string, unknown> | undefined
                    if (d) {
                      console.log('QB full _debug:', d)
                      if (d.earlyReturn === true) {
                        const msg =
                          (result.error ?? 'No accounts/classes matched') +
                          ' QuickBooks connection may be wrong company, or account/class names don’t match our patterns. See console for yourAccounts / yourClasses.'
                        alert(msg)
                        return
                      }
                      const counts = d.counts as { beforeProjectFilter?: number; afterProjectFilter?: number; pendingCount?: number } | undefined
                      console.log(
                        'QB debug counts:',
                        'beforeProjectFilter:', counts?.beforeProjectFilter,
                        '| afterProjectFilter:', counts?.afterProjectFilter,
                        '| pendingCount:', counts?.pendingCount
                      )
                      if (counts) console.log('QB debug counts (object):', JSON.stringify(counts))
                      console.log('QB checksSummary (search for check # or vendor):', d.checksSummary)
                      const checksFetched = (d as { checksFetched?: number }).checksFetched
                      const checkQueryOk = (d as { checkQueryOk?: boolean }).checkQueryOk
                      const checkQueryStatus = (d as { checkQueryStatus?: number }).checkQueryStatus
                      const checkFault = (d as { checkFault?: unknown }).checkFault
                      const checkResponseKeys = (d as { checkResponseKeys?: string[] }).checkResponseKeys
                      console.log('QB Check query: ok =', checkQueryOk, 'status =', checkQueryStatus, 'checksFetched =', checksFetched)
                      if (checkFault) console.log('QB Check query Fault (API error):', checkFault)
                      const checkErrorBody = (d as { checkErrorBody?: unknown }).checkErrorBody
                      const checkErrorText = (d as { checkErrorText?: string }).checkErrorText
                      if (checkErrorBody) console.log('QB Check query 400 error body:', checkErrorBody)
                      if (checkErrorText) console.log('QB Check query 400 error (raw text):', checkErrorText)
                      if (checkResponseKeys?.length !== undefined) console.log('QB Check response keys:', checkResponseKeys)
                      const cs = (d.checksSummary ?? []) as Array<{ DocNumber?: string; vendor?: string; status?: string }>
                      const johnny = cs.filter((c) => (c.vendor ?? '').toLowerCase().includes('johnny'))
                      if (johnny.length > 0) console.log('Checks from Johnny:', johnny)
                      const msg = counts
                        ? `beforeProject: ${counts.beforeProjectFilter ?? 0}, afterProject: ${counts.afterProjectFilter ?? 0}, pending: ${counts.pendingCount ?? 0}. See console for checksSummary.`
                        : 'See console for _debug.'
                      alert(msg)
                    } else {
                      alert('No debug data. Check console/network for errors.')
                    }
                  }}
                >
                  Debug fetch
                </Button>
              </div>
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              )}
              {error && (
                <div className="mb-2 space-y-2">
                  <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">{error}</p>
                  {help && (
                    <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-200 whitespace-pre-wrap">{help}</p>
                  )}
                  {(yourAccounts.length > 0 || yourClasses.length > 0) && (
                    <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 space-y-1">
                      {yourAccounts.length > 0 && (
                        <p><strong>Your QuickBooks accounts:</strong> {yourAccounts.map(a => `${a.name} (${a.type})`).join(', ')}</p>
                      )}
                      {yourClasses.length > 0 && (
                        <p><strong>Your QuickBooks classes:</strong> {yourClasses.join(', ')}</p>
                      )}
                      <p className="mt-1">Rename or add an account/class with “Materials” or “Job Materials” and/or “Subcontractor” so transactions can be found.</p>
                    </div>
                  )}
                </div>
              )}
              {!loading && transactions.length === 0 && !error && (
                <p className="text-sm text-gray-500 py-4">No pending transactions. Add bills or expenses to Job Materials, Subcontractor Expense, or Utilities in QuickBooks.</p>
              )}
              {!loading && transactions.length > 0 && (
                <div className="border rounded overflow-auto max-h-[50vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Vendor</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Doc #</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-left p-2">Account</th>
                        <th className="text-left p-2">QB Project</th>
                        <th className="text-left p-2 min-w-[120px]">Description</th>
                        <th className="w-24 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((txn) => (
                        <tr key={`${txn.qbTransactionType}:${txn.qbTransactionId}:${txn.qbLineId ?? ''}`} className="border-t hover:bg-gray-50">
                          <td className="p-2">{txn.vendorName}</td>
                          <td className="p-2">{txn.txnDate}</td>
                          <td className="p-2">{txn.docNumber || '—'}</td>
                          <td className="p-2 text-right font-medium">
                            {txn.amount < 0 ? '-' : ''}${Math.abs(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2">{txn.accountType}</td>
                          <td className="p-2">{txn.qbProjectName || '—'}</td>
                          <td className="p-2 max-w-[200px] truncate" title={txn.description || undefined}>
                            {txn.description || '—'}
                          </td>
                          <td className="p-2">
                            <Button size="sm" variant="outline" onClick={() => handleSelectTransaction(txn)}>
                              Allocate
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {view === 'pending' && step === 'allocate' && selectedTxn && (
            <div className="space-y-4 overflow-auto">
              <div className="p-3 bg-gray-50 rounded text-sm space-y-1">
                <div>
                  <strong>{selectedTxn.vendorName}</strong> · {selectedTxn.txnDate} · {selectedTxn.docNumber || '—'} · ${Math.abs(selectedTxn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                {selectedTxn.description && (
                  <div className="text-gray-700">Description: {selectedTxn.description}</div>
                )}
              </div>
              <div className="grid gap-3">
                <div>
                  <Label>App project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {mappedProject?.id === p.id && ' (matches QB)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={entryType} onValueChange={(v: 'material' | 'subcontractor') => setEntryType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="material">
                        <span className="flex items-center gap-2"><Package className="w-3 h-3" /> Material</span>
                      </SelectItem>
                      <SelectItem value="subcontractor">
                        <span className="flex items-center gap-2"><Users className="w-3 h-3" /> Subcontractor</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {tradesInCategory.length > 0 && (
                  <>
                    <div>
                      <Label>Estimate line (optional)</Label>
                      <Select value={tradeId || '__none__'} onValueChange={(v) => setTradeId(v === '__none__' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {tradesInCategory.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {subItems.length > 0 && (
                        <div>
                        <Label>Sub-item (optional)</Label>
                        <Select value={subItemId || '__none__'} onValueChange={(v) => setSubItemId(v === '__none__' ? '' : v)}>
                          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {subItems.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => { setStep('list'); setSelectedTxn(null) }}>
                  Back
                </Button>
                <Button onClick={handleAllocate} disabled={allocating || !projectId || !category}>
                  {allocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Create entry
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
