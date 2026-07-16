import { Calendar, FileText, Package } from 'lucide-react'
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
import { ScopeMarkdownEditor } from '@/components/drywall/quote/v3/ScopeMarkdownEditor'
import { appendScopeTemplate, ScopeTemplateChips } from '@/lib/drywall/scopeTemplateHelpers'
import {
  CEILING_EXCEPTION_TEMPLATES,
  CEILING_FINISH_OPTIONS,
  DRYWALL_THICKNESS_OPTIONS,
  HANG_EXCEPTION_TEMPLATES,
  WALL_EXCEPTION_TEMPLATES,
  WALL_FINISH_OPTIONS,
} from './quoteUiConstants'
import type { DrywallQuote } from '@/types/drywall'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteScopeSection({ quote, readOnly, onChange }: Props) {
  const useCustom = Boolean(quote.useCustomScopeOfWork)
  const ceilingFinish = String(quote.ceilingFinish ?? '')
  const wallFinish = String(quote.wallFinish ?? '')

  return (
    <div className="space-y-6">
      {/* Hang specifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-primary" />
            Hang specifications
          </CardTitle>
          <CardDescription>Specify drywall thickness for walls and ceilings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Ceiling thickness</Label>
              <Select
                disabled={readOnly}
                value={String(quote.ceilingThickness || '')}
                onValueChange={(v) => onChange({ ceilingThickness: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ceiling thickness" />
                </SelectTrigger>
                <SelectContent>
                  {DRYWALL_THICKNESS_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Wall thickness</Label>
              <Select
                disabled={readOnly}
                value={String(quote.wallThickness || '')}
                onValueChange={(v) => onChange({ wallThickness: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wall thickness" />
                </SelectTrigger>
                <SelectContent>
                  {DRYWALL_THICKNESS_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Hang exceptions &amp; special requirements</Label>
            <ScopeTemplateChips
              templates={HANG_EXCEPTION_TEMPLATES}
              readOnly={readOnly}
              onPick={(t) =>
                onChange({
                  hangExceptions: appendScopeTemplate(String(quote.hangExceptions ?? ''), t),
                })
              }
            />
            <Textarea
              rows={3}
              disabled={readOnly}
              value={String(quote.hangExceptions ?? '')}
              placeholder="e.g., 5/8 inch at garage firewall, moisture resistant drywall at wet walls…"
              onChange={(e) => onChange({ hangExceptions: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Finish specifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Finish specifications
          </CardTitle>
          <CardDescription>Texture and finish levels for walls and ceilings (used on quote PDF)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Ceiling finish</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Primary ceiling finish</Label>
                <Select
                  disabled={readOnly}
                  value={ceilingFinish}
                  onValueChange={(v) => onChange({ ceilingFinish: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ceiling finish" />
                  </SelectTrigger>
                  <SelectContent>
                    {CEILING_FINISH_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {ceilingFinish === 'Other' && (
                <div className="space-y-2">
                  <Label>Specify other ceiling finish</Label>
                  <Input
                    disabled={readOnly}
                    value={String(quote.ceilingFinishOther ?? '')}
                    placeholder="Enter custom ceiling finish"
                    onChange={(e) => onChange({ ceilingFinishOther: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Ceiling finish exceptions</Label>
              <ScopeTemplateChips
                templates={CEILING_EXCEPTION_TEMPLATES}
                readOnly={readOnly}
                onPick={(t) =>
                  onChange({
                    ceilingExceptions: appendScopeTemplate(
                      String(quote.ceilingExceptions ?? ''),
                      t,
                    ),
                  })
                }
              />
              <Textarea
                rows={2}
                disabled={readOnly}
                value={String(quote.ceilingExceptions ?? '')}
                placeholder="e.g., Master Bedroom and Great Room are Level 5 Smooth…"
                onChange={(e) => onChange({ ceilingExceptions: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Wall finish</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Primary wall finish</Label>
                <Select
                  disabled={readOnly}
                  value={wallFinish}
                  onValueChange={(v) => onChange({ wallFinish: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select wall finish" />
                  </SelectTrigger>
                  <SelectContent>
                    {WALL_FINISH_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {wallFinish === 'Other' && (
                <div className="space-y-2">
                  <Label>Specify other wall finish</Label>
                  <Input
                    disabled={readOnly}
                    value={String(quote.wallFinishOther ?? '')}
                    placeholder="Enter custom wall finish"
                    onChange={(e) => onChange({ wallFinishOther: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Wall finish exceptions</Label>
              <ScopeTemplateChips
                templates={WALL_EXCEPTION_TEMPLATES}
                readOnly={readOnly}
                onPick={(t) =>
                  onChange({
                    wallExceptions: appendScopeTemplate(String(quote.wallExceptions ?? ''), t),
                  })
                }
              />
              <Textarea
                rows={2}
                disabled={readOnly}
                value={String(quote.wallExceptions ?? '')}
                placeholder="e.g., Garage walls are Roll Texture…"
                onChange={(e) => onChange({ wallExceptions: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={useCustom}
                onChange={(e) => onChange({ useCustomScopeOfWork: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              <span className="font-medium">
                Use custom scope of work (replaces structured scope on quote)
              </span>
            </label>
            {useCustom ? (
              <div className="space-y-2">
                <Label>Custom scope of work</Label>
                <ScopeMarkdownEditor
                  value={String(quote.customScopeOfWork ?? '')}
                  readOnly={readOnly}
                  onChange={(next) => onChange({ customScopeOfWork: next })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Additional scope notes (optional)</Label>
                <Textarea
                  rows={3}
                  disabled={readOnly}
                  value={String(quote.scopeOfWork ?? '')}
                  placeholder="Additional notes that will appear on the quote"
                  onChange={(e) => onChange({ scopeOfWork: e.target.value })}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Duration inputs — feeds sidebar duration summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            Duration inputs
          </CardTitle>
          <CardDescription>
            Used for the drywall duration summary in the quote sidebar. Finish level comes from
            ceiling/wall finish above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Build type</Label>
              <Select
                disabled={readOnly}
                value={String(quote.buildType || 'new_build')}
                onValueChange={(v) => onChange({ buildType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_build">New build</SelectItem>
                  <SelectItem value="renovation">Renovation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Complexity</Label>
              <Select
                disabled={readOnly}
                value={String(quote.complexity || 'normal')}
                onValueChange={(v) => onChange({ complexity: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="complex">Complex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Boolean(quote.paperFloorsRequired)}
                onChange={(e) => onChange({ paperFloorsRequired: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              Paper floors required
            </label>
            <div className="space-y-2">
              <Label>Bead sticks (count)</Label>
              <Input
                type="number"
                min={0}
                disabled={readOnly}
                value={quote.beadSticks ?? ''}
                onChange={(e) => onChange({ beadSticks: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
