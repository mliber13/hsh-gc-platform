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

export interface DrywallDurationInput {
  drywallSqft: number
  beadSticks?: number
  buildType?: string
  complexity?: string
  hasLevel5?: boolean
  hasTexture?: boolean
  paperFloorsRequired?: boolean
  params?: Partial<DurationParams>
}

export interface DurationLine {
  label: string
  days: number
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

  const lines: DurationLine[] = []
  const prepStockDays = Math.max(1, p.fixedPrep)
  lines.push({ label: 'Prep/Scaffold & Stock', days: prepStockDays })

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
  lines.push({ label: 'Hang', days: hangDays })

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
    lines.push({ label: 'Paper Floors', days: 1 })
  }
  lines.push({
    label: hasTexture
      ? 'Finish (Tape, Bed, Skim, Texture, Sand)'
      : 'Finish (Tape, Bed, Skim, Sand)',
    days: finishDays,
  })
  lines.push({ label: 'Cleanout', days: p.fixedCleanout })

  const totalDays = lines.reduce((sum, l) => sum + l.days, 0)
  const assumptions = hasTexture
    ? `Single crew, no acceleration. Finish days ≥ hang days when sqft > 0. Texture ${textureDaysSmall} day(s) (${textureDaysLarge} if sqft > ${p.largeSqftTexture.toLocaleString()}).`
    : 'Single crew, no acceleration. Finish days ≥ hang days when sqft > 0. No texture time included for Level 4 Smooth / non-textured finishes.'

  return { lines, totalDays, assumptions }
}
