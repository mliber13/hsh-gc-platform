import { useEffect, useMemo } from 'react'
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
  getLengthOptions,
  getSubtypeOptions,
  getThreadTypeOptions,
  getUnitOptions,
  shouldShowLength,
  shouldShowThreadType,
} from '@/lib/drywall/fieldAccessoryUi'
import type { DrywallQuote, FieldAccessoryEntry, FieldTakeoff } from '@/types/drywall'
import type { SetFieldTakeoff } from './fieldTakeoffState'

interface Props {
  takeoff: FieldTakeoff
  measuredSqft: number
  quote: DrywallQuote | null
  readOnly: boolean
  onChange: SetFieldTakeoff
}

export function FieldAccessoriesSection({
  takeoff,
  measuredSqft,
  quote,
  readOnly,
  onChange,
}: Props) {
  const cornerBeadQty = useMemo(
    () => totalManualCornerBeadQuantity(takeoff.accessories),
    [takeoff.accessories],
  )

  const quoteInput = useMemo(() => quoteInputFromDrywallQuote(quote), [quote])

  useEffect(() => {
    if (readOnly) return

    if (measuredSqft <= 0) {
      onChange((prev) => {
        const manualOnly = prev.accessories.filter((acc) => !acc.autoCalculated)
        if (manualOnly.length === prev.accessories.length) return prev
        return { ...prev, accessories: manualOnly }
      })
      return
    }

    onChange((prev) => {
      const autoAccessories = calculateFieldAccessories(measuredSqft, cornerBeadQty, quoteInput)
      const merged = mergeAutoAccessories(prev.accessories, autoAccessories)
      if (JSON.stringify(merged) === JSON.stringify(prev.accessories)) return prev
      return { ...prev, accessories: merged }
    })
  }, [measuredSqft, cornerBeadQty, quoteInput, readOnly, onChange])

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
          updated.unit = getDefaultUnit(value, '')
          if (acc.autoCalculated) updated.manuallyEdited = false
        }
        if (field === 'subtype' && acc.type === 'Joint Compound') {
          updated.unit = getDefaultUnit(acc.type, value)
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
          Auto-calculated from measured sqft and ceiling finish. Add corner bead manually; quantities
          recalculate when measurements change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">All accessories</Label>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={handleAddAccessory}>
              <Plus className="h-3 w-3 mr-1" />
              Add manual
            </Button>
          )}
        </div>

        {takeoff.accessories.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            {measuredSqft > 0
              ? 'Add measurements to see auto-calculated accessories, or add manual items.'
              : 'Add measurements first, or add manual accessories.'}
          </p>
        ) : (
          <div className="space-y-3">
            {takeoff.accessories.map((acc, index) => (
              <div
                key={acc.id}
                className={`p-4 rounded-lg border space-y-3 ${
                  acc.autoCalculated ? 'bg-blue-50/80 border-blue-200' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {acc.autoCalculated && (
                      <span className="text-xs rounded border px-1.5 py-0.5 bg-blue-100">
                        Auto
                      </span>
                    )}
                    {acc.manuallyEdited && (
                      <span className="text-xs rounded border px-1.5 py-0.5 bg-amber-50">
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
                  className={`grid gap-3 ${
                    shouldShowLength(acc.type || '') && shouldShowThreadType(acc.type || '')
                      ? 'md:grid-cols-6'
                      : shouldShowLength(acc.type || '') || shouldShowThreadType(acc.type || '')
                        ? 'md:grid-cols-5'
                        : 'md:grid-cols-4'
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

                  {shouldShowThreadType(acc.type || '') && (
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {acc.type === 'Metal Studs' || acc.type === 'Metal Track'
                          ? 'Grade'
                          : 'Thread'}
                      </Label>
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
