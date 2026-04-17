'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Building2, UserPlus, Trash2, Shield, Eye, User } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_META = {
  super_admin: { label: 'Super Admin', icon: Shield, color: 'var(--primary)' },
  org_admin: { label: 'Admin', icon: Shield, color: 'var(--primary)' },
  member: { label: 'Membro', icon: User, color: 'var(--text-secondary)' },
  viewer: { label: 'Leitor', icon: Eye, color: 'var(--text-tertiary)' },
} as const

type Role = keyof typeof ROLE_META
type InvitableRole = 'org_admin' | 'member' | 'viewer'

type OrgShape = {
  id: string
  name: string
  plan: string
  slug: string
  currentUserRole: Role
}

type MemberShape = {
  userId: string
  fullName: string
  avatarUrl: string | null
  role: Role
  joinedAt: string
  invitedAt: string | null
}

/**
 * Multi-tenant team management UI. Any org member can see the list; only
 * org_admins can invite/change roles/remove. Buttons are gated by the
 * `currentUserRole` field returned by `organizations.current`.
 */
export function TeamManager() {
  const { data: org, isLoading: orgLoading } = trpc.organizations.current.useQuery()
  const { data: members, isLoading: membersLoading } =
    trpc.organizations.listMembers.useQuery()

  const isAdmin =
    org?.currentUserRole === 'org_admin' || org?.currentUserRole === 'super_admin'

  return (
    <div className="space-y-6">
      {/* OrgHeaderCard: inner component with key remount so the input
          initializes cleanly from fetched data — no effect-driven sync. */}
      {org ? (
        <OrgHeaderCard
          key={`${org.id}:${org.name}`}
          org={org as OrgShape}
          isAdmin={isAdmin}
        />
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <p className="text-xs text-[var(--text-tertiary)]">
            {orgLoading ? 'Carregando...' : 'Sem organização ativa.'}
          </p>
        </div>
      )}

      {isAdmin && <InviteCard />}

      <MembersList
        members={(members ?? []) as MemberShape[]}
        isAdmin={isAdmin}
        loading={membersLoading}
      />
    </div>
  )
}

function OrgHeaderCard({ org, isAdmin }: { org: OrgShape; isAdmin: boolean }) {
  const utils = trpc.useUtils()
  const [orgName, setOrgName] = useState(org.name)
  const dirty = orgName !== org.name

  const updateOrg = trpc.organizations.update.useMutation({
    onSuccess: () => {
      toast.success('Organização atualizada')
      utils.organizations.current.invalidate()
      utils.organizations.list.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
      <div className="mb-4 flex items-center gap-3">
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
          }}
        >
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {org.name}
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Plano: {org.plan} · Slug: {org.slug}
          </p>
        </div>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2">
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Nome da organização"
            className="max-w-sm"
          />
          <Button
            onClick={() => updateOrg.mutate({ name: orgName })}
            disabled={!dirty || orgName.length < 2 || updateOrg.isPending}
          >
            Salvar
          </Button>
        </div>
      )}
    </div>
  )
}

function InviteCard() {
  const utils = trpc.useUtils()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InvitableRole>('member')

  const invite = trpc.organizations.inviteMember.useMutation({
    onSuccess: () => {
      toast.success('Membro convidado')
      setInviteEmail('')
      utils.organizations.listMembers.invalidate()
    },
    onError: (e) => toast.error(`Erro ao convidar: ${e.message}`),
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Convidar membro
      </h3>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">
        O convidado precisa já ter uma conta Orbya. Convites por magic-link
        estão na Fase 6.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="email@empresa.com"
          className="max-w-sm"
        />
        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as InvitableRole)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="org_admin">Admin</SelectItem>
            <SelectItem value="member">Membro</SelectItem>
            <SelectItem value="viewer">Leitor</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            if (!inviteEmail) return
            invite.mutate({ email: inviteEmail, role: inviteRole })
          }}
          disabled={!inviteEmail || invite.isPending}
        >
          <UserPlus className="mr-1 h-4 w-4" />
          Convidar
        </Button>
      </div>
    </div>
  )
}

function MembersList({
  members,
  isAdmin,
  loading,
}: {
  members: MemberShape[]
  isAdmin: boolean
  loading: boolean
}) {
  const utils = trpc.useUtils()

  const updateRole = trpc.organizations.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success('Role atualizada')
      utils.organizations.listMembers.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const removeMember = trpc.organizations.removeMember.useMutation({
    onSuccess: () => {
      toast.success('Membro removido')
      utils.organizations.listMembers.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Membros ({members.length})
      </h3>
      {loading ? (
        <p className="text-xs text-[var(--text-tertiary)]">Carregando...</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">Nenhum membro.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {members.map((m) => {
            const meta = ROLE_META[m.role] ?? ROLE_META.member
            const RoleIcon = meta.icon
            const initials = (m.fullName || 'U')
              .split(' ')
              .map((s) => s[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()
            return (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback
                    className="text-xs font-semibold bg-[var(--surface-3)] text-[var(--primary)] border border-[var(--border)]"
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {m.fullName || 'Sem nome'}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                    <RoleIcon className="h-3 w-3" style={{ color: meta.color }} />
                    {meta.label}
                    <span>
                      {' '}
                      · Entrou em {new Date(m.joinedAt).toLocaleDateString('pt-BR')}
                    </span>
                  </p>
                </div>
                {isAdmin && m.role !== 'super_admin' && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        updateRole.mutate({
                          userId: m.userId,
                          role: v as InvitableRole,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="org_admin">Admin</SelectItem>
                        <SelectItem value="member">Membro</SelectItem>
                        <SelectItem value="viewer">Leitor</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (
                          confirm(
                            `Remover ${m.fullName || 'este usuário'} da organização?`
                          )
                        ) {
                          removeMember.mutate({ userId: m.userId })
                        }
                      }}
                      disabled={removeMember.isPending}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
