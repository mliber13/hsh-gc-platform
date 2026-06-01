import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DrywallQuote } from '@/types/drywall'
import { NumField, SectionDivider } from './quoteFormPrimitives'
import { ACOUSTIC_TILE_SIZES } from './quoteUiConstants'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteAcousticCeilingPanel({ quote, readOnly, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tile size</Label>
          <Select
            disabled={readOnly}
            value={quote.acousticCeilingTileSize || '2x4'}
            onValueChange={(v) => onChange({ acousticCeilingTileSize: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACOUSTIC_TILE_SIZES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumField
          label="Project sqft"
          value={quote.acousticCeilingSqft}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ acousticCeilingSqft: v })}
        />
        <NumField
          label="Perimeter (LF)"
          value={quote.acousticCeilingPerimeter}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ acousticCeilingPerimeter: v })}
        />
        <NumField
          label="Waste %"
          value={quote.acousticCeilingWastePercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ acousticCeilingWastePercentage: v })}
        />
        <NumField
          label="Tile ($/sqft)"
          value={quote.acousticCeilingTileRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticCeilingTileRate: v })}
        />
        <NumField
          label="Labor ($/sqft)"
          value={quote.acousticCeilingLaborRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticCeilingLaborRate: v })}
        />
      </div>

      <SectionDivider title="Grid components" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumField
          label="Wall angle count"
          value={quote.acousticWallAngleCount}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ acousticWallAngleCount: v })}
        />
        <NumField
          label="Wall angle rate"
          value={quote.acousticWallAngleRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticWallAngleRate: v })}
        />
        <NumField
          label="Mains count"
          value={quote.acousticMainsCount}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ acousticMainsCount: v })}
        />
        <NumField
          label="Mains rate"
          value={quote.acousticMainsRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticMainsRate: v })}
        />
        <NumField
          label="4ft tees count"
          value={quote.acousticTees4ftCount}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ acousticTees4ftCount: v })}
        />
        <NumField
          label="4ft tees rate"
          value={quote.acousticTees4ftRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticTees4ftRate: v })}
        />
        <NumField
          label="2ft tees count"
          value={quote.acousticTees2ftCount}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ acousticTees2ftCount: v })}
        />
        <NumField
          label="2ft tees rate"
          value={quote.acousticTees2ftRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticTees2ftRate: v })}
        />
        <NumField
          label="Wire (LF)"
          value={quote.acousticWireLinearFt}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticWireLinearFt: v })}
        />
        <NumField
          label="Wire rate"
          value={quote.acousticWireRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticWireRate: v })}
        />
        <NumField
          label="Lags count"
          value={quote.acousticLagsCount}
          readOnly={readOnly}
          step="1"
          onChange={(v) => onChange({ acousticLagsCount: v })}
        />
        <NumField
          label="Lags rate"
          value={quote.acousticLagsRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ acousticLagsRate: v })}
        />
      </div>
    </div>
  )
}
