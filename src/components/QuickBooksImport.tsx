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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Download, Package, Users, ArrowRight } from 'lucide-react'
import {
  getQBJobTransactions,
  type QBJobTransaction,
} from '@/services/quickbooksService'
import { getProjects_Hybrid, getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { fetchSubItemsForTrade } from '@/services/supabaseService'
import { addMaterialEntry_Hybrid, addSubcontractorEntry_Hybrid } from '@/services/actualsHybridService'
import { TRADE_CATEGORIES } from '@/types'
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
  const [open, setOpen] = useState(false)
  const [transactions, setTransactions] = useState<QBJobTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [subItems, setSubItems] = useState<SubItem[]>([])
  const [selectedTxn, setSelectedTxn] = useState<QBJobTransaction | null>(null)
  const [step, setStep] = useState<'list' | 'allocate'>('list')
  const [projectId, setProjectId] = useState<string>('')
  const [entryType, setEntryType] = useState<'material' | 'subcontractor'>('material')
  const [category, setCategory] = useState<string>('')
  const [tradeId, setTradeId] = useState<string>('')
  const [subItemId, setSubItemId] = useState<string>('')
  const [allocating, setAllocating] = useState(false)

  const [help, setHelp] = useState<string | null>(null)
  const [yourAccounts, setYourAccounts] = useState<{ name: string; type: string }[]>([])
  const [yourClasses, setYourClasses] = useState<string[]>([])
  const loadPending = async () => {
    setLoading(true)
    setError(null)
    setHelp(null)
    setYourAccounts([])
    setYourClasses([])
    const { transactions: list, error: err, help: helpMsg, yourAccounts: accounts, yourClasses: classes } = await getQBJobTransactions()
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

  useEffect(() => {
    if (open) {
      setError(null)
      setHelp(null)
      setYourAccounts([])
      setYourClasses([])
      setStep('list')
      setSelectedTxn(null)
      setProjectId(preSelectedProject?.id ?? '')
      setCategory('')
      setTradeId('')
      setSubItemId('')
      setTrades([])
      setSubItems([])
      loadPending()
      loadProjects()
    }
  }, [open, preSelectedProject?.id])

  const handleOpen = () => setOpen(true)
  const handleClose = () => {
    setOpen(false)
    setStep('list')
    setSelectedTxn(null)
  }

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

  const handleSelectTransaction = (txn: QBJobTransaction) => {
    setSelectedTxn(txn)
    setStep('allocate')
    setEntryType(txn.accountType === 'Job Materials' ? 'material' : 'subcontractor')
    setCategory('')
    setTradeId('')
    setSubItemId('')
    const mapped = projects.find((p) => (p as { qbProjectId?: string }).qbProjectId === txn.qbProjectId)
    setProjectId(preSelectedProject?.id ?? mapped?.id ?? '')
  }

  const handleAllocate = async () => {
    if (!selectedTxn || !projectId || !category) {
      alert('Please select project and category (trade).')
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
    ? projects.find((p) => (p as { qbProjectId?: string }).qbProjectId === selectedTxn.qbProjectId)
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
                console.log('QB Job Transactions debug:', result._debug)
                if (result._debug) {
                  alert('Debug info logged to console (F12 → Console). Check _debug for accounts, classes, and first Bill structure.')
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
          <DialogHeader>
            <DialogTitle>
              {step === 'list' ? 'Pending from QuickBooks' : 'Allocate to project'}
            </DialogTitle>
          </DialogHeader>

          {step === 'list' && (
            <div className="overflow-auto flex-1 min-h-0">
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
                <p className="text-sm text-gray-500 py-4">No pending transactions. Add bills or expenses to Job Materials or Subcontractor Expense in QuickBooks.</p>
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
                        <th className="w-24 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((txn) => (
                        <tr key={`${txn.qbTransactionType}:${txn.qbTransactionId}`} className="border-t hover:bg-gray-50">
                          <td className="p-2">{txn.vendorName}</td>
                          <td className="p-2">{txn.txnDate}</td>
                          <td className="p-2">{txn.docNumber || '—'}</td>
                          <td className="p-2 text-right font-medium">
                            {txn.amount < 0 ? '-' : ''}${Math.abs(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2">{txn.accountType}</td>
                          <td className="p-2">{txn.qbProjectName || '—'}</td>
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

          {step === 'allocate' && selectedTxn && (
            <div className="space-y-4 overflow-auto">
              <div className="p-3 bg-gray-50 rounded text-sm">
                <strong>{selectedTxn.vendorName}</strong> · {selectedTxn.txnDate} · {selectedTxn.docNumber || '—'} · ${Math.abs(selectedTxn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                  <Label>Category (trade)</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRADE_CATEGORIES).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {trades.length > 0 && (
                  <>
                    <div>
                      <Label>Estimate line (optional)</Label>
                      <Select value={tradeId || '__none__'} onValueChange={(v) => setTradeId(v === '__none__' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {trades.map((t) => (
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
