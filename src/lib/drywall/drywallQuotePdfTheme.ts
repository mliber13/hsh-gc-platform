// Visual tokens aligned with src/services/clientQuotePdf.ts (no shared import — Section 0)

import type jsPDF from 'jspdf'

export const DW_PAGE = {
  marginX: 48,
  marginY: 56,
  footerY: 756,
  bottomReserve: 80,
} as const

export const DW_COLORS = {
  red: '#D9482A',
  blue: '#2C5BC4',
  gray: '#6B7280',
  lightGray: '#E5E7EB',
  text: '#111827',
  tableStripe: '#F3F4F6',
} as const

export const DW_RED = hexToRgb(DW_COLORS.red)
export const DW_BLUE = hexToRgb(DW_COLORS.blue)
export const DW_GRAY = hexToRgb(DW_COLORS.gray)
export const DW_LIGHT_GRAY = hexToRgb(DW_COLORS.lightGray)
export const DW_TEXT = hexToRgb(DW_COLORS.text)
export const DW_TABLE_STRIPE = hexToRgb(DW_COLORS.tableStripe)

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function setTextRgb(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

export function setDrawRgb(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2])
}

export interface DrywallPdfLogo {
  dataUrl: string
  naturalW: number
  naturalH: number
}

export async function loadDrywallPdfLogo(): Promise<DrywallPdfLogo | null> {
  try {
    const res = await fetch('/HSH Contractor Logo - Color.png')
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => reject(new Error('read logo'))
      r.readAsDataURL(blob)
    })
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => reject(new Error('decode logo'))
      img.src = dataUrl
    })
    return { dataUrl, naturalW: dims.w, naturalH: dims.h }
  } catch {
    return null
  }
}

export const AUTO_TABLE_HEAD = {
  fillColor: DW_RED,
  textColor: [255, 255, 255] as [number, number, number],
  fontStyle: 'bold' as const,
  fontSize: 10,
}

export const AUTO_TABLE_FOOT = {
  fillColor: [255, 255, 255] as [number, number, number],
  textColor: DW_BLUE,
  fontStyle: 'bold' as const,
  fontSize: 11,
}

export const AUTO_TABLE_BASE = {
  fontSize: 9,
  cellPadding: 6,
  lineColor: DW_LIGHT_GRAY,
  lineWidth: 0.5,
}
