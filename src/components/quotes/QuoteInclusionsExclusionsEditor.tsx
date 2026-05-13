import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface QuoteInclusionsExclusionsEditorProps {
  title: string
  description?: string
  items: string[]
  onChange: (items: string[]) => void
}

export function QuoteInclusionsExclusionsEditor({
  title,
  description,
  items,
  onChange,
}: QuoteInclusionsExclusionsEditorProps) {
  const updateAt = (index: number, value: string) => {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const addRow = () => {
    onChange([...items, ''])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <Label className="text-xs text-muted-foreground">One bullet per row</Label>
        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No items yet — add bullets below.</p>
          )}
          {items.map((row, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={row}
                onChange={(e) => updateAt(i, e.target.value)}
                placeholder="Bullet text"
                className="font-normal"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeAt(i)} aria-label="Remove">
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-2 size-4" />
          Add
        </Button>
      </CardContent>
    </Card>
  )
}
