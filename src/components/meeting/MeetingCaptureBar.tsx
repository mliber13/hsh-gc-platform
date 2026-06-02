import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

interface MeetingCaptureBarProps {
  activeParkCount: number
  actionItemCount: number
  onParkItClick: () => void
  onAddActionItemClick: () => void
}

export function MeetingCaptureBar({
  activeParkCount,
  actionItemCount,
  onParkItClick,
  onAddActionItemClick,
}: MeetingCaptureBarProps) {
  const { state, isMobile } = useSidebar()

  return (
    <div
      className={cn(
        'fixed bottom-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-sm px-6 py-2 transition-[left] duration-200 ease-linear',
        isMobile
          ? 'left-0'
          : state === 'collapsed'
            ? 'left-[calc(var(--sidebar-width-icon)+1rem)]'
            : 'left-[var(--sidebar-width)]',
      )}
    >
      <div className="mx-auto flex max-w-4xl items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={onParkItClick}>
          📌 Park it
        </Button>
        <Button type="button" size="sm" onClick={onAddActionItemClick}>
          ✓ Add action item
        </Button>
        <div className="ml-auto flex items-center gap-5 text-sm text-muted-foreground">
          <span>📌 {activeParkCount} parked</span>
          <span>✓ {actionItemCount} action items</span>
        </div>
      </div>
    </div>
  )
}
