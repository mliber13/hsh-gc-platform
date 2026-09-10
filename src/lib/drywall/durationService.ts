/** Default duration params (legacy Settings defaults — V1 uses built-ins until Settings port). */
export const DEFAULT_DURATION_PARAMS = {
  hangRateNewBuildNormal: 4800,
  hangRateNewBuildComplex: 4000,
  hangRateRenovationNormal: 3200,
  hangRateRenovationComplex: 2400,
  hangRoundUpThreshold: 0.75,
  baseFinishSqftThreshold: 14400,
  finishSqftTier2: 24000,
  finishSqftTier3: 36000,
  finishBaseDaysSmall: 5,
  finishBaseDaysMedium: 6,
  finishBaseDaysLarge: 8,
  finishBaseDaysXLarge: 10,
  beadDensityRefSqft: 14400,
  beadThreshold1: 120,
  beadThreshold2: 160,
  beadThreshold3: 200,
  complexityAddDays: 1,
  renovationAddDays: 1,
  level5AddDays: 2,
  minFinishDays: 5,
  largeSqftTexture: 24000,
  textureDaysSmall: 1,
  textureDaysLarge: 2,
  fixedPrep: 1,
  fixedStock: 1,
  fixedCleanout: 1,
} as const

export type DurationParams = typeof DEFAULT_DURATION_PARAMS

/**
 * Stable identity for each step. The labels move — "Finish" carries a different
 * parenthetical depending on texture — so an override has to hang off something
 * that doesn't change when the estimator picks a different finish.
 */
export const DURATION_LINE_KEYS = [
  'prep',
  'hang',
  'paperFloors',
  'finish',
  'cleanout',
] as const

export type DurationLineKey = (typeof DURATION_LINE_KEYS)[number]

export type DurationOverrides = Partial<Record<DurationLineKey, unknown>>

export interface DrywallDurationInput {
  drywallSqft: number
  beadSticks?: number
  buildType?: string
  complexity?: string
  hasLevel5?: boolean
  hasTexture?: boolean
  paperFloorsRequired?: boolean
  params?: Partial<DurationParams>
  /**
   * Estimator's own numbers, per step. The model can't know about a phased
   * handover, a GC who won't have the deck ready, or a crew that's done this
   * exact building before — so whatever is set here wins over the calculation.
   */
  overrides?: DurationOverrides
}

export interface DurationLine {
  key: DurationLineKey
  label: string
  /** What the estimator is standing behind — the override if there is one. */
  days: number
  /** What the calculation said, kept so the UI can show it and offer a reset. */
  derivedDays: number
  overridden: boolean
}

/**
 * An override counts only when it is a real, non-negative number. Blank, junk
 * and negatives fall back to the derived value rather than zeroing a step —
 * clearing the field is how you go back to automatic.
 */
