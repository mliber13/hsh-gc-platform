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
