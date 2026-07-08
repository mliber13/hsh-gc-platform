export const DIVISIONS = [
  { code: 'hsh_contractor', label: 'HSH Contractor' },
  { code: 'hsh_drywall', label: 'HSH Drywall' },
  { code: '3d_printing', label: '3D Printing' },
] as const

export type DivisionCode = (typeof DIVISIONS)[number]['code']

export const UNALLOCATED_KEY = '__unallocated'

export function divisionLabel(code: string): string {
  if (code === UNALLOCATED_KEY) return 'Unallocated'
  return DIVISIONS.find((d) => d.code === code)?.label ?? code
}
