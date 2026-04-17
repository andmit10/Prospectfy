'use client'

import { useTheme, type Theme } from './theme-provider'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

type ThemeOption = {
  value: Theme
  label: string
  description: string
  preview: React.ReactNode
}

/** Mini mockup card shown as preview — reuses a consistent skeleton look */
function Preview({ mode }: { mode: 'light' | 'dark' | 'split' }) {
  const bg = mode === 'light' ? '#FFFFFF' : mode === 'dark' ? '#141414' : 'linear-gradient(to right, #FFFFFF 50%, #141414 50%)'
  const sideBg = mode === 'light' ? '#F4F4F5' : mode === 'dark' ? '#0D0D0D' : '#0D0D0D'
  const bar = mode === 'light' ? '#E4E4E7' : '#1E1E1E'
  const accent = mode === 'light' ? '#E4E4E7' : '#2A2A2A'

  return (
    <div
      className="relative h-16 w-full overflow-hidden rounded-md"
      style={{ background: bg }}
    >
      {/* Sidebar mock */}
      <div
        className="absolute left-0 top-0 h-full w-6"
        style={{ background: sideBg, borderRight: `1px solid ${bar}` }}
      >
        <div className="mt-1.5 ml-1 h-0.5 w-3 rounded-full" style={{ background: bar }} />
        <div className="mt-1 ml-1 h-0.5 w-2.5 rounded-full" style={{ background: bar }} />
        <div className="mt-1 ml-1 h-0.5 w-3 rounded-full" style={{ background: bar }} />
      </div>
      {/* Content mock */}
      <div className="absolute left-7 right-1.5 top-1.5">
        <div className="h-1 w-8 rounded-full" style={{ background: bar }} />
        <div className="mt-2 flex gap-1">
          <div className="h-4 w-8 rounded" style={{ background: accent }} />
          <div className="h-4 w-8 rounded" style={{ background: accent }} />
        </div>
        <div className="mt-1.5 h-1 w-10 rounded-full" style={{ background: bar }} />
      </div>
      {/* Primary dot indicator */}
      <div
        className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
        style={{ background: mode === 'light' ? '#00A855' : '#00D26A' }}
      />
    </div>
  )
}

const OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Claro',
    description: 'Fundo claro, ótimo para ambientes iluminados',
    preview: <Preview mode="light" />,
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Segue o tema do seu sistema operacional',
    preview: <Preview mode="split" />,
  },
  {
    value: 'dark',
    label: 'Escuro',
    description: 'Fundo escuro, reduz fadiga visual',
    preview: <Preview mode="dark" />,
  },
]

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Aparência</h3>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
          Escolha como o convertafy aparece no seu navegador
        </p>
      </div>

      <p className="text-xs font-medium text-[var(--text-secondary)]">Modo de cor</p>

      <div className="grid grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const isActive = theme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                'group relative overflow-hidden rounded-xl border-2 p-2 text-left transition-all',
                isActive
                  ? 'border-[var(--primary)] bg-[var(--success-muted)]'
                  : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]'
              )}
            >
              {opt.preview}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    isActive ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'
                  )}
                >
                  {opt.label}
                </span>
                {isActive && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)]">
                    <Check className="h-2.5 w-2.5 text-[var(--primary-foreground)]" />
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[10px] leading-tight text-[var(--text-tertiary)]">
                {opt.description}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
