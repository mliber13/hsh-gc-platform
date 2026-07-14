import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { FieldTakeoff } from '@/types/drywall'

export interface FieldProjectSiteSectionProps {
  projectAddress?: string
  onProjectAddressChange?: (value: string) => void
  takeoff: FieldTakeoff
  onPatchTakeoff: (patch: Partial<FieldTakeoff>) => void
  readOnly: boolean
  /** Operator field stage shows address + variance; crew measure omits those. */
  variant?: 'operator' | 'crew'
}

/** Job address + site contact / visit notes (operator + crew measure). */
export function FieldProjectSiteSection({
  projectAddress = '',
  onProjectAddressChange,
  takeoff,
  onPatchTakeoff,
  readOnly,
  variant = 'operator',
}: FieldProjectSiteSectionProps) {
  const isCrew = variant === 'crew'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {isCrew ? 'Site & visit notes' : 'Project & site'}
        </CardTitle>
        <CardDescription>
          {isCrew
            ? 'Site contact and access details for this visit.'
            : 'Job address and field visit contacts.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isCrew ? (
          <div className="space-y-2">
            <Label>Job address *</Label>
            <Input
              value={projectAddress}
              disabled={readOnly}
              placeholder="Job site address"
              onChange={(e) => onProjectAddressChange?.(e.target.value)}
            />
          </div>
        ) : null}
        <div className={isCrew ? 'space-y-4' : 'grid md:grid-cols-2 gap-4'}>
          <div className="space-y-2">
            <Label>Site contact</Label>
            <Input
              value={takeoff.siteContact ?? ''}
              disabled={readOnly}
              onChange={(e) => onPatchTakeoff({ siteContact: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Contact phone</Label>
            <Input
              type="tel"
              value={takeoff.contactPhone ?? ''}
              disabled={readOnly}
              onChange={(e) => onPatchTakeoff({ contactPhone: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Meeting location</Label>
          <Input
            value={takeoff.meetingLocation ?? ''}
            disabled={readOnly}
            onChange={(e) => onPatchTakeoff({ meetingLocation: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Access notes</Label>
          <Textarea
            rows={3}
            value={takeoff.accessNotes ?? ''}
            disabled={readOnly}
            onChange={(e) => onPatchTakeoff({ accessNotes: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Hazards</Label>
          <Textarea
            rows={3}
            value={takeoff.hazards ?? ''}
            disabled={readOnly}
            placeholder="Safety hazards, PPE needs…"
            onChange={(e) => onPatchTakeoff({ hazards: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Field notes</Label>
          <Textarea
            rows={3}
            value={takeoff.notes ?? ''}
            disabled={readOnly}
            onChange={(e) => onPatchTakeoff({ notes: e.target.value })}
          />
        </div>
        {!isCrew ? (
          <div className="space-y-2">
            <Label>Variance notes</Label>
            <Textarea
              rows={2}
              value={takeoff.varianceNotes ?? ''}
              disabled={readOnly}
              placeholder="Explain differences from the quoteâ€¦"
              onChange={(e) => onPatchTakeoff({ varianceNotes: e.target.value })}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
