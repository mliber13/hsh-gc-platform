import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  FIELD_BOARD_TYPES,
  applyBoardFieldChange,
  formatThicknessLabel,
  getAvailableLengths,
  getAvailableThicknesses,
  getAvailableWidths,
} from '@/lib/drywall/fieldBoardSpecs'
import { computeMeasuredSqft, generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  defaultHangOnlyForBoardType,
  hangOnlyMeasuredSqft,
  isHangOnlyBoard,
} from '@/lib/drywall/hangOnly'
import type { FieldMeasurementArea, FieldMeasurementBoard, FieldTakeoff } from '@/types/drywall'
import type { SetFieldTakeoff } from '../fieldTakeoffState'

interface FieldMeasurementsSectionProps {
  takeoff: FieldTakeoff
  readOnly: boolean
  onChange: SetFieldTakeoff
}

/**
 * UI-only grouping key — one group = boardType + thickness + width + hang-only. Hang-only is
 * part of the identity so a double layer can carry the same board twice in one area: the top
 * layer finished, the base layer hang only.
 */
type SpecGroup = {
  id: string
  boardType: string
  thickness: string
  width: string
  hangOnly: boolean
}

function specKey(board: FieldMeasurementBoard): string {
  return `${board.boardType ?? ''}|${board.thickness ?? ''}|${board.width ?? ''}|${isHangOnlyBoard(board)}`
}

function boardMatchesSpec(board: FieldMeasurementBoard, group: SpecGroup): boolean {
  return (
    (board.boardType ?? '') === group.boardType &&
    (board.thickness ?? '') === group.thickness &&
    (board.width ?? '') === group.width &&
    isHangOnlyBoard(board) === group.hangOnly
  )
}

/** Derive initial groups from flat boards (saved takeoffs). */
function deriveGroupsFromBoards(boards: FieldMeasurementBoard[]): SpecGroup[] {
  const seen = new Map<string, SpecGroup>()
  for (const board of boards) {
    const key = specKey(board)
    if (seen.has(key)) continue
    // Skip fully blank leftover rows from the old per-board UI.
    if (!board.boardType && !board.thickness && !board.width && !board.length) continue
    seen.set(key, {
      id: generateFieldId(),
      boardType: board.boardType ?? '',
      thickness: board.thickness ?? '',
      width: board.width ?? '',
      hangOnly: isHangOnlyBoard(board),
    })
  }
  return [...seen.values()]
}

function quantityForLength(
  boards: FieldMeasurementBoard[],
  group: SpecGroup,
  length: string,
): string {
  const match = boards.find((b) => boardMatchesSpec(b, group) && (b.length ?? '') === length)
  return match?.quantity ?? ''
}

