export type CrewSpecialty =
  | 'measurer'
  | 'hanger'
  | 'finisher'
  | 'both'
  /**
   * On the job, but not a drywall piece trade — a laborer stocking and cleaning out, a
   * carpenter, office staff. Their account is correct; piece rates simply do not apply.
   *
   * Split out from `unknown` because conflating the two told correctly-configured people
   * their account was broken. Shane Plats is a Laborer with job info granted on 125 of his
   * 130 schedule items, so for a year he saw an amber "we couldn't match your trade"
   * warning and no job size on nearly every job he worked.
   */
  | 'support'
  /** Position missing, or named something nobody has mapped — genuinely worth flagging. */
  | 'unknown'

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
  // "Pointup Specialist" is finish work, and finisherCapacityTier below already
  // treats 'point' that way. This function not matching it left two real people
  // (Robert Allen, Doug Ryman) resolving to 'unknown', which silently empties
  // their materials list and blanks their pay.
  const isFinisher = n.includes('finish') || n.includes('point')
  if (isHanger && isFinisher) return 'both'
  if (isHanger) return 'hanger'
  if (isFinisher) return 'finisher'
  if (SUPPORT_POSITION_PATTERNS.some((re) => re.test(n))) return 'support'
  return 'unknown'
}

/**
 * Positions that are real and non-drywall, listed explicitly rather than inferred from
 * "matched no trade".
 *
 * An allowlist on purpose. Treating every unmatched position as benign support would have
 * hidden the bug this file already carries a comment about — "Pointup Specialist" matched
 * nothing, and Robert Allen and Doug Ryman silently lost their materials and pay. Under a
 * catch-all they would instead have been told, reassuringly and wrongly, that drywall rates
 * do not apply to them. So a position nobody has classified still lands on `unknown` and
 * still raises the flag.
 *
 * Deliberately absent: Foreman, Lead and Apprentice. Each could be drywall or not, and
 * guessing silently is the failure mode above. They stay `unknown` until someone decides.
 */
const SUPPORT_POSITION_PATTERNS: RegExp[] = [
  /labor/, // Laborer — stocks, scaffolds, papers floors, cleans out
  /carpenter/,
  /admin/, // Administrative
]

export function isMeasurerSpecialty(specialty: CrewSpecialty): boolean {
  return specialty === 'measurer'
}

/** On the job but not a drywall piece trade — see the `support` doc on CrewSpecialty. */
export function isSupportSpecialty(specialty: CrewSpecialty): boolean {
  return specialty === 'support'
}
