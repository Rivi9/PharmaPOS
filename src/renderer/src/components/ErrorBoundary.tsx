import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  children: ReactNode
  /** Shown above the error so the cashier knows what still works. */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * Stops a render-time exception from unmounting the whole application.
 *
 * Without this, a single bad field — e.g. reading a column that does not exist
 * while formatting a receipt — blanked the entire POS and required a restart
 * mid-transaction. A till must degrade to a readable error, never to a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full w-full items-center justify-center bg-canvas p-6">
        <div
          role="alert"
          className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-xs"
        >
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlert className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-base text-muted-foreground">
                {this.props.label ?? 'This section could not be displayed.'} The rest of the
                application is unaffected and any completed sale has already been saved.
              </p>
            </div>
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap text-muted-foreground">
            {error.message}
          </pre>
          <Button size="lg" className="w-full" onClick={this.handleReset}>
            <RotateCcw />
            Try again
          </Button>
        </div>
      </div>
    )
  }
}
