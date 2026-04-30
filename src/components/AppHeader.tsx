// ============================================================================
// AppHeader — thin horizontal strip across the top of SidebarInset
// ============================================================================
//
// Per docs/DESIGN_LANGUAGE.md §5.2:
//   Left:  <SidebarTrigger> + Project/Deal/Tenant Selector
//   Right: Workspace Switcher (dropdown-pill)
//
// Header is fixed-position relative to SidebarInset; sidebar collapses
// underneath without reflowing the header.
//

import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ProjectSelector } from './ProjectSelector'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-4" />
      <ProjectSelector />
      <div className="ml-auto flex items-center gap-2">
        <WorkspaceSwitcher />
      </div>
    </header>
  )
}
