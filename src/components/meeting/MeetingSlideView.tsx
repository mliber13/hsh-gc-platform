import { ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  ActionItemStatus,
  MeetingActionItem,
  MeetingLeadSection,
  MeetingParkingLotItem,
  MeetingViewData,
} from '@/types/meeting'
import { Button } from '@/components/ui/button'
import { LeadSlide } from '@/components/meeting/slides/LeadSlide'
import { ParkingLotReviewSlide } from '@/components/meeting/slides/ParkingLotReviewSlide'
import { ActionItemsSummarySlide } from '@/components/meeting/slides/ActionItemsSummarySlide'
import type { ParkingRowHandlers } from '@/components/meeting/ParkingRow'

export interface MeetingSlideViewProps {
  currentSlide: number
  onSlideChange: (index: number) => void
  onToggleViewMode: () => void
  data: MeetingViewData
  actionItems: MeetingActionItem[]
  parkingItems: MeetingParkingLotItem[]
  deferredItems: MeetingParkingLotItem[]
  thisMeetingParkingItems: MeetingParkingLotItem[]
  ownerNameByLeadId: Map<string, string>
  isOperator: boolean
  canManageMeetingPrompts: boolean
  formattedMeetingDate: string
  onToggleLiveDiscuss: (leadId: string, promptId: string, currentValue: boolean) => void
  onParkItClick: () => void
  parkingRowHandlers: ParkingRowHandlers
  onStatusChange: (id: string, status: ActionItemStatus) => void
  onDeleteRequest: (id: string) => void
}

function filteredSections(sections: MeetingLeadSection[]): MeetingLeadSection[] {
  return sections.filter((s) => s.prompts.length > 0 || s.has_submission)
}

export function MeetingSlideView({
  currentSlide,
  onSlideChange,
  onToggleViewMode,
  data,
  actionItems,
  deferredItems,
  thisMeetingParkingItems,
  parkingItems,
  ownerNameByLeadId,
  isOperator,
  canManageMeetingPrompts,
  formattedMeetingDate,
  onToggleLiveDiscuss,
  onParkItClick,
  parkingRowHandlers,
}: MeetingSlideViewProps) {
  const leadSections = filteredSections(data.sections)
  const totalSlides = leadSections.length + 2
  const parkingLotSlideIndex = leadSections.length
  const actionItemsSlideIndex = leadSections.length + 1

  const clampedSlide = Math.min(Math.max(currentSlide, 0), totalSlides - 1)

  const slideLabelParts = (() => {
    if (clampedSlide < leadSections.length) {
      const s = leadSections[clampedSlide]
      return { primary: s.display_name, secondary: s.area_label }
    }
    if (clampedSlide === parkingLotSlideIndex) return { primary: 'Parking Lot Review', secondary: null }
    return { primary: 'Action Items', secondary: null }
  })()

  return (
    <div className="flex flex-col">
      {/* Sticky nav chrome — title centered on bar; arrows + toggle on edges */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="relative mx-auto flex h-20 max-w-5xl items-center px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative z-10 h-9 w-9 shrink-0"
            disabled={clampedSlide === 0}
            onClick={() => onSlideChange(clampedSlide - 1)}
            aria-label="Previous slide"
          >
            <ChevronLeft className="size-5" />
          </Button>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-28 text-center">
            <p className="text-2xl font-semibold leading-tight text-foreground">
              {slideLabelParts.primary}
            </p>
            {slideLabelParts.secondary && (
              <p className="text-xl leading-tight text-muted-foreground">
                {slideLabelParts.secondary}
              </p>
            )}
            <p className="mt-0.5 text-sm text-muted-foreground">
              {clampedSlide + 1} / {totalSlides}
            </p>
          </div>

          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={clampedSlide === totalSlides - 1}
              onClick={() => onSlideChange(clampedSlide + 1)}
              aria-label="Next slide"
            >
              <ChevronRight className="size-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={onToggleViewMode}
            >
              List view
            </Button>
          </div>
        </div>
      </div>

      {/* Meeting date subheading */}
      <div className="px-6 pt-4 pb-0">
        <p className="mx-auto max-w-4xl text-sm text-muted-foreground">{formattedMeetingDate}</p>
      </div>

      {/* Slide content */}
      <div className="min-h-[60vh]">
        {clampedSlide < leadSections.length ? (
          <LeadSlide
            section={leadSections[clampedSlide]}
            canManageMeetingPrompts={canManageMeetingPrompts}
            onToggleLiveDiscuss={onToggleLiveDiscuss}
          />
        ) : clampedSlide === parkingLotSlideIndex ? (
          <ParkingLotReviewSlide
            parkingItems={parkingItems}
            deferredItems={deferredItems}
            thisMeetingParkingItems={thisMeetingParkingItems}
            ownerNameByLeadId={ownerNameByLeadId}
            isOperator={isOperator}
            onParkItClick={onParkItClick}
            handlers={parkingRowHandlers}
          />
        ) : (
          <ActionItemsSummarySlide
            actionItems={actionItems}
            ownerNameByLeadId={ownerNameByLeadId}
          />
        )}
      </div>
    </div>
  )
}
