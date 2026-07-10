const PROJECT_PALETTE = [
  'indigo',
  'rose',
  'amber',
  'teal',
  'fuchsia',
  'cyan',
  'lime',
  'orange',
  'violet',
  'emerald',
  'pink',
  'sky',
] as const

type ProjectPaletteColor = (typeof PROJECT_PALETTE)[number]

/** Static class map — avoids Tailwind purge stripping dynamic `bg-${color}-500` patterns. */
const PROJECT_COLOR_CLASSES: Record<
  ProjectPaletteColor,
  { bg: string; border: string; text: string }
> = {
  indigo: { bg: 'bg-indigo-500', border: 'border-indigo-600', text: 'text-white' },
  rose: { bg: 'bg-rose-500', border: 'border-rose-600', text: 'text-white' },
  amber: { bg: 'bg-amber-600', border: 'border-amber-700', text: 'text-white' },
  teal: { bg: 'bg-teal-500', border: 'border-teal-600', text: 'text-white' },
  fuchsia: { bg: 'bg-fuchsia-500', border: 'border-fuchsia-600', text: 'text-white' },
  cyan: { bg: 'bg-cyan-500', border: 'border-cyan-600', text: 'text-white' },
  lime: { bg: 'bg-lime-600', border: 'border-lime-700', text: 'text-white' },
  orange: { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-white' },
  violet: { bg: 'bg-violet-500', border: 'border-violet-600', text: 'text-white' },
  emerald: { bg: 'bg-emerald-500', border: 'border-emerald-600', text: 'text-white' },
  pink: { bg: 'bg-pink-500', border: 'border-pink-600', text: 'text-white' },
  sky: { bg: 'bg-sky-500', border: 'border-sky-600', text: 'text-white' },
}

export function projectColorClass(projectId: string): {
  bg: string
  border: string
  text: string
} {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0
  }
  const color = PROJECT_PALETTE[hash % PROJECT_PALETTE.length]
  return PROJECT_COLOR_CLASSES[color]
}
