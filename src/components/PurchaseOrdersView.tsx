// ============================================================================
// Purchase Orders – list and detail for a project; Issue PO (number, date)
// ============================================================================

import React, { useState, useEffect } from 'react'
import { getPOsForProjectInDB, issuePOInDB } from '@/services/supabaseService'
import { exportPOToPDF } from '@/services/poPdfService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, FileText, CheckCircle, Clock, Download } from 'lucide-react'
import { usePageTitle } from '@/contexts/PageTitleContext'

interface PurchaseOrdersViewProps {
  projectId: string
  projectName?: string
  onBack: () => void
}

interface POModel {
  id: string
  projectId: string
  subcontractorId: string
  subcontractorName: string | null
  poNumber: string | null
  status: string
  issuedAt: Date | null
  createdAt: Date
  updatedAt: Date
  lines: { id: string; description: string; quantity: number; unit: string; unitPrice: number; amount: number }[]
}

export function PurchaseOrdersView({ projectId, projectName, onBack }: PurchaseOrdersViewProps) {
  usePageTitle('Purchase Orders')
  const [pos, setPos] = useState<POModel[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPO, setSelectedPO] = useState<POModel | null>(null)
  const [showIssueForm, setShowIssueForm] = useState(false)
  const [issuePoNumber, setIssuePoNumber] = useState('')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0])
  const [issuing, setIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const data = await getPOsForProjectInDB(projectId)
      setPos(data as POModel[])
      setLoading(false)
    }
    load()
  }, [projectId])

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const formatDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString() : '—')

  const poTotal = (po: POModel) => po.lines.reduce((s, l) => s + l.amount, 0)

  const handleIssue = async () => {
    if (!selectedPO || !issuePoNumber.trim()) {
      setIssueError('Please enter a PO number.')
      return
    }
    setIssueError(null)
    setIssuing(true)
    try {
      const ok = await issuePOInDB(selectedPO.id, issuePoNumber.trim(), new Date(issueDate))
      if (ok) {
        const updated = await getPOsForProjectInDB(projectId)
        setPos(updated as POModel[])
        setSelectedPO(updated.find((p: POModel) => p.id === selectedPO.id) as POModel)
        setShowIssueForm(false)
        setIssuePoNumber('')
        setIssueDate(new Date().toISOString().split('T')[0])
      } else {
        setIssueError('Failed to issue PO.')
      }
    } catch (e) {
      setIssueError(e instanceof Error ? e.message : 'Failed to issue PO')
    } finally {
      setIssuing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Project
        </button>
      </div>

      {projectName && <p className="text-sm text-muted-foreground">{projectName}</p>}

        {loading ? (
          <Card className="border-border/60 bg-card/50">
            <CardContent className="py-12 text-center">
              <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Loading POs…</p>
            </CardContent>
          </Card>
        ) : selectedPO ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedPO(null); setShowIssueForm(false) }}>
                ← Back to list
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => exportPOToPDF(selectedPO, projectName)}>
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
                {selectedPO.status === 'draft' && !showIssueForm && (
                  <Button onClick={() => setShowIssueForm(true)}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Issue PO
                  </Button>
                )}
              </div>
            </div>

            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {selectedPO.subcontractorName ?? 'Subcontractor'}
                  {selectedPO.poNumber && (
                    <span className="text-base font-normal text-muted-foreground">— {selectedPO.poNumber}</span>
                  )}
                </CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className={selectedPO.status === 'issued' ? 'text-sky-500 font-medium' : 'text-amber-500'}>
                    {selectedPO.status === 'issued' ? 'Issued' : 'Draft'}
                  </span>
                  {selectedPO.issuedAt && <span>Issued: {formatDate(selectedPO.issuedAt)}</span>}
                  <span>Created: {formatDate(selectedPO.createdAt)}</span>
                </div>
              </CardHeader>
              <CardContent>
                {showIssueForm && selectedPO.status === 'draft' && (
                  <div className="mb-6 space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
                    <h3 className="font-semibold text-foreground">Issue this PO</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="po-number">PO Number *</Label>
                        <Input
                          id="po-number"
                          value={issuePoNumber}
                          onChange={(e) => { setIssuePoNumber(e.target.value); setIssueError(null) }}
                          placeholder="e.g. PO-2025-001"
                        />
                      </div>
                      <div>
                        <Label htmlFor="issue-date">Issue Date</Label>
                        <Input
                          id="issue-date"
                          type="date"
                          value={issueDate}
                          onChange={(e) => setIssueDate(e.target.value)}
                        />
                      </div>
                    </div>
                    {issueError && <p className="text-sm text-destructive">{issueError}</p>}
                    <div className="flex gap-2">
                      <Button onClick={handleIssue} disabled={issuing}>
                        {issuing ? 'Issuing…' : 'Issue PO'}
                      </Button>
                      <Button variant="outline" onClick={() => { setShowIssueForm(false); setIssueError(null) }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-border/60 bg-card/50 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-muted/30 text-xs font-medium text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="text-left p-2 border-r border-border/60">Description</th>
                      <th className="text-right p-2 border-r border-border/60">Qty</th>
                      <th className="text-right p-2 border-r border-border/60">Unit</th>
                      <th className="text-right p-2 border-r border-border/60">Unit $</th>
                      <th className="text-right p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPO.lines.map((line) => (
                      <tr key={line.id} className="border-b border-border/60 bg-card transition-colors hover:bg-muted/20">
                        <td className="p-2 border-r border-border/60">{line.description}</td>
                        <td className="p-2 text-right border-r border-border/60">{line.quantity}</td>
                        <td className="p-2 text-right border-r border-border/60">{line.unit}</td>
                        <td className="p-2 text-right border-r border-border/60 tabular-nums text-sky-600 dark:text-sky-400">{formatCurrency(line.unitPrice)}</td>
                        <td className="p-2 text-right font-medium tabular-nums">{formatCurrency(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <p className="text-right font-semibold mt-2 tabular-nums text-rose-600 dark:text-rose-400">
                  Total: {formatCurrency(poTotal(selectedPO))}
                </p>
              </CardContent>
            </Card>
          </section>
        ) : (
          <>
            {pos.length === 0 ? (
              <Card className="border-border/60 bg-card/50">
                <CardContent className="py-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
                  <p>No purchase orders yet.</p>
                  <p className="text-sm mt-1 text-muted-foreground">Create a PO from the Estimate (Create PO) and it will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pos.map((po) => (
                  <Card
                    key={po.id}
                    className="cursor-pointer border-border/60 bg-card/50 transition-colors hover:bg-muted/20"
                    onClick={() => setSelectedPO(po)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {po.status === 'issued' ? (
                            <CheckCircle className="w-5 h-5 text-sky-500" />
                          ) : (
                            <Clock className="w-5 h-5 text-amber-500" />
                          )}
                          <span className="font-medium">{po.subcontractorName ?? 'Subcontractor'}</span>
                          {po.poNumber && (
                            <span className="text-muted-foreground text-sm">{po.poNumber}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className={po.status === 'issued' ? 'text-sky-500' : 'text-amber-500'}>
                            {po.status === 'issued' ? 'Issued' : 'Draft'}
                          </span>
                          <span className="font-medium tabular-nums">{formatCurrency(poTotal(po))}</span>
                          {po.issuedAt && (
                            <span className="text-muted-foreground">{formatDate(po.issuedAt)}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
    </div>
  )
}