export function FieldMeasurementsSection({
  takeoff,
  readOnly,
  onChange,
}: FieldMeasurementsSectionProps) {
  const total = computeMeasuredSqft(takeoff.measurements)
  const hangOnlyTotal = hangOnlyMeasuredSqft(takeoff.measurements)

  // Spec groups are UI state — empty/in-progress groups have no board rows yet, so they
  // cannot be re-derived from boards alone. Seed from boards when an area first appears.
  const [groupsByArea, setGroupsByArea] = useState<Record<string, SpecGroup[]>>({})

  useEffect(() => {
    const areaIds = new Set(takeoff.measurements.map((m) => m.id))
    setGroupsByArea((prev) => {
      let changed = false
      const next: Record<string, SpecGroup[]> = {}
      for (const area of takeoff.measurements) {
        if (prev[area.id]) {
          next[area.id] = prev[area.id]
        } else {
          next[area.id] = deriveGroupsFromBoards(area.boards)
          changed = true
        }
      }
      for (const id of Object.keys(prev)) {
        if (!areaIds.has(id)) changed = true
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev
      return next
    })
  }, [takeoff.measurements])

  const addArea = () => {
    const id = generateFieldId()
    onChange((prev) => ({
      ...prev,
      measurements: [
        ...prev.measurements,
        { id, area: '', notes: '', boards: [] },
      ],
    }))
    setGroupsByArea((prev) => ({ ...prev, [id]: [] }))
  }

  const removeArea = (id: string) => {
    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.filter((m) => m.id !== id),
    }))
    setGroupsByArea((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const updateArea = (id: string, patch: Partial<FieldMeasurementArea>) => {
    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }

  const addSpecGroup = (areaId: string) => {
    setGroupsByArea((prev) => ({
      ...prev,
      [areaId]: [
        ...(prev[areaId] ?? []),
        { id: generateFieldId(), boardType: '', thickness: '', width: '', hangOnly: false },
      ],
    }))
  }

  const removeSpecGroup = (areaId: string, group: SpecGroup) => {
    setGroupsByArea((prev) => ({
      ...prev,
      [areaId]: (prev[areaId] ?? []).filter((g) => g.id !== group.id),
    }))
    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) =>
        m.id === areaId
          ? { ...m, boards: m.boards.filter((b) => !boardMatchesSpec(b, group)) }
          : m,
      ),
    }))
  }

  const updateGroupSpec = (
    areaId: string,
    groupId: string,
    field: 'boardType' | 'thickness' | 'width',
    value: string,
  ) => {
    const groups = groupsByArea[areaId] ?? []
    const oldGroup = groups.find((g) => g.id === groupId)
    if (!oldGroup) return

    const cascaded = applyBoardFieldChange(
      {
        boardType: oldGroup.boardType,
        thickness: oldGroup.thickness,
        width: oldGroup.width,
      },
      field,
      value,
    )
    const newType = cascaded.boardType ?? ''
    // Cement is hang only by default, so picking it ticks the box and leaving it unticks it.
    // Any other change keeps what the measurer set — a base layer stays a base layer when its
    // thickness changes.
    const hangOnly =
      field === 'boardType' && newType !== oldGroup.boardType
        ? defaultHangOnlyForBoardType(newType) ||
          (oldGroup.hangOnly && !defaultHangOnlyForBoardType(oldGroup.boardType))
        : oldGroup.hangOnly
    const newGroup: SpecGroup = {
      id: groupId,
      boardType: newType,
      thickness: cascaded.thickness ?? '',
      width: cascaded.width ?? '',
      hangOnly,
    }
    const availableLengths = getAvailableLengths(
      newGroup.boardType,
      newGroup.width,
      newGroup.thickness,
    )

    setGroupsByArea((prev) => ({
      ...prev,
      [areaId]: (prev[areaId] ?? []).map((g) => (g.id === groupId ? newGroup : g)),
    }))

    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) => {
        if (m.id !== areaId) return m
        const boards: FieldMeasurementBoard[] = []
        for (const b of m.boards) {
          if (!boardMatchesSpec(b, oldGroup)) {
            boards.push(b)
            continue
          }
          const length = b.length ?? ''
          // Keep quantities only for lengths that still exist under the new spec.
          if (length && availableLengths.includes(length)) {
            boards.push({
              ...b,
              boardType: newGroup.boardType,
              thickness: newGroup.thickness,
              width: newGroup.width,
              hangOnly: newGroup.hangOnly,
            })
          }
        }
        return { ...m, boards }
      }),
    }))
  }

  const setLengthQuantity = (
    areaId: string,
    group: SpecGroup,
    length: string,
    rawQty: string,
  ) => {
    const qty = rawQty.trim()
    const cleared = qty === '' || Number(qty) <= 0

    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) => {
        if (m.id !== areaId) return m
        const idx = m.boards.findIndex(
          (b) => boardMatchesSpec(b, group) && (b.length ?? '') === length,
        )
        if (cleared) {
          if (idx < 0) return m
          return { ...m, boards: m.boards.filter((_, i) => i !== idx) }
        }
        if (idx >= 0) {
          const boards = m.boards.map((b, i) => (i === idx ? { ...b, quantity: qty } : b))
          return { ...m, boards }
        }
        return {
          ...m,
          boards: [
            ...m.boards,
            {
              id: generateFieldId(),
              boardType: group.boardType,
              thickness: group.thickness,
              width: group.width,
              hangOnly: group.hangOnly,
              length,
              quantity: qty,
            },
          ],
        }
      }),
    }))
  }

  const setGroupHangOnly = (areaId: string, group: SpecGroup, hangOnly: boolean) => {
    setGroupsByArea((prev) => ({
      ...prev,
      [areaId]: (prev[areaId] ?? []).map((g) => (g.id === group.id ? { ...g, hangOnly } : g)),
    }))
    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) =>
        m.id === areaId
          ? {
              ...m,
              boards: m.boards.map((b) => (boardMatchesSpec(b, group) ? { ...b, hangOnly } : b)),
            }
          : m,
      ),
    }))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Measurement log</CardTitle>
        <CardDescription>
          Break the job into areas with board sizes. Total:{' '}
          <strong>{total.toLocaleString()} sqft</strong>
          {hangOnlyTotal > 0 ? (
            <>
              {' '}
              — {Math.round(total - hangOnlyTotal).toLocaleString()} finished,{' '}
              {Math.round(hangOnlyTotal).toLocaleString()} hang only
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addArea}>
            <Plus className="h-4 w-4 mr-1" />
            Add area
          </Button>
        )}

        {takeoff.measurements.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            No measurements yet.
          </p>
        ) : (
          takeoff.measurements.map((area) => {
            const areaSqft = computeMeasuredSqft([area])
            const areaHangOnly = hangOnlyMeasuredSqft([area])
            const groups = groupsByArea[area.id] ?? deriveGroupsFromBoards(area.boards)
            // Flipping a spec onto a twin that already exists would merge two rows' counts
            // silently, so the box is disabled instead.
            const twinOf = (group: SpecGroup) =>
              groups.some(
                (g) =>
                  g.id !== group.id &&
                  g.boardType === group.boardType &&
                  g.thickness === group.thickness &&
                  g.width === group.width &&
                  g.hangOnly !== group.hangOnly,
              )
            return (
              <div key={area.id} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {areaSqft.toLocaleString()} sqft in this area
                    {areaHangOnly > 0
                      ? ` · ${Math.round(areaHangOnly).toLocaleString()} hang only`
                      : ''}
                  </span>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeArea(area.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Area name</Label>
                  <Input
                    value={area.area ?? ''}
                    disabled={readOnly}
                    placeholder="e.g. 2nd floor — east wing"
                    onChange={(e) => updateArea(area.id, { area: e.target.value })}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Board specs</Label>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSpecGroup(area.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add board spec
                      </Button>
                    )}
                  </div>

                  {groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">
                      No board specs yet.
                    </p>
                  ) : (
                    groups.map((group) => {
                      const lengths =
                        group.boardType && group.width
                          ? getAvailableLengths(
                              group.boardType,
                              group.width,
                              group.thickness,
                            )
                          : []
                      return (
                        <div
                          key={group.id}
                          className="rounded-md border bg-background p-3 space-y-3"
                        >
                          <div className="flex items-start gap-2">
                            <div className="grid flex-1 grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Board type</Label>
                                <Select
                                  value={group.boardType || undefined}
                                  disabled={readOnly}
                                  onValueChange={(v) =>
                                    updateGroupSpec(area.id, group.id, 'boardType', v)
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FIELD_BOARD_TYPES.map((t) => (
                                      <SelectItem key={t} value={t}>
                                        {t}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Thickness</Label>
                                <Select
                                  value={group.thickness || undefined}
                                  disabled={readOnly || !group.boardType}
                                  onValueChange={(v) =>
                                    updateGroupSpec(area.id, group.id, 'thickness', v)
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Thickness" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getAvailableThicknesses(group.boardType).map((th) => (
                                      <SelectItem key={th} value={th}>
                                        {formatThicknessLabel(th)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Width</Label>
                                <Select
                                  value={group.width || undefined}
                                  disabled={readOnly || !group.boardType}
                                  onValueChange={(v) =>
                                    updateGroupSpec(area.id, group.id, 'width', v)
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Width" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getAvailableWidths(
                                      group.boardType,
                                      group.thickness,
                                    ).map((w) => (
                                      <SelectItem key={w} value={w}>
                                        {w}&quot;
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {!readOnly && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 mt-5"
                                onClick={() => removeSpecGroup(area.id, group)}
                                aria-label="Remove board spec"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>

                          <label
                            className={`flex items-center gap-2 text-xs ${
                              twinOf(group) ? 'text-muted-foreground' : ''
                            }`}
                            title={
                              twinOf(group)
                                ? 'This board already has a row for the other setting in this area — enter counts there.'
                                : undefined
                            }
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={group.hangOnly}
                              disabled={readOnly || !group.boardType || twinOf(group)}
                              onChange={(e) => setGroupHangOnly(area.id, group, e.target.checked)}
                            />
                            <span>
                              Hang only — not finished{' '}
                              <span className="text-muted-foreground">
                                (Hardi, or the base layer of a double layer)
                              </span>
                            </span>
                          </label>

                          {lengths.length > 0 ? (
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                Quantity by length
                              </Label>
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                {lengths.map((len) => (
                                  <div
                                    key={len}
                                    className="rounded-md border bg-muted/30 px-2 py-1.5 space-y-1"
                                  >
                                    <div className="text-xs font-medium text-center tabular-nums">
                                      {len}&apos;
                                    </div>
                                    <Input
                                      type="number"
                                      min={0}
                                      inputMode="numeric"
                                      className="h-10 text-center text-base tabular-nums px-1"
                                      disabled={readOnly}
                                      placeholder="—"
                                      value={quantityForLength(area.boards, group, len)}
                                      onChange={(e) =>
                                        setLengthQuantity(
                                          area.id,
                                          group,
                                          len,
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Choose type and width to enter quantities by length.
                            </p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Area notes</Label>
                  <Textarea
                    rows={2}
                    value={area.notes ?? ''}
                    disabled={readOnly}
                    onChange={(e) => updateArea(area.id, { notes: e.target.value })}
                  />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
