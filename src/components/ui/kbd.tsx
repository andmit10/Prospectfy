import { cn } from '@/lib/utils'

type KbdProps = {
  children: React.ReactNode
  className?: string
}

/** Keyboard shortcut display — e.g. <Kbd>⌘K</Kbd> */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded',
        'font-mono text-[10px] font-medium',
        'bg-[var(--surface-3)] text-[var(--text-secondary)]',
        'border border-[var(--border-strong)]',
        'shadow-[inset_0_-1px_0_var(--border)]',
        className
      )}
    >
      {children}
    </kbd>
  )
}
