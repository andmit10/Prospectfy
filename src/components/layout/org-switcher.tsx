'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { trpc } from '@/lib/trpc-client'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Building2, Check, ChevronsUpDown, LogOut, Plus, Settings2, User2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Switcher between the orgs the signed-in user belongs to. Sits at the top of
 * the sidebar. In collapsed mode it renders only the building icon; expanded,
 * it shows the active org name + role chip.
 */
export function OrgSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const supabase = createClient()
  const { data: orgs, isLoading } = trpc.organizations.list.useQuery()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserEmail(data.user.email ?? null)
        setUserName((data.user.user_metadata?.full_name as string) ?? null)
      }
    })
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const switchMut = trpc.organizations.switch.useMutation({
    onSuccess: async () => {
      // Invalidate everything org-scoped so the UI refetches for the new context.
      await Promise.all([
        utils.leads.list.invalidate(),
        utils.campaigns.list.invalidate(),
        utils.pipelines.list.invalidate(),
        utils.dashboard.metrics.invalidate(),
        utils.dashboard.recentActivity.invalidate(),
        utils.agent.queueStats.invalidate(),
        utils.organizations.list.invalidate(),
        utils.organizations.current.invalidate(),
      ])
      router.refresh()
    },
    onError: (err) => {
      toast.error(`Erro ao trocar organização: ${err.message}`)
    },
  })

  const active = orgs?.find((o) => o.isCurrent) ?? orgs?.[0]

  function roleLabel(role: string): string {
    switch (role) {
      case 'super_admin':
        return 'Super Admin'
      case 'org_admin':
        return 'Admin'
      case 'member':
        return 'Membro'
      case 'viewer':
        return 'Leitor'
      default:
        return role
    }
  }

  if (isLoading || !active) {
    return (
      <div
        className={cn(
          'flex items-center rounded-lg bg-[var(--surface-2)]',
          collapsed ? 'mx-auto h-9 w-9 justify-center' : 'gap-2 px-2 py-2'
        )}
      >
        <Building2 className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        {!collapsed && (
          <span className="text-xs text-[var(--text-tertiary)]">Carregando...</span>
        )}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={collapsed ? active.name : undefined}
            className={cn(
              'group flex items-center rounded-lg transition-colors',
              'bg-[var(--surface-2)] hover:bg-[var(--surface-3)]',
              collapsed ? 'mx-auto h-9 w-9 justify-center' : 'gap-2 px-2 py-2 w-full'
            )}
          />
        }
      >
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
          }}
        >
          <Building2 className="h-3 w-3" />
        </span>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-none text-left">
              <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {active.name}
              </span>
              <span className="truncate text-[10px] text-[var(--text-tertiary)]">
                {roleLabel(active.role)} · {active.plan}
              </span>
            </span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64" align="start" sideOffset={6}>
        <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Suas organizações
        </div>
        {(orgs ?? []).map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => {
              if (o.isCurrent || switchMut.isPending) return
              switchMut.mutate({ orgId: o.id })
            }}
            className="gap-2"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
            <span className="flex min-w-0 flex-1 flex-col leading-none">
              <span className="truncate text-sm">{o.name}</span>
              <span className="truncate text-[10px] text-[var(--text-tertiary)]">
                {roleLabel(o.role)} · {o.plan}
                {o.suspended && ' · suspensa'}
              </span>
            </span>
            {o.isCurrent && (
              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          render={
            <Link href="/settings/team" className="gap-2">
              <Settings2 className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm">Gerenciar time</span>
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link href="/settings/organizations/new" className="gap-2">
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm">Nova organização</span>
            </Link>
          }
        />

        <DropdownMenuSeparator />

        {/* Signed-in user info */}
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--primary) 14%, transparent)',
                color: 'var(--primary)',
              }}
            >
              <User2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {userName ?? 'Usuário'}
              </span>
              {userEmail && (
                <span className="truncate text-[10px] text-[var(--text-tertiary)]">
                  {userEmail}
                </span>
              )}
            </div>
          </div>
        </div>

        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault()
            void handleSignOut()
          }}
          className="gap-2 text-[var(--danger)] focus:text-[var(--danger)]"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
