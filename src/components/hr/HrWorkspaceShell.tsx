import { Outlet } from 'react-router-dom'

/** Thin HR workspace wrapper — nav lives in AppSidebar; child routes render via Outlet. */
export function HrWorkspaceShell() {
  return <Outlet />
}
