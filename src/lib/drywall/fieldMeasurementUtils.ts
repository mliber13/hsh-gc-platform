import type {
  DrywallQuote,
  FieldChecklistItem,
  FieldMeasurementArea,
  FieldPhotoRef,
  FieldTakeoff,
} from '@/types/drywall'

export const FIELD_VARIANCE_WARNING_PCT = 10

export const FIELD_CHECKLIST_DEFAULTS: FieldChecklistItem[] = [
  { id: 'scope-match', label: 'Scope matches approved quote', completed: false },
  { id: 'access', label: 'Documented access / staging constraints', completed: false },
  { id: 'hazards', label: 'Logged safety hazards & PPE needs', completed: false },
  { id: 'photos', label: 'Captured reference photos', completed: false },
]

export function generateFieldId(): string {
  return crypto.randomUUID()
}

export function computeMeasuredSqft(measurements: FieldMeasurementArea[]): number {
  return measurements.reduce((total, measurement) => {
    const boards = measurement?.boards ?? []
    const areaSqft = boards.reduce((sum, board) => {
      const width = parseFloat(String(board.width)) || 0
      const length = parseFloat(String(board.length)) || 0
      const quantity = parseFloat(String(board.quantity)) || 0
      const sqftPerBoard = (width / 12) * length
      return sum + sqftPerBoard * quantity
    }, 0)
    return total + areaSqft
  }, 0)
}

export function quotedSqftWithWaste(quote: DrywallQuote | Record<string, unknown> | null | undefined): number {
  if (!quote || typeof quote !== 'object') return 0
  const base = parseFloat(String(quote.sqft)) || 0
  const wastePct = Math.round(parseFloat(String(quote.wastePercentage)) || 0)
  return Math.round(base * (1 + wastePct / 100))
}

export function mergeFieldTakeoff(
  existing: FieldTakeoff | null | undefined,
  preparedInfo: Record<string, unknown> = {},
): FieldTakeoff {
  const defaults: FieldTakeoff = {
    siteContact: String(preparedInfo.siteContact ?? ''),
    contactPhone: String(preparedInfo.contactPhone ?? ''),
    meetingLocation: String(preparedInfo.meetingLocation ?? ''),
    accessNotes: String(preparedInfo.accessNotes ?? ''),
    hazards: '',
    materialsNeeded: '',
    notes: '',
    varianceNotes: '',
    measurements: [],
    photos: [],
    accessories: [],
    checklist: FIELD_CHECKLIST_DEFAULTS.map((c) => ({ ...c })),
    totalMeasuredSqft: 0,
    signedOffBy: '',
    signedOffDate: '',
    updatedAt: null,
  }

  if (!existing) return defaults

  return {
    ...defaults,
    ...existing,
    siteContact: existing.siteContact || String(preparedInfo.siteContact ?? ''),
    contactPhone: existing.contactPhone || String(preparedInfo.contactPhone ?? ''),
    meetingLocation: existing.meetingLocation || String(preparedInfo.meetingLocation ?? ''),
    accessNotes: existing.accessNotes || String(preparedInfo.accessNotes ?? ''),
    measurements: Array.isArray(existing.measurements)
      ? existing.measurements.map((item) => ({
          id: item.id || generateFieldId(),
          area: item.area ?? '',
          notes: item.notes ?? '',
          boards: Array.isArray(item.boards)
            ? item.boards.map((board) => ({
                id: board.id || generateFieldId(),
                boardType: board.boardType ?? '',
                thickness: board.thickness ?? '',
                width: board.width ?? '',
                length: board.length ?? '',
                quantity: board.quantity ?? '',
              }))
            : [],
        }))
      : [],
    photos: Array.isArray(existing.photos)
      ? existing.photos.map((photo) => normalizeFieldPhotoRef(photo))
      : [],
    accessories: Array.isArray(existing.accessories)
      ? existing.accessories.map((acc) => ({
          id: acc.id || generateFieldId(),
          type: acc.type ?? '',
          subtype: acc.subtype ?? '',
          quantity: acc.quantity ?? '',
          unit: acc.unit ?? 'pcs',
          autoCalculated: Boolean(acc.autoCalculated),
          manuallyEdited: Boolean(acc.manuallyEdited),
          length: acc.length ?? '',
          threadType: acc.threadType ?? '',
        }))
      : [],
    checklist:
      Array.isArray(existing.checklist) && existing.checklist.length > 0
        ? existing.checklist.map((item) => ({
            id: item.id || generateFieldId(),
            label: item.label,
            completed: Boolean(item.completed),
          }))
        : FIELD_CHECKLIST_DEFAULTS.map((c) => ({ ...c })),
  }
}

export function normalizeFieldPhotoRef(photo: FieldPhotoRef): FieldPhotoRef {
  return {
    id: photo.id || generateFieldId(),
    label: photo.label ?? '',
    notes: photo.notes ?? '',
    url: photo.url ?? '',
    storagePath: photo.storagePath,
    uploadedAt: photo.uploadedAt,
  }
}

export function fieldTakeoffWithTotals(takeoff: FieldTakeoff): FieldTakeoff {
  const totalMeasuredSqft = computeMeasuredSqft(takeoff.measurements)
  return { ...takeoff, totalMeasuredSqft }
}