export function parseDurationOverride(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/**
 * Level 5 and texture add finish days, but nobody records them as flags — they
 * are read out of the finish selections the estimator already made. Shared so
 * the v2 and v3 PDFs can't answer the same question differently.
 */
export function durationFinishFlags(finishSelections: unknown[]): {
  hasLevel5: boolean
  hasTexture: boolean
} {
  const finishes = finishSelections.map((s) => String(s ?? '').toLowerCase())
  return {
    hasLevel5: finishes.some((s) => s.includes('level 5')),
    hasTexture: finishes.some(
      (s) =>
        s.includes('texture') ||
        s.includes('knockdown') ||
        s.includes('orange peel') ||
        s.includes('stomp') ||
        s.includes('skip trowel') ||
        s.includes('roll'),
    ),
  }
}

export function computeDrywallDurationSummary(input: DrywallDurationInput): {
  lines: DurationLine[]
  totalDays: number
  assumptions: string
} {
  const p = { ...DEFAULT_DURATION_PARAMS, ...input.params }

  const drywallSqft = Math.max(0, Number(input.drywallSqft) || 0)
  const beadSticks = Math.max(0, Number(input.beadSticks) || 0)
  const buildType = input.buildType === 'renovation' ? 'renovation' : 'new_build'
  const complexity = input.complexity === 'complex' ? 'complex' : 'normal'
  const hasLevel5 = Boolean(input.hasLevel5)
  const hasTexture = input.hasTexture !== false
  const paperFloorsRequired = Boolean(input.paperFloorsRequired)

  const hangRates: Record<string, number> = {
    new_build_normal: p.hangRateNewBuildNormal,
    new_build_complex: p.hangRateNewBuildComplex,
    renovation_normal: p.hangRateRenovationNormal,
    renovation_complex: p.hangRateRenovationComplex,
  }

  const derived: Array<{ key: DurationLineKey; label: string; days: number }> = []
  const prepStockDays = Math.max(1, p.fixedPrep)
  derived.push({ key: 'prep', label: 'Prep/Scaffold & Stock', days: prepStockDays })

  let hangDays = 0
  if (drywallSqft > 0) {
    const rateKey = `${buildType}_${complexity}`
    const hangRate = hangRates[rateKey] ?? hangRates.new_build_normal
    const rawDays = drywallSqft / hangRate
    const fractional = rawDays - Math.floor(rawDays)
    const roundUp = fractional >= p.hangRoundUpThreshold
    hangDays = roundUp ? Math.ceil(rawDays) : Math.floor(rawDays)
    hangDays = Math.max(1, hangDays)
  }
  derived.push({ key: 'hang', label: 'Hang', days: hangDays })

  let finishDays = 0
  let textureDaysSmall = p.textureDaysSmall
  let textureDaysLarge = p.textureDaysLarge
  if (drywallSqft > 0) {
    let base = drywallSqft <= p.baseFinishSqftThreshold ? p.finishBaseDaysSmall : 0
    if (drywallSqft > p.baseFinishSqftThreshold) {
      if (drywallSqft <= p.finishSqftTier2) base = p.finishBaseDaysMedium
      else if (drywallSqft <= p.finishSqftTier3) base = p.finishBaseDaysLarge
      else base = p.finishBaseDaysXLarge
    }
    const beadDensity =
      drywallSqft > 0 ? (beadSticks / drywallSqft) * p.beadDensityRefSqft : 0
    let beadDays = 0
    if (beadDensity >= p.beadThreshold3) beadDays = 3
    else if (beadDensity >= p.beadThreshold2) beadDays = 2
    else if (beadDensity >= p.beadThreshold1) beadDays = 1
    let stepDays = base + beadDays
    if (complexity === 'complex') stepDays += p.complexityAddDays
    if (buildType === 'renovation') stepDays += p.renovationAddDays
    if (hasLevel5) stepDays += p.level5AddDays
    const textureDays = hasTexture
      ? drywallSqft > p.largeSqftTexture
        ? textureDaysLarge
        : textureDaysSmall
      : 0
    finishDays = Math.max(p.minFinishDays, stepDays, hangDays)
    if (hasTexture) {
      finishDays = Math.max(finishDays, textureDays + 4)
    }
  }
  if (paperFloorsRequired) {
    derived.push({ key: 'paperFloors', label: 'Paper Floors', days: 1 })
  }
  derived.push({
    key: 'finish',
    label: hasTexture
      ? 'Finish (Tape, Bed, Skim, Texture, Sand)'
      : 'Finish (Tape, Bed, Skim, Sand)',
    days: finishDays,
  })
  derived.push({ key: 'cleanout', label: 'Cleanout', days: p.fixedCleanout })

  const overrides = input.overrides ?? {}
  const lines: DurationLine[] = derived.map((line) => {
    const override = parseDurationOverride(overrides[line.key])
    return {
      ...line,
      days: override ?? line.days,
      derivedDays: line.days,
      overridden: override !== null,
    }
  })

  const totalDays = lines.reduce((sum, l) => sum + l.days, 0)
  const assumptions = hasTexture
    ? `Single crew, no acceleration. Finish days ≥ hang days when sqft > 0. Texture ${textureDaysSmall} day(s) (${textureDaysLarge} if sqft > ${p.largeSqftTexture.toLocaleString()}).`
    : 'Single crew, no acceleration. Finish days ≥ hang days when sqft > 0. No texture time included for Level 4 Smooth / non-textured finishes.'

  return {
    lines,
    totalDays,
    assumptions: lines.some((l) => l.overridden)
      ? `${assumptions} Adjusted by the estimator.`
      : assumptions,
  }
}
