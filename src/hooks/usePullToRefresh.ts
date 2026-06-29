import { useCallback, useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD = 70  // px the user has to pull before refresh fires
const MAX_PULL = 120       // visual cap so the indicator doesn't slide off-screen

/**
 * Lightweight pull-to-refresh for mobile. Detects touch drag from a scrollTop of 0.
 * Calls `onRefresh` when the user releases past PULL_THRESHOLD. Returns the pull
 * distance (0 when not pulling) so the caller can render a visual indicator.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown> | void): {
  pullDistance: number
  refreshing: boolean
} {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)
  const refreshingRef = useRef(false)

  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only engage when the scrollable container is at the top.
    if (window.scrollY > 0) return
    if (refreshingRef.current) return
    if (e.touches.length !== 1) return
    startYRef.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startYRef.current == null) return
    const delta = e.touches[0].clientY - startYRef.current
    if (delta <= 0) {
      setPullDistance(0)
      return
    }
    // Resistance: shows half the drag distance so it feels rubber-bandy.
    const visual = Math.min(MAX_PULL, delta * 0.5)
    setPullDistance(visual)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (startYRef.current == null) return
    startYRef.current = null
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD)
      void Promise.resolve(onRefresh()).finally(() => {
        setRefreshing(false)
        setPullDistance(0)
      })
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, onRefresh])

  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return { pullDistance, refreshing }
}
