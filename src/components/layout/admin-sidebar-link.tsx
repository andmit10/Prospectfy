'use client'

import Link from 'next/link'
import { Shield } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { cn } from '@/lib/utils'

/**
 * Sidebar link to the /admin console — rendered ONLY when the signed-in
 * user has super_admin membership anywhere. Uses `admin.activeSession`
 * as a cheap probe: the procedure is gated behind `superAdminProcedure`
 * so it throws FORBIDDEN for non-admins. We swallow the error and render
 * nothing in that case.
 */
export function AdminSidebarLink({ collapsed }: { collapsed: boolean }) {
  const { data, isError } = trpc.admin.activeSession.useQuery(undefined, {
    retry: false,
    throwOnError: false,
  })

  // `data` is `null` (no active session) for real super-admins, or the call
  // errors with FORBIDDEN for non-admins. We render when it didn't error AND
  // TRPC completed (data is null|object not undefined because throwOnError false
  // still flips isError on forbidden responses).
  if (isError) return null
  // data === undefined while loading — render lazily once we know
  if (data === undefined) return null

  return (
    <div className="space-y-0.5 mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      {!collapsed && (
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Plataforma
        </p>
      )}
      <Link
        href="/admin"
        title={collapsed ? 'Super Admin' : undefined}
        className={cn(
          'group relative flex items-center rounded-lg text-sm font-medium transition-all',
          collapsed ? 'h-9 w-9 mx-auto justify-center' : 'gap-3 px-3 py-2',
          'text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950'
        )}
      >
        <Shield className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1">Super Admin</span>}
      </Link>
    </div>
  )
}
