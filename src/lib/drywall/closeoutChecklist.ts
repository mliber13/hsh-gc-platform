/**
 * The close-out checklist on Financials (Mark, 2026-10-14): what has to be true before a job is
 * closed, checked from the data instead of from memory.
 *
 * Live dry run that day: 30 jobs at production-complete and 1 closed — jobs stall at close-out.
 * Of the 30, 4 had no accepted material bill, 2 no accepted invoice, 3 a change order still
 * waiting on an answer. Every check here is one of those, or one of the week's fixes (QuickBooks
 * bills on shared jobs, payroll labour split Drywall/GC).
 *
 * Three states, and only one of them stands between the job and closing:
 *   open      — a real loose end; closing with it open needs a deliberate confirm;
 *   heads_up  — worth a look, but legitimately fine (a job billed off-system, a shared job);
 *   done      — checked.
 */
export type CloseoutState = 'done' | 'open' | 'heads_up'

export type CloseoutLink = 'qb_materials' | 'qb_revenue' | 'change_orders' | 'payroll'

export interface CloseoutItem {
  key: string
  label: string
  state: CloseoutState
  detail: string
  link?: CloseoutLink
}

export interface CloseoutInput {
  productionComplete: boolean
  materialPending: number
  materialAccepted: number
  /** Cost that landed after production was marked complete; null before then. */
  afterProductionCost: number | null
  openChangeOrders: number
  invoicePending: number
  billedToDate: number
  remainingToBill: number | null
  overbilledAmount: number
  /** A GC-type project drywall also works on — payroll lines carry a Drywall/GC tag. */
  sharedWithGc: boolean
}

/** Billing within a dollar of the contract counts as billed in full — rounding, not money. */
const BILLING_TOLERANCE = 1

function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function buildCloseoutChecklist(input: CloseoutInput): CloseoutItem[] {
  const items: CloseoutItem[] = []

  items.push({
    key: 'production',
    label: 'Production complete',
    state: input.productionComplete ? 'done' : 'open',
    detail: input.productionComplete ? 'Marked complete' : 'The crew is still on the job',
  })

  items.push(
    input.materialPending > 0
      ? {
          key: 'material',
          label: 'Material bills reviewed',
          state: 'open',
          detail: `${plural(input.materialPending, 'QuickBooks bill')} waiting for review`,
          link: 'qb_materials',
        }
      : input.materialAccepted === 0
        ? {
            key: 'material',
            label: 'Material bills reviewed',
            state: 'heads_up',
            detail: 'No material bill on this job — supplied from stock, or not entered in QuickBooks yet?',
            link: 'qb_materials',
          }
        : {
            key: 'material',
            label: 'Material bills reviewed',
            state: 'done',
            detail: `${plural(input.materialAccepted, 'bill')} counted`,
          },
  )

  if (input.productionComplete && (input.afterProductionCost ?? 0) > 0) {
    items.push({
      key: 'after_production',
      label: 'Late costs checked',
      state: 'heads_up',
      detail: `${usd(input.afterProductionCost ?? 0)} landed after production was marked complete — make sure it belongs to this job`,
    })
  }

  items.push(
    input.openChangeOrders > 0
      ? {
          key: 'change_orders',
          label: 'Change orders settled',
          state: 'open',
          detail: `${plural(input.openChangeOrders, 'change order')} still waiting for an answer`,
          link: 'change_orders',
        }
      : { key: 'change_orders', label: 'Change orders settled', state: 'done', detail: 'Nothing waiting' },
  )

  items.push(billingItem(input))

  if (input.sharedWithGc) {
    items.push({
      key: 'shared_labor',
      label: 'Payroll split Drywall/GC',
      state: 'heads_up',
      detail: 'Shared with the GC — check this job’s payroll lines are tagged to the right side',
      link: 'payroll',
    })
  }

  return items
}

function billingItem(input: CloseoutInput): CloseoutItem {
  const base = { key: 'billing', label: 'Billed in full', link: 'qb_revenue' as const }
  if (input.invoicePending > 0) {
    return { ...base, state: 'open', detail: `${plural(input.invoicePending, 'invoice')} waiting for review` }
  }
  if (input.overbilledAmount > BILLING_TOLERANCE) {
    return { ...base, state: 'heads_up', detail: `Billed ${usd(input.overbilledAmount)} over the contract` }
  }
  if (input.remainingToBill == null) {
    return { ...base, state: 'heads_up', detail: 'No contract value to bill against' }
  }
  if (input.remainingToBill > BILLING_TOLERANCE) {
    return { ...base, state: 'open', detail: `${usd(input.remainingToBill)} left to bill` }
  }
  if (input.billedToDate <= 0) {
    return { ...base, state: 'open', detail: 'Nothing billed yet' }
  }
  return { ...base, state: 'done', detail: `${usd(input.billedToDate)} billed` }
}

export function openCloseoutItems(items: CloseoutItem[]): CloseoutItem[] {
  return items.filter((i) => i.state === 'open')
}
