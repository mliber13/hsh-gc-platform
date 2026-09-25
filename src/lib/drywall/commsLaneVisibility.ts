import type { ProjectCommsMessage } from '@/services/projectCommsService'

/**
 * Whether one crew member can see a message, mirroring the RLS policy
 * "Read project comms by lane" (`20260904120000_project_comms_lanes.sql:91`).
 *
 * **This is a simulation, and only ever used for the operator's "view as" preview.**
 * The database is the enforcement; nothing here grants access to anything. The preview
 * previously rendered whatever the *operator's* session could read, which for office is
 * every lane — so it showed private crew conversations as though the crew member could see
 * them. Wrong in the dangerous direction: it would reassure someone checking what a sub
 * cannot see.
 *
 * If the policy changes, change this with it. The three rules below are the whole policy
 * for a crew reader — office readers are not modelled here because the preview is never of
 * an office user.
 */
export function crewCanSeeMessage(
  message: Pick<ProjectCommsMessage, 'audience' | 'audiencePersonId'>,
  viewer: { personId: string; isAssignedToProject: boolean },
): boolean {
  // Office-only notes never reach crew.
  if (message.audience === 'office') return false

  // Job-wide broadcasts reach everyone assigned to the project.
  if (message.audience === 'job') return viewer.isAssignedToProject

  // A private lane reaches exactly the one person it is addressed to.
  if (message.audience === 'crew') {
    return Boolean(viewer.personId) && message.audiencePersonId === viewer.personId
  }

  // Unknown lane: withhold. A new audience value should not become visible by default.
  return false
}

export interface CrewVisibleMessages<T> {
  visible: T[]
  /** How many were withheld, so the preview can say so rather than quietly showing fewer. */
  hiddenCount: number
}

export function filterMessagesForCrewViewer<
  T extends Pick<ProjectCommsMessage, 'audience' | 'audiencePersonId'>,
>(messages: T[], viewer: { personId: string; isAssignedToProject: boolean }): CrewVisibleMessages<T> {
  const visible = messages.filter((message) => crewCanSeeMessage(message, viewer))
  return { visible, hiddenCount: messages.length - visible.length }
}
