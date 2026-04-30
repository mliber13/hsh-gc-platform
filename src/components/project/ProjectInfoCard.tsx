// ============================================================================
// ProjectInfoCard — 8-cell project info grid (Name / Plan / Type / Location /
// Start / End / Status / Created)
// ============================================================================
//
// Used at the top of project-scoped pages (Estimate Book, Project Actuals)
// to show consistent project context. Matches the v0 design language §1
// (uppercase muted labels with values below) and uses the status-pill recipe
// per docs/UI_PORT_PLAYBOOK.md §7.
//

import { Card, CardContent } from '@/components/ui/card'
import { Project } from '@/types'

interface ProjectInfoCardProps {
  project: Project
}

export function ProjectInfoCard({ project }: ProjectInfoCardProps) {
  const planLabel =
    project.metadata?.isCustomPlan || !project.metadata?.planId
      ? 'Custom Plan'
      : project.metadata.planId
  const location = [
    project.address?.street,
    [project.city, project.state].filter(Boolean).join(', '),
    project.zipCode,
  ]
    .filter(Boolean)
    .join(' ')
  const status = project.status.replace('-', ' ')

  return (
    <Card className="border-border/60 bg-card/50">
      <CardContent className="p-6">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <InfoCell label="Project Name" value={project.name} />
          <InfoCell
            label="Plan ID"
            value={planLabel}
            badges={project.metadata?.planOptions}
          />
          <InfoCell
            label="Type"
            value={project.type.replace(/-/g, ' ')}
            capitalize
          />
          <InfoCell label="Location" value={location || 'Not set'} />
          <InfoCell
            label="Start Date"
            value={
              project.startDate
                ? project.startDate.toLocaleDateString()
                : 'Not set'
            }
          />
          <InfoCell
            label="End Date"
            value={
              project.endDate
                ? project.endDate.toLocaleDateString()
                : 'Not set'
            }
          />
          <InfoCell label="Status" value={status} capitalize statusPill />
          <InfoCell
            label="Created"
            value={project.createdAt.toLocaleDateString()}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function InfoCell({
  label,
  value,
  capitalize,
  statusPill,
  badges,
}: {
  label: string
  value: string
  capitalize?: boolean
  statusPill?: boolean
  badges?: string[]
}) {
  const statusVisual = (s: string) => {
    switch (s.toLowerCase().trim()) {
      case 'estimating':
        return 'bg-violet-500/15 text-violet-500 border-violet-500/30'
      case 'bidding':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30'
      case 'awarded':
      case 'complete':
        return 'bg-sky-500/15 text-sky-500 border-sky-500/30'
      case 'in progress':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {statusPill ? (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${statusVisual(value)}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          <span className={capitalize ? 'capitalize' : ''}>{value}</span>
        </span>
      ) : (
        <p className={`text-sm font-medium ${capitalize ? 'capitalize' : ''}`}>
          {value}
        </p>
      )}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {badges.map((b) => (
            <span
              key={b}
              className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
