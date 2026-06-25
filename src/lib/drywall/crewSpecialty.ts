export type CrewSpecialty = 'hanger' | 'finisher' | 'both' | 'unknown'

export function specialtyFromPositionName(name: string | null | undefined): CrewSpecialty {
  if (!name) return 'unknown'
  const n = name.toLowerCase()
  const isHanger = n.includes('hang')
  const isFinisher = n.includes('finish')
  if (isHanger && isFinisher) return 'both'
  if (isHanger) return 'hanger'
  if (isFinisher) return 'finisher'
  return 'unknown'
}
