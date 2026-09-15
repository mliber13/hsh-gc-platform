import { useOutletContext } from 'react-router-dom'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { ScheduleEditor } from '@/components/schedule/ScheduleEditor'

/** Drywall project shell wrapper — same pattern as D.6.8 field-takeoff inputs. */
export function DrywallScheduleEditor() {
  const { projectId, projectName, projectAddress } = useOutletContext<DrywallProjectShellContext>()
  return (
    <ScheduleEditor
      projectId={projectId}
      projectName={projectName}
      projectAddress={projectAddress}
      division="drywall"
    />
  )
}
