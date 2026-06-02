import type { MeetingLeadSection } from '@/types/meeting'

function displayAnswer(value: string | null): string {
  if (!value || value.trim().length === 0) return '—'
  return value
}

interface LeadSlideProps {
  section: MeetingLeadSection
  canManageMeetingPrompts: boolean
  onToggleLiveDiscuss: (leadId: string, promptId: string, currentValue: boolean) => void
}

export function LeadSlide({ section, canManageMeetingPrompts, onToggleLiveDiscuss }: LeadSlideProps) {
  const hasNoPrompts = section.prompts.length === 0
  const showNotSubmitted = !section.has_submission

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
      {hasNoPrompts ? (
        <p className="text-lg text-muted-foreground">(no prompts configured)</p>
      ) : showNotSubmitted ? (
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground">
            — not submitted; topics for verbal review —
          </p>
          <div className="space-y-3">
            {section.prompts.map((prompt, index) => (
              <p key={prompt.prompt_id} className="text-lg text-muted-foreground">
                {index + 1}. {prompt.question_text}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {section.prompts.map((prompt) => (
            <article key={prompt.prompt_id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">{prompt.question_text}</h3>
                {canManageMeetingPrompts ? (
                  <button
                    type="button"
                    onClick={() =>
                      onToggleLiveDiscuss(section.lead_id, prompt.prompt_id, prompt.is_live_discuss)
                    }
                    className={
                      prompt.is_live_discuss
                        ? 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300'
                        : 'rounded-md border border-dashed border-muted-foreground/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-amber-500/60 hover:text-amber-700 dark:hover:text-amber-300'
                    }
                    title={
                      prompt.is_live_discuss
                        ? 'Click to unmark live discussion'
                        : 'Click to mark for live discussion'
                    }
                  >
                    {prompt.is_live_discuss ? 'Discuss live' : 'Mark live'}
                  </button>
                ) : (
                  prompt.is_live_discuss && (
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                      Discuss live
                    </span>
                  )
                )}
              </div>
              <p
                className={
                  prompt.is_live_discuss
                    ? 'text-lg leading-relaxed text-amber-600 dark:text-amber-400'
                    : 'text-lg leading-relaxed text-muted-foreground'
                }
              >
                {displayAnswer(prompt.answer_text)}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
