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
import type { FieldMeasurementArea, FieldMeasurementBoard, FieldTakeoff } from '@/types/drywall'
import type { SetFieldTakeoff } from './fieldTakeoffState'

interface FieldMeasurementsSectionProps {
  takeoff: FieldTakeoff
  readOnly: boolean
  onChange: SetFieldTakeoff
}

export function FieldMeasurementsSection({
  takeoff,
  readOnly,
  onChange,
}: FieldMeasurementsSectionProps) {
  const total = computeMeasuredSqft(takeoff.measurements)

  const addArea = () => {
    onChange((prev) => ({
      ...prev,
      measurements: [
        ...prev.measurements,
        { id: generateFieldId(), area: '', notes: '', boards: [] },
      ],
    }))
  }

  const removeArea = (id: string) => {
    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.filter((m) => m.id !== id),
    }))
  }

  const updateArea = (id: string, patch: Partial<FieldMeasurementArea>) => {
    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }

  const addBoard = (areaId: string) => {
    onChange((prev) => {
      const area = prev.measurements.find((m) => m.id === areaId)
      if (!area) return prev
      return {
        ...prev,
        measurements: prev.measurements.map((m) =>
          m.id === areaId
            ? {
                ...m,
                boards: [
                  ...m.boards,
                  {
                    id: generateFieldId(),
                    boardType: '',
                    thickness: '',
                    width: '',
                    length: '',
                    quantity: '',
                  },
                ],
              }
            : m,
        ),
      }
    })
  }

  const updateBoard = (
    areaId: string,
    boardId: string,
    field: keyof FieldMeasurementBoard,
    value: string,
  ) => {
    onChange((prev) => {
      const area = prev.measurements.find((m) => m.id === areaId)
      if (!area) return prev

      const boards = area.boards.map((b) => {
        if (b.id !== boardId) return b
        if (
          field === 'boardType' ||
          field === 'thickness' ||
          field === 'width' ||
          field === 'length'
        ) {
          return applyBoardFieldChange(b, field, value) as FieldMeasurementBoard
        }
        return { ...b, [field]: value }
      })

      return {
        ...prev,
        measurements: prev.measurements.map((m) =>
          m.id === areaId ? { ...m, boards } : m,
        ),
      }
    })
  }

  const removeBoard = (areaId: string, boardId: string) => {
    onChange((prev) => ({
      ...prev,
      measurements: prev.measurements.map((m) =>
        m.id === areaId ? { ...m, boards: m.boards.filter((b) => b.id !== boardId) } : m,
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
            return (
              <div key={area.id} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {areaSqft.toLocaleString()} sqft in this area
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Board entries</Label>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addBoard(area.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add board
                      </Button>
                    )}
                  </div>
                  {area.boards.map((board) => (
                    <div
                      key={board.id}
                      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 p-2 border rounded-md bg-background"
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">Board type</Label>
                        <Select
                          value={board.boardType || ''}
                          disabled={readOnly}
                          onValueChange={(v) => updateBoard(area.id, board.id, 'boardType', v)}
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
                          value={board.thickness || ''}
                          disabled={readOnly || !board.boardType}
                          onValueChange={(v) => updateBoard(area.id, board.id, 'thickness', v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Thickness" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableThicknesses(board.boardType || '').map((th) => (
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
                          value={board.width || ''}
                          disabled={readOnly || !board.boardType}
                          onValueChange={(v) => updateBoard(area.id, board.id, 'width', v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Width" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableWidths(board.boardType || '', board.thickness || '').map(
                              (w) => (
                                <SelectItem key={w} value={w}>
                                  {w}&quot;
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Length</Label>
                        <Select
                          value={board.length || ''}
                          disabled={readOnly || !board.boardType || !board.width}
                          onValueChange={(v) => updateBoard(area.id, board.id, 'length', v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Length" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableLengths(
                              board.boardType || '',
                              board.width || '',
                              board.thickness || '',
                            ).map((len) => (
                              <SelectItem key={len} value={len}>
                                {len}&apos;
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Quantity</Label>
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            min={1}
                            className="h-9"
                            disabled={readOnly}
                            value={board.quantity ?? ''}
                            onChange={(e) =>
                              updateBoard(area.id, board.id, 'quantity', e.target.value)
                            }
                          />
                          {!readOnly && area.boards.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0"
                              onClick={() => removeBoard(area.id, board.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
