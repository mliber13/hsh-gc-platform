/** Phases need at least unit counts for remainder-by-units rules. */
export type PhaseForAllocation = { unitCount: number }

/**
 * Allocation weights per phase, summing to 1.
 * `getExplicitPercent` returns 0–100 (whole percent) per phase.
 * When every explicit is 0: `autoWhenAllZero` chooses the default curve.
 */
export function computePhaseAllocationShares<T extends PhaseForAllocation>(
  phases: T[],
  getExplicitPercent: (p: T) => number,
  autoWhenAllZero: 'infra' | 'landSite',
): number[] {
  if (!phases.length) return []
  const explicit = phases.map((p) => Math.max(0, getExplicitPercent(p) / 100))
  const explicitSum = explicit.reduce((s, x) => s + x, 0)
  if (explicitSum > 0) {
    const normalized = explicitSum > 1 ? explicit.map((x) => x / explicitSum) : explicit
    const used = normalized.reduce((s, x) => s + x, 0)
    const remaining = Math.max(0, 1 - used)
    const unspecifiedIdx = normalized.map((x, idx) => (x <= 0 ? idx : -1)).filter((idx) => idx >= 0)
    if (!unspecifiedIdx.length || remaining <= 0) return normalized
    const unspecifiedUnits = unspecifiedIdx.reduce((sum, idx) => sum + phases[idx].unitCount, 0)
    const shares = [...normalized]
    unspecifiedIdx.forEach((idx) => {
      const w = unspecifiedUnits > 0 ? phases[idx].unitCount / unspecifiedUnits : 1 / unspecifiedIdx.length
      shares[idx] = remaining * w
    })
    return shares
  }

  if (autoWhenAllZero === 'landSite') {
    if (phases.length === 1) return [1]
    return phases.map((_, i) => (i === 0 ? 1 : 0))
  }

  // Infrastructure-style default: half on first phase, remainder by unit count on later phases.
  const shares = phases.map(() => 0)
  if (phases.length === 1) {
    shares[0] = 1
    return shares
  }
  shares[0] = 0.5
  const remaining = 0.5
  const laterUnits = phases.slice(1).reduce((sum, p) => sum + p.unitCount, 0)
  for (let i = 1; i < phases.length; i++) {
    shares[i] =
      laterUnits > 0 ? (remaining * phases[i].unitCount) / laterUnits : remaining / (phases.length - 1)
  }
  return shares
}
