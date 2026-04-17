'use client'

import { useRouter } from 'next/navigation'
import { Shield, X } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

/**
 * Impersonation banner — shown at the top of every tenant page when the
 * caller is an Orbya super-admin currently acting as an org user.
 *
 * The banner is always visible (not dismissible) so staff never forget
 * they're in impersonation mode. Clicking "Sair" ends the session and
 * restores the admin's original org.
 */
export function ImpersonationBanner() {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Gracefully no-op for non-admins (procedure throws FORBIDDEN; we swallow).
  const { data: session } = trpc.admin.activeSession.useQuery(undefined, {
    retry: false,
    throwOnError: false,
  })

  const end = trpc.admin.endImpersonation.useMutation({
    onSuccess: async () => {
      toast.success('Sessão de impersonation encerrada')
      await Promise.all([
        utils.organizations.list.invalidate(),
        utils.organizations.current.invalidate(),
        utils.admin.activeSession.invalidate(),
      ])
      router.push('/admin/orgs')
      router.refresh()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  if (!session) return null

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-sm"
      style={{
        backgroundColor: '#7c3aed',
        color: '#fff',
      }}
    >
      <Shield className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <strong>Impersonating</strong> — você está operando como um usuário da org alvo. Motivo:
        &ldquo;{session.reason}&rdquo;
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => end.mutate()}
        disabled={end.isPending}
        className="!bg-white !text-purple-700 hover:!bg-purple-50"
      >
        <X className="mr-1 h-3 w-3" />
        Sair
      </Button>
    </div>
  )
}
