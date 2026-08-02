import { Component, type ErrorInfo, type ReactNode } from 'react'
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
      <div className="h-full w-full flex items-center justify-center p-6">
        <div className="max-w-md w-full border rounded-xl p-6 space-y-4 bg-card">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-destructive">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              {this.props.label ?? 'This section could not be displayed.'} The rest of the
              application is unaffected and any completed sale has already been saved.
            </p>
          </div>
          <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {error.message}
          </pre>
          <Button className="w-full h-12" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
}
