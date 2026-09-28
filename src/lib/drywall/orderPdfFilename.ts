import { todayKey } from '@/lib/dateFormat'

/**
 * `Order-{ProjectName}-{YYYY-MM-DD}.pdf`
 *
 * The stamp is the org's calendar day (America/New_York), not UTC. A file
 * generated Tuesday evening should not be named Wednesday.
 */
export function orderPdfFilename(projectName: string): string {
  const safeName = (projectName || 'Project').replace(/[^a-z0-9]/gi, '-')
  return `Order-${safeName}-${todayKey()}.pdf`
}
