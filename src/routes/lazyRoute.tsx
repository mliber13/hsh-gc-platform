import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'

/**
 * Lazy-load a route that exports its component by name.
 *
 * Everything used to be imported statically into `routes/index.tsx`, so the main chunk was
 * 4.5 MB — every page, plus recharts, framer-motion, jspdf and xlsx, downloaded before the
 * login screen could paint. The crew open this on phones on site.
 *
 * `React.lazy` wants a default export; almost nothing here has one, hence the name argument.
 */
export function lazyRoute<T, K extends keyof T>(loader: () => Promise<T>, name: K): T[K] {
  // Returning T[K] keeps each component's own props, so call sites typecheck exactly as
  // they did when these were static imports. The cast is contained here: React.lazy cannot
  // express "same component, loaded later" in its own types.
  return lazy(async () => ({
    default: (await loader())[name] as ComponentType<Record<string, unknown>>,
  })) as unknown as T[K]
}

/**
 * One boundary around the routed page. Deliberately quiet — a spinner that appears for
 * 80ms on a fast connection reads as a flicker, so this is a held frame rather than a
 * visible loading state.
 */
export function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
