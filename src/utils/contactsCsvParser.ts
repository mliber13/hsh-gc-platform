// ============================================================================
// Contacts CSV parser — standalone import (no excelParser coupling)
// ============================================================================

import { STANDALONE_CONTACT_LABELS } from '@/types/contactDirectory'
import type { PartnerCategory } from '@/types/contactDirectory'

export interface ParsedContactRow {
  lineNumber: number
  name: string
  category: string
  email: string
  phone: string
  role: string
  notes: string
}

export type CategoryResolution =
  | { status: 'matched'; label: string }
  | { status: 'blank' }
  | { status: 'unmapped' }
  | { status: 'entity_rejected' }

const ENTITY_LABELS = ['SUBCONTRACTOR', 'SUPPLIER', 'DEVELOPER', 'MUNICIPALITY', 'LENDER'] as const

const ENTITY_DISPLAY_ALIASES = new Set([
  'subcontractor',
  'subcontractors',
  'supplier',
  'suppliers',
  'developer',
  'developers',
  'municipality',
  'municipalities',
  'lender',
  'lenders',
])

const HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  'full name': 'name',
  'contact name': 'name',
  category: 'category',
  type: 'category',
  label: 'category',
  group: 'category',
  email: 'email',
  'email address': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  role: 'role',
  title: 'role',
  position: 'role',
  notes: 'notes',
  description: 'notes',
  note: 'notes',
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result.map((v) => v.replace(/^"|"$/g, '').trim())
}

function mapHeaders(rawHeaders: string[]): Record<string, number> {
  const indices: Record<string, number> = {}
  rawHeaders.forEach((h, i) => {
    const canonical = HEADER_ALIASES[normalizeHeader(h)]
    if (canonical && indices[canonical] === undefined) {
      indices[canonical] = i
    }
  })
  return indices
}

function isEntityCategory(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  const upper = trimmed.replace(/[\s-]+/g, '_').toUpperCase()
  if ((ENTITY_LABELS as readonly string[]).includes(upper)) return true
  return ENTITY_DISPLAY_ALIASES.has(trimmed.toLowerCase())
}

/** Resolve CSV category text to a contacts.label value (standalone only). */
export function resolveCsvCategory(
  rawCategory: string,
  partnerCategories: Pick<PartnerCategory, 'key' | 'label'>[],
): CategoryResolution {
  const trimmed = rawCategory.trim()
  if (!trimmed) return { status: 'blank' }
  if (isEntityCategory(trimmed)) return { status: 'entity_rejected' }

  const lower = trimmed.toLowerCase()

  for (const cat of partnerCategories) {
    if (cat.key.toLowerCase() === lower) return { status: 'matched', label: cat.key }
  }
  for (const cat of partnerCategories) {
    if (cat.label.toLowerCase() === lower) return { status: 'matched', label: cat.key }
  }

  for (const people of STANDALONE_CONTACT_LABELS) {
    if (people.value.toLowerCase() === lower) return { status: 'matched', label: people.value }
    if (people.label.toLowerCase() === lower) return { status: 'matched', label: people.value }
  }
  if (lower === '1099') return { status: 'matched', label: 'INDEPENDENT_1099' }

  return { status: 'unmapped' }
}

export function parseContactsCsv(content: string): { rows: ParsedContactRow[]; warnings: string[] } {
  const warnings: string[] = []
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    throw new Error('The CSV file is empty.')
  }

  const headerCells = parseCSVLine(lines[0])
  const col = mapHeaders(headerCells)

  if (col.name === undefined) {
    throw new Error(
      'Missing required "name" column. Add a header such as name, full name, or contact name.',
    )
  }

  const rows: ParsedContactRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const lineNumber = i + 1
    const get = (key: string) => {
      const idx = col[key]
      if (idx === undefined || idx >= values.length) return ''
      return values[idx].trim()
    }

    const name = get('name')
    if (!name) {
      warnings.push(`Row ${lineNumber}: skipped — name is blank.`)
      continue
    }

    rows.push({
      lineNumber,
      name,
      category: get('category'),
      email: get('email'),
      phone: get('phone'),
      role: get('role'),
      notes: get('notes'),
    })
  }

  return { rows, warnings }
}

export const CONTACTS_CSV_TEMPLATE = `name,category,email,phone,role,notes
Jane Smith,Realtors,jane@example.com,555-0101,Listing Agent,
John Doe,Architects,john@example.com,555-0102,Principal,
`

export function downloadContactsCsvTemplate(): void {
  const blob = new Blob([CONTACTS_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'contacts-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
