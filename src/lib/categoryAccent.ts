/**
 * Stable accent color for a category key (e.g. left border, dot).
 * Same key always gets the same color for consistency across the app.
 */

function hashKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Muted, professional hues (HSL) - same key = same color */
const HUES = [210, 170, 280, 30, 340, 200, 150, 260, 45, 190]

export function getCategoryAccentColor(key: string): string {
  if (!key) return 'rgb(148 163 184)' // slate-400
  const index = hashKey(key) % HUES.length
  const hue = HUES[index]
  // Slightly desaturated, medium-light for a soft left-border look
  return `hsl(${hue}, 42%, 48%)`
}

/** Inline style for a left accent bar (e.g. on category rows). */
export function getCategoryAccentLeftBorderStyle(key: string): { borderLeftWidth: number; borderLeftStyle: 'solid'; borderLeftColor: string } {
  return {
    borderLeftWidth: 4,
    borderLeftStyle: 'solid',
    borderLeftColor: getCategoryAccentColor(key),
  }
}
