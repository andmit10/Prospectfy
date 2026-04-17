'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  children: ReactNode
  /** Human-friendly label used in the fallback ("Não foi possível carregar o {label}."). */
  label?: string
  /** Optional full-render override. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

type State = { error: Error | null }

/**
 * App-level error boundary for panels (lead detail, campaign detail, agent).
 * Catches render errors from child components and renders an inline card with
 * a "Tentar novamente" button that remounts the subtree via a keyed reset.
 *
 * Network/query errors inside React Query mutations don't reach this — those
 * are still surfaced via `toast.error`.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Best-effort client-side log. Swapped for Sentry capture when wired.
    console.error('[ErrorBoundary]', error)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div
        className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 text-sm"
        style={{
          borderColor: 'color-mix(in oklab, #EF4444 40%, transparent)',
          backgroundColor: 'color-mix(in oklab, #EF4444 6%, transparent)',
          color: 'var(--text-primary)',
        }}
        role="alert"
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <strong>Não foi possível carregar {this.props.label ?? 'este painel'}.</strong>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] break-words">
          {error.message || 'Erro desconhecido.'}
        </p>
        <Button size="sm" variant="outline" onClick={this.reset}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      </div>
    )
  }
}
