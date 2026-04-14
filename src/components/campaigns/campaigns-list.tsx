'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { Plus, Users, Send, MessageSquare, CalendarCheck } from 'lucide-react'
import type { CampaignStatus } from '@/types'

const statusLabel: Record<CampaignStatus, string> = {
  rascunho:  'Rascunho',
  ativa:     'Ativa',
  pausada:   'Pausada',
  concluida: 'Concluída',
}

const statusColor: Record<CampaignStatus, string> = {
  rascunho:  'bg-slate-100 text-slate-600',
  ativa:     'bg-green-100 text-green-700',
  pausada:   'bg-yellow-100 text-yellow-700',
  concluida: 'bg-blue-100 text-blue-700',
}

export function CampaignsList() {
  const { data: campaigns, isLoading } = trpc.campaigns.list.useQuery()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button render={<Link href="/campaigns/new" />}>
          <Plus className="mr-1 h-4 w-4" /> Nova campanha
        </Button>
      </div>

      {!campaigns || campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-muted-foreground">Nenhuma campanha criada ainda.</p>
            <Button variant="outline" render={<Link href="/campaigns/new" />}>
              Criar primeira campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{c.nome}</CardTitle>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[c.status as CampaignStatus]}`}>
                    {statusLabel[c.status as CampaignStatus]}
                  </span>
                </CardHeader>
                <CardContent>
                  {c.descricao && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {c.descricao}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{c.total_leads} leads</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Send className="h-3.5 w-3.5" />
                      <span>{c.total_enviados} enviados</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{c.total_respondidos} respostas</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <CalendarCheck className="h-3.5 w-3.5" />
                      <span>{c.total_reunioes} reuniões</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
