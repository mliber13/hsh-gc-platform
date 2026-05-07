// Tiny event bus for "feedback list changed" notifications. Replaces the
// previous (window as any).refreshMyFeedback hack — same shape (subscribe
// + emit), but typed and module-scoped instead of leaking onto window.

type Listener = () => void
const listeners = new Set<Listener>()

export function onFeedbackChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitFeedbackChange(): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.error('feedbackEventBus listener threw:', error)
    }
  })
}
