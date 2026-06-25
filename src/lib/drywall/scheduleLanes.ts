/**
 * Pack schedule items into vertical lanes so non-overlapping items share a row.
 * Greedy: each item placed in first lane with no column conflict.
 */
export function packLanes<T extends { cols: number[] }>(entries: T[]): T[][] {
  const lanes: T[][] = []
  for (const entry of entries) {
    let placed = false
    for (const lane of lanes) {
      const conflict = lane.some((existing) =>
        existing.cols.some((c) => entry.cols.includes(c)),
      )
      if (!conflict) {
        lane.push(entry)
        placed = true
        break
      }
    }
    if (!placed) lanes.push([entry])
  }
  return lanes
}
