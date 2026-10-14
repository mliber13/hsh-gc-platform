// Email a purchase order to its supplier and mark it sent. Moved from the retired Order page
// (docs/DRYWALL_PROJECT_IA.md §13) onto each delivery's order sheet. The supplier's corporate
// IT blocks the share link, so email is the reliable path; with no email on file the order can
// still be marked sent.

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchFieldTakeoff, markOrderStatus } from '@/services/drywallProjectsService'
import { sendSupplierOrderEmail } from '@/services/supplierOrdersService'
import type { DrywallOrder, DrywallProject } from '@/types/drywall'

interface SendOrderToSupplierDialogProps {
  projectId: string
  project: Pick<DrywallProject, 'name' | 'address' | 'client'>
  /** The order to send; null closes the dialog. */
  order: DrywallOrder | null
  /** The supplier's email on file, or '' when there is none. */
  recipientEmail: string
  loadedAt: string
  onClose: () => void
  /** Called with the project's new timestamp after the order is marked sent. */
  onSent: (nextLoadedAt: string) => void
}

export function SendOrderToSupplierDialog({
  projectId,
  project,
  order,
  recipientEmail,
  loadedAt,
  onClose,
  onSent,
}: SendOrderToSupplierDialogProps) {
  const [sending, setSending] = useState(false)

  const send = async (withEmail: boolean) => {
    if (!order) return
    setSending(true)
    try {
      let sentTo = ''
      if (withEmail) {
        // The PDF attached is the field materials list by area, with stocking notes.
        const takeoff = await fetchFieldTakeoff(projectId).catch(() => null)
        sentTo = (await sendSupplierOrderEmail(projectId, project, order, takeoff)).to
      }
      const next = await markOrderStatus(projectId, order.id, 'sent', loadedAt)
      toast.success(withEmail ? `PO emailed to ${sentTo || 'the supplier'} and marked sent` : 'Order marked sent')
      onSent(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send order')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open={Boolean(order)}
      onOpenChange={(open) => {
        if (!open && !sending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send order to supplier</DialogTitle>
          <DialogDescription>
            {recipientEmail ? (
              <>
                Email this purchase order (PDF attachment + full order with area/stocking notes) to{' '}
                <span className="font-medium text-foreground">{recipientEmail}</span> and mark it sent.
              </>
            ) : (
              <>
                {order?.supplier || 'This supplier'} has no email on file. Add one under Suppliers to
                email the PO, or mark the order sent without emailing.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          {recipientEmail ? (
            <Button type="button" onClick={() => void send(true)} disabled={sending}>
              <Mail className="mr-2 h-4 w-4" />
              {sending ? 'Sending…' : 'Email PO & mark sent'}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => void send(false)} disabled={sending}>
              {sending ? 'Saving…' : 'Mark sent without email'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
