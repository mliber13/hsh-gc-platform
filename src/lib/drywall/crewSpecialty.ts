export type CrewSpecialty = 'measurer' | 'hanger' | 'finisher' | 'both' | 'unknown'

export type FinisherTier = 'production' | 'apprentice' | 'pointup' | null

/** Finisher throughput tier from HR position name (independent of specialtyFromPositionName). */
export function finisherCapacityTier(name: string | null | undefined): FinisherTier {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('point')) return 'pointup'
  if (!n.includes('finish')) return null
  if (/(apprentice|helper|assist|junior)/.test(n)) return 'apprentice'
  return 'production'
}

/** Position name substring match — same pattern as hanger/finisher. */
export function specialtyFromPositionName(name: string | null | undefined): CrewSpecialty {
  if (!name) return 'unknown'
  const n = name.toLowerCase()
  // Measurer first — explicit ordering per D.6.8 brief.
  if (n.includes('measure')) return 'measurer'
  const isHanger = n.includes('hang')
  const isFinisher = n.includes('finish')
  if (isHanger && isFinisher) return 'both'
  if (isHanger) return 'hanger'
  if (isFinisher) return 'finisher'
  return 'unknown'
}

export function isMeasurerSpecialty(specialty: CrewSpecialty): boolean {
  return specialty === 'measurer'
}
