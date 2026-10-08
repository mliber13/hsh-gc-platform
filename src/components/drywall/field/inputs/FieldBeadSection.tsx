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
import {
  BEAD_PROFILES,
  NO_LENGTH,
  beadProfilesInUse,
  beadQuantity,
  beadTileLengths,
  beadTotals,
  changeBeadProfile,
  isOffListLength,
  removeBeadProfile,
  setBeadQuantity,
} from '@/lib/drywall/fieldBeadGrid'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import type { FieldTakeoff } from '@/types/drywall'
import type { SetFieldTakeoff } from '../fieldTakeoffState'

interface FieldBeadSectionProps {
  takeoff: FieldTakeoff
  readOnly: boolean
  onChange: SetFieldTakeoff
}

/** UI-only — a profile picked but not yet counted has no row to derive it from. */
type ProfileGroup = { id: string; profile: string }

function formatTotals(sticks: number, linearFeet: number): string {
  const s = `${sticks.toLocaleString()} stick${sticks === 1 ? '' : 's'}`
  return linearFeet > 0 ? `${s} · ${linearFeet.toLocaleString()} LF` : s
}

/**
 * Corner bead by profile and stick length — the board-spec pattern applied to bead.
 *
 * Writes the same "Corner Bead" accessory rows the Accessories section used to hold, so the
 * compound calculation, the material order PDF and the crew materials card read it unchanged.
 * See `fieldBeadGrid` for the one deliberate difference from boards: no count is dropped when
 * a profile changes.
 */
export function FieldBeadSection({ takeoff, readOnly, onChange }: FieldBeadSectionProps) {
  const [groups, setGroups] = useState<ProfileGroup[]>(() =>
    beadProfilesInUse(takeoff.accessories).map((profile) => ({ id: generateFieldId(), profile })),
  )

  // Rows can arrive after mount (load, reload, a crew submission being reviewed). Give every
  // profile that has counts a group; never drop an in-progress empty one.
  useEffect(() => {
    const inUse = beadProfilesInUse(takeoff.accessories)
    setGroups((prev) => {
      const missing = inUse.filter((p) => !prev.some((g) => g.profile === p))
      if (missing.length === 0) return prev
      return [...prev, ...missing.map((profile) => ({ id: generateFieldId(), profile }))]
    })
  }, [takeoff.accessories])

  const total = beadTotals(takeoff.accessories)

  const addGroup = () => {
    setGroups((prev) => [...prev, { id: generateFieldId(), profile: '' }])
  }

  const removeGroup = (group: ProfileGroup) => {
    setGroups((prev) => prev.filter((g) => g.id !== group.id))
    if (group.profile) {
      onChange((prev) => ({
        ...prev,
        accessories: removeBeadProfile(prev.accessories, group.profile),
      }))
    }
  }

  const changeProfile = (group: ProfileGroup, profile: string) => {
    setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, profile } : g)))
    if (group.profile) {
      onChange((prev) => ({
        ...prev,
        accessories: changeBeadProfile(prev.accessories, group.profile, profile),
      }))
    }
  }

  const setQuantity = (profile: string, length: string, raw: string) => {
    onChange((prev) => ({
      ...prev,
      accessories: setBeadQuantity(prev.accessories, profile, length, raw),
    }))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Corner bead</CardTitle>
        <CardDescription>
          Pieces by profile and stick length. Total: <strong>{formatTotals(total.sticks, total.linearFeet)}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addGroup}>
            <Plus className="h-4 w-4 mr-1" />
            Add bead profile
          </Button>
        )}

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            No bead yet.
          </p>
        ) : (
          groups.map((group) => {
            const taken = new Set(groups.filter((g) => g.id !== group.id).map((g) => g.profile))
            const options = BEAD_PROFILES.filter((p) => !taken.has(p))
            // A stored profile outside the list (renamed since) still has to be selectable.
            if (group.profile && !options.includes(group.profile)) options.unshift(group.profile)
            const lengths = group.profile ? beadTileLengths(takeoff.accessories, group.profile) : []
            const sub = group.profile ? beadTotals(takeoff.accessories, group.profile) : null

            return (
              <div key={group.id} className="rounded-md border bg-background p-3 space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1 sm:max-w-xs">
                    <Label className="text-xs">Profile</Label>
                    <Select
                      value={group.profile || undefined}
                      disabled={readOnly}
                      onValueChange={(v) => changeProfile(group, v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {sub && sub.sticks > 0 && (
                    <span className="pb-2 text-sm text-muted-foreground tabular-nums">
                      {formatTotals(sub.sticks, sub.linearFeet)}
                    </span>
                  )}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-9 w-9 shrink-0"
                      onClick={() => removeGroup(group)}
                      aria-label="Remove bead profile"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {lengths.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Pieces by length</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {lengths.map((len) => {
                        const offList = isOffListLength(group.profile, len)
                        return (
                          <div
                            key={len || 'no-length'}
                            className={`rounded-md border px-2 py-1.5 space-y-1 ${
                              offList ? 'border-amber-500/40 bg-amber-500/10' : 'bg-muted/30'
                            }`}
                            title={
                              offList
                                ? len === NO_LENGTH
                                  ? 'Saved without a length — kept so the count is not lost'
                                  : `Not a stock length for ${group.profile} — kept so the count is not lost`
                                : undefined
                            }
                          >
                            <div className="text-xs font-medium text-center tabular-nums">
                              {len === NO_LENGTH ? 'No length' : len}
                            </div>
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              className="h-10 text-center text-base tabular-nums px-1"
                              disabled={readOnly}
                              placeholder="—"
                              value={beadQuantity(takeoff.accessories, group.profile, len)}
                              onChange={(e) => setQuantity(group.profile, len, e.target.value)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Choose a profile to enter pieces by length.
                  </p>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
