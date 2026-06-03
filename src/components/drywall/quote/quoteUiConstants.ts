/** UI constants mirrored from drywall QuoteStage.jsx (labels/values only). */

export const RC_CHANNEL_SPACING_OPTIONS = [
  { value: '24', label: '24" OC' },
  { value: '16', label: '16" OC' },
  { value: '12', label: '12" OC' },
] as const

export const METAL_STUD_SPACING_OPTIONS = [
  { value: '12', label: '12"' },
  { value: '16', label: '16"' },
  { value: '24', label: '24"' },
] as const

export const METAL_STUD_TRACKS_OPTIONS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
] as const

export const METAL_STUD_SIZES = [
  { value: '2.5', label: '2½"' },
  { value: '3.625', label: '3⅝"' },
  { value: '6', label: '6"' },
] as const

export const METAL_STUD_GAUGES = [
  { value: '18', label: '18 ga' },
  { value: '20', label: '20 ga' },
  { value: '25', label: '25 ga' },
] as const

export const INSULATION_TYPES = [
  { value: 'r13Batts', label: 'R-13 Batts' },
  { value: 'r19Batts', label: 'R-19 Batts' },
  { value: 'r21Batts', label: 'R-21 Batts' },
  { value: 'r30Batts', label: 'R-30 Batts' },
  { value: 'r38Batts', label: 'R-38 Batts' },
  { value: 'soundAttenuationBatts', label: 'Sound Attenuation Batts' },
  { value: 'rigidInsulation1', label: 'Rigid Insulation 1"' },
  { value: 'rigidInsulation2', label: 'Rigid Insulation 2"' },
] as const

export const ACOUSTIC_TILE_SIZES = [
  { value: '2x2', label: "2' × 2' (4' + 2' tees)" },
  { value: '2x4', label: "2' × 4' (4' tees only)" },
] as const

export function insulationTypeHasFace(type: string): boolean {
  return type !== 'rigidInsulation1' && type !== 'rigidInsulation2'
}

export const DRYWALL_THICKNESS_OPTIONS = ['1/4"', '3/8"', '1/2"', '5/8"'] as const

export const CEILING_FINISH_OPTIONS = [
  'Stomp Knockdown',
  'Knockdown',
  'Splatter',
  'Splatter Knockdown',
  'Level 4 Smooth',
  'Level 5 Smooth',
  'Other',
] as const

export const WALL_FINISH_OPTIONS = [
  'Level 4 Smooth',
  'Level 5 Smooth',
  'Roll Texture Walls',
  'Other',
] as const

export const HANG_EXCEPTION_TEMPLATES = [
  '5/8 inch at garage firewall',
  'Moisture resistant drywall at wet walls',
  '5/8 inch Type X at garage ceiling',
  '1/2 inch Type X at common walls',
  'Moisture resistant drywall in bathrooms',
  '5/8 inch at party walls',
  'Soundproofing drywall in bedrooms',
] as const

export const CEILING_EXCEPTION_TEMPLATES = [
  'Master Bedroom and Great Room are Level 5 Smooth instead of Stomp Knockdown',
  'Bathrooms are Level 5 Smooth',
  'Garage ceiling is Roll Texture',
  'Kitchen is Level 5 Smooth',
  'All bedrooms are Level 5 Smooth',
  'Great Room is Level 5 Smooth',
  'Entry and hallways are Level 5 Smooth',
  'Garage Ceiling Stomp Knockdown. Small Closets Stomp Knockdown.',
] as const

export const WALL_EXCEPTION_TEMPLATES = [
  'Garage walls and small closet walls are Roll Texture instead of Level 4 Smooth',
  'Garage walls are Roll Texture',
  'Closet walls are Roll Texture',
  'Bathroom walls are Level 5 Smooth',
  'Kitchen walls are Level 5 Smooth',
  'All bedrooms are Level 5 Smooth',
  'Entry and hallways are Level 5 Smooth',
] as const
