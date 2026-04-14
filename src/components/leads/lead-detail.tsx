'use client'

import { trpc } from '@/lib/trpc-client'
import { PipelineBadge } from './pipeline-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  MessageSquare,
  Mail,
  Phone,
  Building2,
  User,
  MapPin,
  Star,
  ExternalLink,
} from 'lucide-react'
import type { Interaction, InteracaoTipo } from '@/types'

const interacaoLabel: Record<InteracaoTipo, string> = {
  enviado:   'Mensagem enviada',
  entregue:  'Entregue',
  lido:      'Lido',
  respondido:'Lead respondeu',
  clicado:   'Clicou no link',
  bounce:    'Bounce',
  erro:      'Erro no envio',
}

const interacaoColor: Record<InteracaoTipo, string> = {
  enviado:   'bg-blue-100 text-blue-700',
  entregue:  'bg-blue-50 text-blue-500',
  lido:      'bg-purple-100 text-purple-700',
  respondido:'bg-green-100 text-green-700',
  clicado:   'bg-yellow-100 text-yellow-700',
  bounce:    'bg-red-100 text-red-700',
  erro:      'bg-red-100 text-red-700',
}

function InteractionTimeline({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma interação ainda.
      </p>
    )
  }

  return (
    <ol className="relative border-l border-border ml-3 space-y-4">
      {interactions.map((it) => (
        <li key={it.id} className="ml-4">
          <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-border" />
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${interacaoColor[it.tipo]}`}>
              {interacaoLabel[it.tipo]}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(it.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
          {it.mensagem_enviada && (
            <p className="text-sm bg-muted rounded p-2 mt-1">{it.mensagem_enviada}</p>
          )}
          {it.resposta_lead && (
            <p className="text-sm bg-green-50 text-green-900 rounded p-2 mt-1">
              Resposta: {it.resposta_lead}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}

export function LeadDetail({ id }: { id: string }) {
  const { data: lead, isLoading } = trpc.leads.getById.useQuery(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!lead) {
    return <p className="text-muted-foreground">Lead não encontrado.</p>
  }

  const interactions: Interaction[] = (lead as { interactions?: Interaction[] }).interactions ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{lead.decisor_nome}</h2>
              {lead.decisor_cargo && (
                <p className="text-muted-foreground text-sm">{lead.decisor_cargo}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-sm font-medium">
                <Star className="h-4 w-4 text-yellow-500" />
                {lead.lead_score}
              </span>
              <PipelineBadge status={lead.status_pipeline as import('@/types').PipelineStatus} />
            </div>
          </div>

          <Separator className="my-4" />

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <dt className="text-muted-foreground text-xs">Empresa</dt>
                <dd className="font-medium">{lead.empresa_nome}</dd>
              </div>
            </div>

            {lead.segmento && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Segmento</dt>
                  <dd className="font-medium">{lead.segmento}</dd>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <dt className="text-muted-foreground text-xs">WhatsApp</dt>
                <dd className="font-mono">{lead.whatsapp}</dd>
              </div>
            </div>

            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">E-mail</dt>
                  <dd>{lead.email}</dd>
                </div>
              </div>
            )}

            {lead.telefone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Telefone</dt>
                  <dd className="font-mono">{lead.telefone}</dd>
                </div>
              </div>
            )}

            {(lead.cidade || lead.estado) && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">Localização</dt>
                  <dd>{[lead.cidade, lead.estado].filter(Boolean).join(', ')}</dd>
                </div>
              </div>
            )}

            {lead.linkedin_url && (
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <dt className="text-muted-foreground text-xs">LinkedIn</dt>
                  <dd>
                    <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Ver perfil
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>

          {lead.tags && lead.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {lead.tags.map((tag: string) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline de interações</CardTitle>
        </CardHeader>
        <CardContent>
          <InteractionTimeline interactions={interactions} />
        </CardContent>
      </Card>
    </div>
  )
}
