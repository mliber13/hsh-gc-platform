import type { Dispatch, SetStateAction } from 'react'
import type { FieldTakeoff } from '@/types/drywall'

/** Lifted field takeoff state from FieldMeasurementPage (supports functional updates). */
export type SetFieldTakeoff = Dispatch<SetStateAction<FieldTakeoff>>
