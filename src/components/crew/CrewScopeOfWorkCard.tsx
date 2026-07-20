import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScopeMarkdownPreview } from '@/components/drywall/quote/v3/ScopeMarkdownPreview'
import { isMeasurerSpecialty } from '@/lib/drywall/crewSpecialty'
import type { CrewSpecialty, CrewStructuredScope } from '@/types/crew'

function ScopeRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  )
}

export function CrewScopeOfWorkCard({
  structuredScope,
  scopeOfWork,
  specialty,
  isOperatorExplainer = false,
}: {
  structuredScope: CrewStructuredScope | null
  scopeOfWork: string
  specialty: CrewSpecialty
  isOperatorExplainer?: boolean
}) {
  const scope = structuredScope

  if (!scope) {
    if (!scopeOfWork.trim()) return null
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Scope of work
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{scopeOfWork}</p>
        </CardContent>
      </Card>
    )
  }

  if (scope.useCustom && scope.customText) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Scope of work
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScopeMarkdownPreview markdown={scope.customText} />
        </CardContent>
      </Card>
    )
  }

  const showHangScope =
    isOperatorExplainer ||
    specialty === 'hanger' ||
    specialty === 'both' ||
    isMeasurerSpecialty(specialty)

  const hangThickness = showHangScope
    ? [
        scope.hangCeilingThickness ? `Ceiling ${scope.hangCeilingThickness}` : null,
        scope.hangWallThickness ? `Wall ${scope.hangWallThickness}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const hasAny =
    scope.drywallScopeLabel ||
    scope.addonLines.length > 0 ||
    (showHangScope && (hangThickness || scope.hangExceptions)) ||
    scope.ceilingFinish ||
    scope.ceilingExceptions ||
    scope.wallFinish ||
    scope.wallExceptions ||
    scope.additionalNotes

  if (!hasAny) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Scope of work
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ScopeRow label="Drywall scope" value={scope.drywallScopeLabel} />
        {showHangScope ? (
          <>
            <ScopeRow label="Drywall thickness" value={hangThickness || null} />
            <ScopeRow label="Hang exceptions" value={scope.hangExceptions} />
          </>
        ) : null}
        <ScopeRow label="Ceiling finish" value={scope.ceilingFinish} />
        <ScopeRow label="Ceiling exceptions" value={scope.ceilingExceptions} />
        <ScopeRow label="Wall finish" value={scope.wallFinish} />
        <ScopeRow label="Wall exceptions" value={scope.wallExceptions} />
        {scope.addonLines.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Also included</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {scope.addonLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <ScopeRow label="Additional notes" value={scope.additionalNotes} />
      </CardContent>
    </Card>
  )
}
