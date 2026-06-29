export type CrewSpecialty = 'measurer' | 'hanger' | 'finisher' | 'both' | 'unknown'

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
