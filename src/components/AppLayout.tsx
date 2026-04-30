// ============================================================================
// AppLayout — the shell wrapper for every authenticated page
// ============================================================================
//
// Combines:
//   - <SidebarProvider> with sidebar expanded by default
//   - <AppSidebar> on the left (workspace-aware nav)
//   - <SidebarInset> for the page content area
//     - <AppHeader> at the top (sidebar trigger + project selector + workspace switcher)
//     - <Outlet /> for the routed page below
//
// Per docs/DESIGN_LANGUAGE.md §5: sidebar uses the "inset" variant — main
// content area gets a rounded inset margin, sidebar stays adjacent.
//

import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { PageTitleProvider } from '@/contexts/PageTitleContext'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'

export function AppLayout() {
  return (
    <PageTitleProvider>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleProvider>
  )
}
