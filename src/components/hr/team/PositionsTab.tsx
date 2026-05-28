import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { JobPosition } from '@/types/hr'
import { generateHrId } from '@/lib/hrTeamUtils'

type PositionsTabProps = {
  positions: JobPosition[]
  readOnly: boolean
  onChange: (positions: JobPosition[]) => void
}

export function PositionsTab({ positions, readOnly, onChange }: PositionsTabProps) {
  const [draft, setDraft] = useState('')

  const addPosition = () => {
    const name = draft.trim()
    if (!name) return
    const exists = positions.some((p) => p.name.toLowerCase() === name.toLowerCase())
    if (exists) {
      setDraft('')
      return
    }
    onChange([...positions, { id: generateHrId(), name }])
    setDraft('')
  }

  const removePosition = (id: string) => {
    onChange(positions.filter((p) => p.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job positions</CardTitle>
        <CardDescription>
          Titles used when assigning employees and contractors. Saved with the team roster
          in Supabase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="flex flex-col gap-2 sm:flex-row sm:max-w-md">
            <Input
              placeholder="New position name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addPosition()
                }
              }}
            />
            <Button type="button" onClick={addPosition} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No positions defined.</p>
          ) : (
            positions.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-3 py-1 text-sm"
              >
                {p.name}
                {!readOnly && (
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={() => removePosition(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
