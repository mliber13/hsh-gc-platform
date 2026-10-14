import { useEffect, useState } from 'react'
import { Calendar, ChevronDown, ChevronRight, FileText, Package, Sparkles } from 'lucide-react'
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
import { ScopeMarkdownEditor } from '@/components/drywall/quote/v3/ScopeMarkdownEditor'
import { generateScopeOfWorkFromLineItems } from '@/lib/drywall/quoteScopeOfWorkGenerate'
import { ScopeTemplatePopover } from '@/lib/drywall/scopeTemplateHelpers'
import type { DrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import {
  CEILING_EXCEPTION_TEMPLATES,
  CEILING_FINISH_OPTIONS,
  DRYWALL_THICKNESS_OPTIONS,
  HANG_EXCEPTION_TEMPLATES,
  WALL_EXCEPTION_TEMPLATES,
  WALL_FINISH_OPTIONS,
} from '../quoteUiConstants'

type Props = {
  quote: DrywallQuoteV3
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuoteV3>) => void
  /** Bumped by the quote checklist's Scope chip to open this section. */
  openSignal?: number
}

export function QuoteStructuredScopeSection({ quote, catalogs, readOnly, onChange, openSignal }: Props) {
  const useCustom = Boolean(quote.use_custom_scope_of_work)
  const ceilingFinish = String(quote.ceiling_finish ?? '')
  const wallFinish = String(quote.wall_finish ?? '')
  // Folds to one line (Mark, 2026-10-14: "quite cumbersome"). A quote whose finishes are set
  // starts folded; a new one starts open, since that is when the scope is being written.
  const [open, setOpen] = useState(() => !ceilingFinish && !wallFinish)
  useEffect(() => {
    if (openSignal) setOpen(true)
  }, [openSignal])
  const scopeSummary = [
    ceilingFinish || quote.ceiling_thickness
      ? `Ceilings ${[String(quote.ceiling_thickness ?? ''), ceilingFinish].filter(Boolean).join(' · ')}`
      : null,
    wallFinish || quote.wall_thickness
      ? `Walls ${[String(quote.wall_thickness ?? ''), wallFinish].filter(Boolean).join(' · ')}`
      : null,
    String(quote.build_type || 'new_build') === 'new_build' ? 'New build' : 'Renovation',
    String(quote.hang_exceptions ?? '').trim() ? 'Exceptions noted' : null,
    useCustom ? 'Custom scope text' : null,
  ].filter(Boolean) as string[]

  const handleAutoGenerate = () => {
    const generated = generateScopeOfWorkFromLineItems(quote.lineItems, catalogs)
    if (!generated) {
      onChange({ scope_of_work: '' })
      return
    }
    onChange({ scope_of_work: generated })
  }

  return (
    // Same card as Rates & markup — left accent, header weight, value chips — in violet, the
    // Quote stage's colour, so the two blocks read as siblings but stay distinguishable.
    <div id="quote-scope" className="scroll-mt-4 rounded-lg border border-l-4 border-l-violet-500 bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="font-semibold">Scope of work</span>
        {!open ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {scopeSummary.map((part) => (
              <span
                key={part}
                className="rounded-md border border-border bg-background px-1.5 py-0.5 text-sm font-semibold text-foreground"
              >
                {part}
              </span>
            ))}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {open ? 'Collapse' : 'Expand'}
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>
      {open ? (
    <div className="space-y-6 border-t p-4">
      {/* Row 1 — Hang | Ceiling | Wall | Duration (4-col at lg+) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Hang specifications */}
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 shrink-0 text-primary" />
              Hang specifications
            </CardTitle>
            <CardDescription className="text-xs">Drywall thickness for walls and ceilings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Ceiling thickness</Label>
              <Select
                disabled={readOnly}
                value={String(quote.ceiling_thickness || '')}
                onValueChange={(v) => onChange({ ceiling_thickness: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
                value={String(quote.wall_thickness || '')}
                onValueChange={(v) => onChange({ wall_thickness: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
              <div className="flex items-center justify-between gap-2">
                <Label>Hang exceptions</Label>
                <ScopeTemplatePopover
                  templates={HANG_EXCEPTION_TEMPLATES}
                  readOnly={readOnly}
                  currentText={String(quote.hang_exceptions ?? '')}
                  onChange={(next) => onChange({ hang_exceptions: next })}
                />
              </div>
              <Textarea
                rows={2}
                disabled={readOnly}
                value={String(quote.hang_exceptions ?? '')}
                placeholder="e.g., 5/8 inch at garage firewall…"
                onChange={(e) => onChange({ hang_exceptions: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ceiling finish */}
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              Ceiling finish
            </CardTitle>
            <CardDescription className="text-xs">Texture and finish level</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Primary ceiling finish</Label>
              <Select
                disabled={readOnly}
                value={ceilingFinish}
                onValueChange={(v) => onChange({ ceiling_finish: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
                  value={String(quote.ceiling_finish_other ?? '')}
                  placeholder="Enter custom ceiling finish"
                  onChange={(e) => onChange({ ceiling_finish_other: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Ceiling exceptions</Label>
                <ScopeTemplatePopover
                  templates={CEILING_EXCEPTION_TEMPLATES}
                  readOnly={readOnly}
                  currentText={String(quote.ceiling_exceptions ?? '')}
                  onChange={(next) => onChange({ ceiling_exceptions: next })}
                />
              </div>
              <Textarea
                rows={2}
                disabled={readOnly}
                value={String(quote.ceiling_exceptions ?? '')}
                placeholder="e.g., Master Bedroom is Level 5 Smooth…"
                onChange={(e) => onChange({ ceiling_exceptions: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Wall finish */}
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              Wall finish
            </CardTitle>
            <CardDescription className="text-xs">Texture and finish level</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Primary wall finish</Label>
              <Select
                disabled={readOnly}
                value={wallFinish}
                onValueChange={(v) => onChange({ wall_finish: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
                  value={String(quote.wall_finish_other ?? '')}
                  placeholder="Enter custom wall finish"
                  onChange={(e) => onChange({ wall_finish_other: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Wall exceptions</Label>
                <ScopeTemplatePopover
                  templates={WALL_EXCEPTION_TEMPLATES}
                  readOnly={readOnly}
                  currentText={String(quote.wall_exceptions ?? '')}
                  onChange={(next) => onChange({ wall_exceptions: next })}
                />
              </div>
              <Textarea
                rows={2}
                disabled={readOnly}
                value={String(quote.wall_exceptions ?? '')}
                placeholder="e.g., Garage walls are Roll Texture…"
                onChange={(e) => onChange({ wall_exceptions: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Duration inputs */}
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 shrink-0 text-primary" />
              Duration inputs
            </CardTitle>
            <CardDescription className="text-xs">
              Feeds duration summary. Finish level from ceiling/wall.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Build type</Label>
              <Select
                disabled={readOnly}
                value={String(quote.build_type || 'new_build')}
                onValueChange={(v) => onChange({ build_type: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_build">New build</SelectItem>
                  <SelectItem value="renovation">Renovation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Complexity</Label>
              <Select
                disabled={readOnly}
                value={String(quote.complexity || 'normal')}
                onValueChange={(v) => onChange({ complexity: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="complex">Complex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Bead sticks</Label>
              <Input
                type="number"
                min={0}
                disabled={readOnly}
                className="h-9"
                value={quote.bead_sticks ?? ''}
                onChange={(e) => onChange({ bead_sticks: e.target.value })}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={Boolean(quote.paper_floors_required)}
                onChange={(e) => onChange({ paper_floors_required: e.target.checked })}
                className="h-4 w-4 shrink-0 rounded border-input"
              />
              Paper floors required
            </label>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — Scope notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Scope notes</CardTitle>
          <CardDescription className="text-xs">
            Additional text on the quote, or a custom scope that replaces the structured sections.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={useCustom}
              onChange={(e) => onChange({ use_custom_scope_of_work: e.target.checked })}
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
                value={String(quote.custom_scope_of_work ?? '')}
                readOnly={readOnly}
                onChange={(next) => onChange({ custom_scope_of_work: next })}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Additional scope notes (optional)</Label>
                {!readOnly && (
                  <Button type="button" variant="outline" size="sm" onClick={handleAutoGenerate}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Auto-generate from line items
                  </Button>
                )}
              </div>
              <Textarea
                rows={2}
                disabled={readOnly}
                value={String(quote.scope_of_work ?? '')}
                placeholder="Additional notes that will appear on the quote"
                onChange={(e) => onChange({ scope_of_work: e.target.value })}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
      ) : null}
    </div>
  )
}
