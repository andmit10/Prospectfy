'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type AutocompleteInputProps = {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  icon?: React.ReactNode
  className?: string
  maxSuggestions?: number
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  icon,
  className,
  maxSuggestions = 8,
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Filter suggestions based on input value (fuzzy-ish, case insensitive)
  const filtered = value.trim()
    ? suggestions
        .filter((s) => s.toLowerCase().includes(value.toLowerCase()))
        .sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(value.toLowerCase())
          const bStarts = b.toLowerCase().startsWith(value.toLowerCase())
          if (aStarts && !bStarts) return -1
          if (!aStarts && bStarts) return 1
          return a.localeCompare(b)
        })
        .slice(0, maxSuggestions)
    : suggestions.slice(0, maxSuggestions)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) {
        onChange(filtered[highlighted])
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Tab' && filtered[highlighted]) {
      // Tab completion
      e.preventDefault()
      onChange(filtered[highlighted])
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
            {icon}
          </span>
        )}
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setHighlighted(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            'bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-primary)]',
            'placeholder:text-[var(--text-tertiary)]',
            'focus-visible:border-[var(--primary)] focus-visible:ring-[var(--primary)]/20',
            icon && 'pl-9'
          )}
        />
      </div>

      {open && filtered.length > 0 && (
        <div
          className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--popover)] shadow-[var(--shadow-popover)] animate-fade-in"
          role="listbox"
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map((suggestion, i) => {
              const isHighlighted = i === highlighted
              const isSelected = suggestion === value
              const lowerVal = value.toLowerCase()
              const matchIdx = suggestion.toLowerCase().indexOf(lowerVal)

              return (
                <button
                  key={suggestion}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => {
                    onChange(suggestion)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                    isHighlighted
                      ? 'bg-[var(--surface-3)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  )}
                >
                  <Search className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
                  {/* Highlight matched portion */}
                  {value && matchIdx >= 0 ? (
                    <span>
                      {suggestion.slice(0, matchIdx)}
                      <span className="font-semibold text-[var(--primary)]">
                        {suggestion.slice(matchIdx, matchIdx + value.length)}
                      </span>
                      {suggestion.slice(matchIdx + value.length)}
                    </span>
                  ) : (
                    <span>{suggestion}</span>
                  )}
                  {isSelected && <Check className="ml-auto h-3 w-3 text-[var(--primary)]" />}
                </button>
              )
            })}
          </div>
          <div className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-tertiary)] bg-[var(--surface-1)]">
            <span className="font-mono">↑↓</span> navegar ·{' '}
            <span className="font-mono">Enter</span> selecionar ·{' '}
            <span className="font-mono">Esc</span> fechar
          </div>
        </div>
      )}
    </div>
  )
}
