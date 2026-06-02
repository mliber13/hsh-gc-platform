import type { MeetingParkingLotItem } from '@/types/meeting'
import { Button } from '@/components/ui/button'
import { ParkingRow, type ParkingRowHandlers } from '@/components/meeting/ParkingRow'

interface ParkingLotReviewSlideProps {
  parkingItems: MeetingParkingLotItem[]
  deferredItems: MeetingParkingLotItem[]
  thisMeetingParkingItems: MeetingParkingLotItem[]
  ownerNameByLeadId: Map<string, string>
  isOperator: boolean
  onParkItClick: () => void
  handlers: ParkingRowHandlers
}

export function ParkingLotReviewSlide({
  deferredItems,
  thisMeetingParkingItems,
  ownerNameByLeadId,
  isOperator,
  onParkItClick,
  handlers,
}: ParkingLotReviewSlideProps) {
  const totalCount = deferredItems.length + thisMeetingParkingItems.length

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold">Parking Lot</h2>
          {totalCount > 0 && (
            <p className="text-base text-muted-foreground">{totalCount} items</p>
          )}
        </div>
        {isOperator && (
          <Button type="button" onClick={onParkItClick}>
            Park it
          </Button>
        )}
      </div>

      {deferredItems.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Deferred from prior meetings ({deferredItems.length})
          </p>
          <div className="space-y-2">
            {deferredItems.map((item) => (
              <ParkingRow
                key={item.id}
                item={item}
                ownerNameByLeadId={ownerNameByLeadId}
                isOperator={isOperator}
                handlers={handlers}
              />
            ))}
          </div>
        </div>
      )}

      {thisMeetingParkingItems.length === 0 && deferredItems.length === 0 ? (
        <p className="text-lg text-muted-foreground">No parked topics yet.</p>
      ) : thisMeetingParkingItems.length > 0 ? (
        <div className="space-y-3">
          {deferredItems.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Parked this meeting ({thisMeetingParkingItems.length})
            </p>
          )}
          <div className="space-y-2">
            {thisMeetingParkingItems.map((item) => (
              <ParkingRow
                key={item.id}
                item={item}
                ownerNameByLeadId={ownerNameByLeadId}
                isOperator={isOperator}
                handlers={handlers}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
