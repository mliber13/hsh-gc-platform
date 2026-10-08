/**
 * Hang-only board: hung, never finished.
 *
 * Two real cases. Hardi / cement backer board is hung and never finished (Chardon - Droblyen,
 * 2026-10-08). And a double layer's base layer is hung and never finished — usually the SAME
 * board as the layer over it, which is why this cannot be inferred from the board type and is
 * an explicit setting on the board spec instead (see names-are-not-classification).
 *
 * Every board is hung, so hanger pay, screws and the material order use all of them. Only the
 * finished ones are paid to the finisher and sized for mud and tape. Before this split one
 * sqft number fed both, so finishers were paid on board nobody finishes.
 *
 * Fire tape is not finisher pay (Mark, 2026-10-08), so a fire-tape-only quote line counts as
 * hang-only here too.
 */
import type { FieldMeasurementArea, FieldMeasurementBoard } from '@/types/drywall'
import { quotedSqftWithWaste } from './fieldMeasurementUtils'

/** Board types that default to hang-only when a spec does not say. Explicit always wins. */
const HANG_ONLY_BY_DEFAULT = new Set(['Cement'])

/** Quote finish scopes that are not finisher work. */
export const HANG_ONLY_FINISH_SCOPES: ReadonlySet<string> = new Set(['hang_only', 'firetape_only'])

export function defaultHangOnlyForBoardType(boardType: string | undefined): boolean {
  return HANG_ONLY_BY_DEFAULT.has(boardType ?? '')
}

/**
 * The board's explicit setting, else the default for its type. Boards saved before the setting
 * existed have none, so a Cement board reads as hang-only and anything else as finished.
 */
export function isHangOnlyBoard(board: Pick<FieldMeasurementBoard, 'boardType' | 'hangOnly'>): boolean {
  if (typeof board.hangOnly === 'boolean') return board.hangOnly
  return defaultHangOnlyForBoardType(board.boardType)
}

/** Same arithmetic as computeMeasuredSqft, for one board row. */
function boardSqft(board: FieldMeasurementBoard): number {
  const width = parseFloat(String(board.width)) || 0
  const length = parseFloat(String(board.length)) || 0
  const quantity = parseFloat(String(board.quantity)) || 0
  return (width / 12) * length * quantity
}

/** Sqft of hang-only boards across the takeoff. */
export function hangOnlyMeasuredSqft(measurements: FieldMeasurementArea[] | null | undefined): number {
  let total = 0
  for (const area of measurements ?? []) {
    for (const board of area?.boards ?? []) {
      if (isHangOnlyBoard(board)) total += boardSqft(board)
    }
  }
  return total
}

/**
 * A quote line that is hung but not finished: a Hang Only or Firetape Only finish scope, or a
 * line whose finisher rate was set to 0. The 0 counts because that is how a line is made
 * hang-only today while a project finisher rate is set — the project rate would otherwise apply.
 */
export function isHangOnlyQuoteLine(line: Record<string, unknown> | null | undefined): boolean {
  if (!line || line.type !== 'drywall') return false
  if (HANG_ONLY_FINISH_SCOPES.has(String(line.finish_scope_id ?? ''))) return true
  const rate = line.custom_finisher_rate
  return rate !== undefined && rate !== null && rate !== '' && Number(rate) === 0
}

/** Quoted sqft with waste that gets finished — every drywall line except hang-only ones. */
export function quotedFinishSqftWithWaste(quote: Parameters<typeof quotedSqftWithWaste>[0]): number {
  return quotedSqftWithWaste(quote, (line) => !isHangOnlyQuoteLine(line))
}
