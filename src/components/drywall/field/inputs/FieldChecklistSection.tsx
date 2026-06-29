import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { FieldTakeoff } from '@/types/drywall'

export interface FieldChecklistSectionProps {
  takeoff: FieldTakeoff
  readOnly: boolean
  onToggleItem: (id: string) => void
}

export function FieldChecklistSection({
  takeoff,
  readOnly,
  onToggleItem,
}: FieldChecklistSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Field checklist</CardTitle>
        <CardDescription>
          {takeoff.checklist.filter((c) => c.completed).length} of {takeoff.checklist.length}{' '}
          complete
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {takeoff.checklist.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={readOnly}
            onClick={() => onToggleItem(item.id)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
              readOnly ? 'cursor-default opacity-80' : 'cursor-pointer active:bg-muted/60',
              item.completed && 'border-emerald-500/30 bg-emerald-500/5',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-xs font-bold',
                item.completed
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-muted-foreground/40 bg-background',
              )}
              aria-hidden
            >
              {item.completed ? '✓' : ''}
            </span>
            <span className="text-sm">{item.label}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
