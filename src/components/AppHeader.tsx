// ============================================================================
// AppHeader — thin horizontal strip across the top of SidebarInset
// ============================================================================
//
// Per docs/DESIGN_LANGUAGE.md §5.2 and the v0 reference:
//   Left:    <SidebarTrigger> + Project/Deal/Tenant Selector
//   Center:  Page title (set declaratively via usePageTitle, with a
//            pathname-derived fallback for unported pages)
//   Right:   Workspace Switcher (dropdown-pill)
//
// Header is sticky-positioned at the top of SidebarInset; sidebar collapses
// underneath without reflowing the header.
//

import { useLocation } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { usePageTitleValue } from '@/contexts/PageTitleContext'
import { ProjectSelector } from './ProjectSelector'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

/** Pathname → human title fallback for pages that haven't called usePageTitle yet. */
function fallbackTitleFromPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Dashboard'
  if (pathname.startsWith('/projects/new')) return 'New Project'
  if (pathname.startsWith('/projects/')) return 'Project'
  if (pathname.startsWith('/library/plans')) return 'Plan Library'
  if (pathname.startsWith('/library/estimates')) return 'Item Library'
  if (pathname.startsWith('/library')) return 'Library'
  if (pathname.startsWith('/quickbooks')) return 'QuickBooks'
  if (pathname.startsWith('/contacts')) return 'Contacts'
  if (pathname.startsWith('/sow')) return 'SOW Templates'
  if (pathname.startsWith('/feedback')) return 'Feedback'
  if (pathname.startsWith('/deals')) return 'Deals'
  if (pathname.startsWith('/tenants')) return 'Tenants'
  return ''
}

export function AppHeader() {
  const location = useLocation()
  const contextTitle = usePageTitleValue()
  const title = contextTitle || fallbackTitleFromPath(location.pathname)

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      {/* Left: sidebar trigger + project selector */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <ProjectSelector />
      </div>

      {/* Center: page title (absolute-positioned so it stays centered
          regardless of left/right content widths) */}
      {title && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
        </div>
      )}

      {/* Right: workspace switcher */}
      <div className="ml-auto flex items-center gap-2">
        <WorkspaceSwitcher />
      </div>
    </header>
  )
}
