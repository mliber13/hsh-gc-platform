import { formatDistanceToNow } from 'date-fns'
import type { ProjectCrewReadState } from '@/services/commsReadStateService'

export function readersForCommsEntry(
  entryAt: string,
  crewReadState: ProjectCrewReadState[],
): ProjectCrewReadState[] {
  const entryMs = new Date(entryAt).getTime()
  if (Number.isNaN(entryMs)) return []

  return crewReadState
    .filter((reader) => {
      const readMs = new Date(reader.lastReadAt).getTime()
      return !Number.isNaN(readMs) && readMs >= entryMs
    })
    .sort(
      (a, b) => new Date(a.lastReadAt).getTime() - new Date(b.lastReadAt).getTime(),
    )
}

export function formatCommsReadReceiptLabel(readers: ProjectCrewReadState[]): string | null {
  if (readers.length === 0) return null

  const earliestMs = new Date(readers[0].lastReadAt).getTime()
  const relative = formatDistanceToNow(new Date(earliestMs), { addSuffix: true })

  if (readers.length === 1) {
    return `Seen by ${readers[0].userName} · ${relative}`
  }
  if (readers.length === 2) {
    return `Seen by ${readers[0].userName} + ${readers[1].userName} · ${relative}`
  }
  return `Seen by ${readers[0].userName} + ${readers.length - 1} others · ${relative}`
}

export function formatCommsReadReceiptTooltip(readers: ProjectCrewReadState[]): string {
  return readers
    .map((reader) => {
      const relative = formatDistanceToNow(new Date(reader.lastReadAt), { addSuffix: true })
      return `${reader.userName} — ${relative}`
    })
    .join('\n')
}
