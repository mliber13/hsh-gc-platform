// ============================================================================
// PageTitleContext — declarative page title for the AppHeader's center slot
// ============================================================================
//
// AppHeader renders a centered <h1> across every page in the shell. Each
// page sets its own title by calling `usePageTitle('My Title')` in the
// component body. The hook syncs with the provider via useEffect, so
// changing routes naturally updates the header.
//
// AppHeader has a pathname-derived fallback (see AppHeader.tsx) so any
// page that hasn't been ported yet still shows a reasonable title.
//
// Pattern (per docs/DESIGN_LANGUAGE.md, applied site-wide):
//   - Sidebar = workspace navigation
//   - AppHeader left = project/deal/tenant selector
//   - AppHeader center = current page name
//   - AppHeader right = workspace switcher
//

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'

type PageTitleContextValue = {
  /** The title currently being rendered in the header center. Empty string
   *  means "let AppHeader fall back to its pathname-derived default". */
  title: string
  setTitle: (title: string) => void
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null)

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('')

  const value = useMemo<PageTitleContextValue>(
    () => ({ title, setTitle }),
    [title],
  )

  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  )
}

/** Read-only access to the current page title (for AppHeader). */
export function usePageTitleValue(): string {
  const ctx = useContext(PageTitleContext)
  return ctx?.title ?? ''
}

/**
 * Set the page title for the current route. Call from anywhere inside the
 * AppLayout shell:
 *
 *   function ProjectDetailRoute() {
 *     const { project } = useProjectContext()
 *     usePageTitle(project.name)
 *     return <ProjectDetailView project={project} ... />
 *   }
 */
export function usePageTitle(title: string): void {
  const ctx = useContext(PageTitleContext)
  const setTitle = ctx?.setTitle

  // Stable setter reference for the effect dep array
  const stableSetTitle = useCallback(
    (value: string) => {
      setTitle?.(value)
    },
    [setTitle],
  )

  useEffect(() => {
    stableSetTitle(title)
    return () => {
      // Clear on unmount so the next page doesn't briefly show the previous title
      stableSetTitle('')
    }
  }, [title, stableSetTitle])
}
