// ============================================================================
// ErrorBoundary — a render throw should not be a white screen (P0-INFRA-1)
// ============================================================================
//
// There was no boundary anywhere, so one throw during render took out the whole
// app. Worst on /crew, where the user is on a phone on a jobsite and the only
// recovery was knowing to force-quit the PWA.
//
// A class component because hooks cannot catch render errors. The visible text
// carries no stack and no Supabase internals — same convention as the sanitised
// crew errors (D.6.6a). The detail is available behind "Copy error details" for
// someone who is going to paste it to the office.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown instead of the default sentence, e.g. to name the screen that failed. */
  message?: string
}

interface ErrorBoundaryState {
  error: Error | null
  copied: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, copied: false }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled render error:', error, errorInfo.componentStack)
  }

  private handleCopy = () => {
    const { error } = this.state
    const details = [
      error?.message ?? 'Unknown error',
      error?.stack ?? '(no stack)',
      window.location.href,
    ].join('\n\n')

    void navigator.clipboard
      ?.writeText(details)
      .then(() => {
        this.setState({ copied: true })
      })
      .catch(() => {
        // Clipboard can be unavailable (insecure context, denied permission).
        // Nothing useful to say about it here; the Reload button still works.
      })
  }

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="size-8 text-amber-500" aria-hidden />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Something went wrong on this screen</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {this.props.message ??
              'Reloading usually fixes it. Nothing you entered has been lost unless it was still unsaved.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button variant="outline" onClick={this.handleCopy}>
            {copied ? 'Copied' : 'Copy error details'}
          </Button>
        </div>
      </div>
    )
  }
}
