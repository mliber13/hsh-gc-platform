import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Calculator, Package, Plus, Trash2 } from 'lucide-react'
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
import {
  calculateFieldAccessories,
  mergeAutoAccessories,
  quoteInputFromDrywallQuote,
  totalManualCornerBeadQuantity,
} from '@/lib/drywall/accessoryCalc'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  FIELD_MATERIAL_OPTIONS,
  getDefaultUnit,
  getFacingOptions,
  getLengthOptions,
  getSubtypeOptions,
  getThreadTypeOptions,
  getUnitOptions,
  shouldShowFacing,
  shouldShowLength,
  shouldShowThreadType,
} from '@/lib/drywall/fieldAccessoryUi'
import type { DrywallQuote, FieldAccessoryEntry, FieldTakeoff } from '@/types/drywall'
import type { SetFieldTakeoff } from '../fieldTakeoffState'

interface Props {
  takeoff: FieldTakeoff
  measuredSqft: number
  quote: DrywallQuote | null
  readOnly: boolean
  onChange: SetFieldTakeoff
  /** Crew measurer V1 — manual entry only; operator keeps auto-calc. */
  disableAutoCalc?: boolean
}

export function FieldAccessoriesSection({
  takeoff,
  measuredSqft,
  quote,
  readOnly,
  onChange,
  disableAutoCalc = false,
}: Props) {
  const cornerBeadQty = useMemo(
    () => totalManualCornerBeadQuantity(takeoff.accessories),
    [takeoff.accessories],
  )

  const quoteInput = useMemo(() => quoteInputFromDrywallQuote(quote), [quote])

  /** What the current measurements imply, without writing it anywhere. */
  const autoNow = useMemo(
    () =>
      measuredSqft > 0 ? calculateFieldAccessories(measuredSqft, cornerBeadQty, quoteInput) : [],
    [measuredSqft, cornerBeadQty, quoteInput],
  )

  const hasAutoRows = takeoff.accessories.some((acc) => acc.autoCalculated)

  /** True when the stored accessories no longer match the measurements on screen. */
  const staleVsMeasurements = useMemo(() => {
    if (readOnly || disableAutoCalc) return false
    const merged = mergeAutoAccessories(takeoff.accessories, autoNow)
    return JSON.stringify(merged) !== JSON.stringify(takeoff.accessories)
  }, [readOnly, disableAutoCalc, takeoff.accessories, autoNow])

  const recalculate = useCallback(() => {
    onChange((prev) => {
      const merged = mergeAutoAccessories(prev.accessories, autoNow)
      if (JSON.stringify(merged) === JSON.stringify(prev.accessories)) return prev
      return { ...prev, accessories: merged }
    })
  }, [autoNow, onChange])

  // This used to run on EVERY change to measured sqft or bead count, so accessories rewrote
  // themselves as the operator typed and the page never settled — Mark, 2026-09-30: "it
  // auto-calculates accessories every time".
  //
  // It now fills at most once per mount, so a fresh takeoff still populates without being
  // asked. After that the operator presses Recalculate, and `staleVsMeasurements` says when
  // it is worth pressing — removing the effect outright would trade an annoyance for
  // silently ordering material off stale counts.
  //
  // The guard is a ref rather than `hasAutoRows`, because deleting the last auto row would
  // otherwise re-add the whole set on the very next render: a row you deleted on purpose has
  // to stay deleted.
  const autoFilled = useRef(false)
  useEffect(() => {
    if (readOnly || disableAutoCalc) return
    if (autoFilled.current) return
    if (hasAutoRows) {
      // Loaded with rows already — nothing to fill, and nothing to do later either.
      autoFilled.current = true
      return
    }
    if (measuredSqft <= 0) return
    autoFilled.current = true
    recalculate()
  }, [readOnly, disableAutoCalc, measuredSqft, hasAutoRows, recalculate])

  const handleAddAccessory = () => {
    onChange((prev) => ({
      ...prev,
      accessories: [
        {
          id: generateFieldId(),
          type: '',
          subtype: '',
          quantity: '',
          unit: 'pcs',
          autoCalculated: false,
          length: '',
          threadType: '',
          facing: '',
        },
        ...prev.accessories,
      ],
    }))
  }

  const handleAccessoryChange = (id: string, field: keyof FieldAccessoryEntry, value: string) => {
    onChange((prev) => ({
      ...prev,
      accessories: prev.accessories.map((acc) => {
        if (acc.id !== id) return acc
        const updated = { ...acc, [field]: value } as FieldAccessoryEntry

        if (field === 'quantity' && acc.autoCalculated) {
          updated.manuallyEdited = true
        }
        if (field === 'type') {
          updated.subtype = ''
          updated.length = ''
          updated.threadType = ''
          updated.facing = ''
          updated.unit = getDefaultUnit(value, '')
          if (acc.autoCalculated) updated.manuallyEdited = false
        }
        if (field === 'subtype' && acc.type === 'Joint Compound') {
          updated.unit = getDefaultUnit(acc.type, value)
        }
        // Switching R-13 batts to rigid board would otherwise leave a facing
        // behind that the new item can't have.
        if (field === 'subtype' && !shouldShowFacing(acc.type || '', value)) {
          updated.facing = ''
        }
        return updated
      }),
    }))
  }

  const handleRemoveAccessory = (id: string) => {
    onChange((prev) => ({
      ...prev,
      accessories: prev.accessories.filter((acc) => acc.id !== id),
    }))
  }

  const handleResetAccessory = (id: string) => {
    if (measuredSqft <= 0) return
    const autoAccessories = calculateFieldAccessories(measuredSqft, cornerBeadQty, quoteInput)

    onChange((prev) => {
      const resetAcc = prev.accessories.find((acc) => acc.id === id)
      if (!resetAcc?.autoCalculated) return prev

      const matchingAuto = autoAccessories.find(
        (autoAcc) =>
          autoAcc.type === resetAcc.type &&
          autoAcc.subtype === resetAcc.subtype &&
          (autoAcc.threadType || '') === (resetAcc.threadType || '') &&
          (autoAcc.length || '') === (resetAcc.length || ''),
      )

      if (!matchingAuto) return prev

      return {
        ...prev,
        accessories: prev.accessories.map((acc) =>
          acc.id === id
            ? { ...acc, quantity: matchingAuto.quantity, manuallyEdited: false }
            : acc,
        ),
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5" />
          Accessories & materials
        </CardTitle>
        <CardDescription>
          {disableAutoCalc
            ? 'Add accessories manually. The office can auto-calculate during review.'
            : 'Calculated from measured sqft and ceiling finish. Add corner bead manually, then recalculate when the measurements are settled — quantities you have edited by hand are kept.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The prompt that replaces the old constant rewriting: it says when recalculating
            would change something, so stale counts cannot quietly reach a material order. */}
        {!readOnly && !disableAutoCalc && staleVsMeasurements && hasAutoRows && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-amber-900 dark:text-amber-200">
              These quantities no longer match the measurements.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={recalculate}>
              <Calculator className="mr-1 h-3 w-3" />
              Recalculate
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium">All accessories</Label>
          {!readOnly && (
            <div className="flex items-center gap-2">
              {!disableAutoCalc && measuredSqft > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={recalculate}
                  disabled={!staleVsMeasurements}
                  title={
                    staleVsMeasurements
                      ? 'Recalculate from the current measurements'
                      : 'Already matches the measurements'
                  }
                >
                  <Calculator className="mr-1 h-3 w-3" />
                  Recalculate
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={handleAddAccessory}>
                <Plus className="h-3 w-3 mr-1" />
                Add manual
              </Button>
            </div>
          )}
        </div>

        {takeoff.accessories.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            {disableAutoCalc
              ? 'No accessories yet. Tap Add manual to enter items.'
              : measuredSqft > 0
                ? 'Add measurements to see auto-calculated accessories, or add manual items.'
                : 'Add measurements first, or add manual accessories.'}
          </p>
        ) : (
          <div className="space-y-3">
            {takeoff.accessories.map((acc, index) => (
              <div
                key={acc.id}
                className={`p-4 rounded-lg border space-y-3 ${
                  acc.autoCalculated
                    ? 'border-sky-500/30 bg-sky-500/10'
                    : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {acc.autoCalculated && (
                      <span className="text-xs rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 font-medium text-sky-700 dark:text-sky-300">
                        Auto
                      </span>
                    )}
                    {acc.manuallyEdited && (
                      <span className="text-xs rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                        Edited
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                  </div>
                  <div className="flex gap-1">
                    {acc.autoCalculated && acc.manuallyEdited && !readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Reset to auto-calculated value"
                        onClick={() => handleResetAccessory(acc.id)}
                      >
                        <Calculator className="h-3 w-3" />
                      </Button>
                    )}
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleRemoveAccessory(acc.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div
                  className={`grid grid-cols-2 gap-3 ${
                    shouldShowLength(acc.type || '') ||
                    shouldShowThreadType(acc.type || '') ||
                    shouldShowFacing(acc.type || '', acc.subtype || '')
                      ? 'md:grid-cols-[2fr_2fr_1fr_1fr_1fr]'
                      : 'md:grid-cols-[2fr_2fr_1fr_1fr]'
                  }`}
                >
                  <div className="space-y-1">
                    <Label className="text-xs">Material type</Label>
                    <Select
                      value={acc.type || ''}
                      disabled={readOnly || acc.autoCalculated}
                      onValueChange={(v) => handleAccessoryChange(acc.id, 'type', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_MATERIAL_OPTIONS.map((cat) => (
                          <SelectItem key={cat.category} value={cat.category}>
                            {cat.category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Item</Label>
                    <Select
                      value={acc.subtype || ''}
                      disabled={readOnly || !acc.type || acc.autoCalculated}
                      onValueChange={(v) => handleAccessoryChange(acc.id, 'subtype', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Item" />
                      </SelectTrigger>
                      <SelectContent>
                        {getSubtypeOptions(acc.type || '').map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {shouldShowLength(acc.type || '') && (
                    <div className="space-y-1">
                      <Label className="text-xs">Length</Label>
                      <Select
                        value={acc.length || ''}
                        disabled={readOnly || !acc.subtype || acc.autoCalculated}
                        onValueChange={(v) => handleAccessoryChange(acc.id, 'length', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Length" />
                        </SelectTrigger>
                        <SelectContent>
                          {getLengthOptions(acc.type || '', acc.subtype || '').map((length) => (
                            <SelectItem key={length} value={length}>
                              {length}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {shouldShowFacing(acc.type || '', acc.subtype || '') && (
                    <div className="space-y-1">
                      <Label className="text-xs">Facing</Label>
                      <Select
                        value={acc.facing || ''}
                        disabled={readOnly || !acc.subtype || acc.autoCalculated}
                        onValueChange={(v) => handleAccessoryChange(acc.id, 'facing', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Facing" />
                        </SelectTrigger>
                        <SelectContent>
                          {getFacingOptions(acc.type || '', acc.subtype || '').map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {shouldShowThreadType(acc.type || '') && (
                    <div className="space-y-1">
                      <Label className="text-xs">Thread</Label>
                      <Select
                        value={acc.threadType || ''}
                        disabled={readOnly || !acc.subtype || acc.autoCalculated}
                        onValueChange={(v) => handleAccessoryChange(acc.id, 'threadType', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {getThreadTypeOptions(acc.type || '').map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      className="h-9"
                      disabled={readOnly}
                      value={acc.quantity ?? ''}
                      onChange={(e) => handleAccessoryChange(acc.id, 'quantity', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Select
                      value={acc.unit || 'pcs'}
                      disabled={readOnly || acc.autoCalculated}
                      onValueChange={(v) => handleAccessoryChange(acc.id, 'unit', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getUnitOptions(acc.type || '').map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
