import { z } from 'zod'
import { router, orgProcedure, writerProcedure } from '@/lib/trpc'

export const leadsRouter = router({
  list: orgProcedure
    .input(
      z.object({
        page: z.number().default(1),
        pageSize: z.number().default(50),
        status: z.string().optional(),
        campaignId: z.string().uuid().optional(),
        pipelineId: z.string().uuid().nullable().optional(),
        segmento: z.string().optional(),
        cidade: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, campaignId, pipelineId, segmento, cidade, search } = input
      const from = (page - 1) * pageSize

      let query = ctx.supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)

      if (status) query = query.eq('status_pipeline', status)
      if (campaignId) query = query.eq('campaign_id', campaignId)
      if (pipelineId === null) {
        // Explicit null means "sem pipeline"
        query = query.is('pipeline_id', null)
      } else if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId)
      }
      if (segmento) query = query.ilike('segmento', `%${segmento}%`)
      if (cidade) query = query.ilike('cidade', `%${cidade}%`)
      if (search) {
        query = query.or(
          `decisor_nome.ilike.%${search}%,empresa_nome.ilike.%${search}%`
        )
      }

      const { data, error, count } = await query

      if (error) throw error
      return { leads: data ?? [], total: count ?? 0 }
    }),

  getById: orgProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('leads')
        .select('*, interactions(*)')
        .eq('id', input)
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)
        .single()

      if (error) throw error
      return data
    }),

  create: writerProcedure
    .input(
      z.object({
        empresa_nome: z.string().min(1),
        decisor_nome: z.string().min(1),
        whatsapp: z.string().min(10),
        cnpj: z.string().optional(),
        segmento: z.string().optional(),
        cidade: z.string().optional(),
        estado: z.string().optional(),
        decisor_cargo: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        linkedin_url: z.string().url().optional().or(z.literal('')),
        telefone: z.string().optional(),
        tags: z.array(z.string()).default([]),
        campaign_id: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('leads')
        .insert({
          ...input,
          organization_id: ctx.orgId,
          user_id: ctx.user.id, // kept as "creator" audit field
          fonte: 'manual',
        })
        .select()
        .single()

      if (error) throw error
      return data
    }),

  update: writerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        empresa_nome: z.string().min(1).optional(),
        decisor_nome: z.string().min(1).optional(),
        whatsapp: z.string().min(10).optional().or(z.literal('')),
        decisor_cargo: z.string().optional(),
        segmento: z.string().optional(),
        cidade: z.string().optional(),
        estado: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        // Inline edit support — these are stored on the leads row.
        telefone: z.string().optional().or(z.literal('')),
        cnpj: z.string().optional().or(z.literal('')),
        linkedin_url: z.string().optional().or(z.literal('')),
        razao_social: z.string().optional().or(z.literal('')),
        nome_fantasia: z.string().optional().or(z.literal('')),
        status_pipeline: z
          .enum(['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido'])
          .optional(),
        tags: z.array(z.string()).optional(),
        campaign_id: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('leads')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', ctx.orgId)
        .select()
        .single()

      if (error) throw error
      return data
    }),

  /**
   * Re-roda enriquecimento externo num lead já importado:
   *   - BrasilAPI (CNPJ → razão, endereço, situação, QSA, telefone, e-mail)
   *   - ReceitaWS como fallback se BrasilAPI esparso
   *   - HTTP probe de website (slug do nome)
   *
   * Política de merge: SÓ preenche campos vazios. NUNCA sobrescreve dado
   * que o usuário já editou manualmente. Se for contradição, registra
   * num log mas mantém o que tá no banco.
   *
   * Não chama Claude (não regenera mensagens) — pra isso o user usa
   * "Reescrever mensagem" em outro fluxo. Foco aqui é fato externo.
   */
  enrich: writerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { verifyCnpj } = await import('@/lib/verification/cnpj')
      const { detectWebsite } = await import('@/lib/verification/website')

      const { data: lead, error: leadErr } = await ctx.supabase
        .from('leads')
        .select('*')
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)
        .single()
      if (leadErr || !lead) throw new Error('Lead não encontrado')

      const findings: string[] = []
      const patches: Record<string, unknown> = {}

      // 1. BrasilAPI / ReceitaWS por CNPJ
      if (lead.cnpj && typeof lead.cnpj === 'string' && lead.cnpj.trim().length > 0) {
        try {
          const r = await verifyCnpj(lead.cnpj)
          if (r.verified) {
            const fillIfEmpty = (key: string, value: string | null | undefined) => {
              if (!value) return
              const current = lead[key as keyof typeof lead]
              if (current && String(current).trim().length > 0) return
              patches[key] = value
              findings.push(`${key} via Receita`)
            }
            fillIfEmpty('razao_social', r.razao_social)
            fillIfEmpty('nome_fantasia', r.nome_fantasia)
            fillIfEmpty('cidade', r.cidade)
            fillIfEmpty('estado', r.estado)
            fillIfEmpty('telefone', r.telefone)
            fillIfEmpty('email', r.email)
            // Promove celular da Receita pra WhatsApp se vazio
            if (r.telefone_mobile && r.telefone && (!lead.whatsapp || String(lead.whatsapp).trim() === '')) {
              patches.whatsapp = `55${r.telefone.replace(/\D/g, '')}`
              findings.push('whatsapp via Receita (celular)')
            }
          } else if (r.reason === 'not_found') {
            findings.push('CNPJ não localizado na Receita')
          }
        } catch (err) {
          findings.push(`Erro Receita: ${err instanceof Error ? err.message : 'desconhecido'}`)
        }
      } else {
        findings.push('Sem CNPJ — pulou Receita')
      }

      // 2. HTTP probe pra website
      const nameForProbe = (lead.nome_fantasia || lead.razao_social || lead.empresa_nome) as string | null
      const currentWebsite = (lead.metadata as { website?: string } | null)?.website
      if (nameForProbe && !currentWebsite) {
        try {
          const ws = await detectWebsite(nameForProbe, { timeoutMs: 2500 })
          if (ws.verified) {
            // Salva no metadata.website (não temos coluna dedicada nesta tabela)
            patches.metadata = {
              ...(lead.metadata as Record<string, unknown> ?? {}),
              website: ws.url,
            }
            findings.push(`Website: ${ws.domain}`)
          }
        } catch { /* probe failed */ }
      }

      if (Object.keys(patches).length === 0) {
        return { lead, updated: false, findings }
      }

      const { data: updated, error: updErr } = await ctx.supabase
        .from('leads')
        .update({ ...patches, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
        .select()
        .single()
      if (updErr) throw updErr
      return { lead: updated, updated: true, findings }
    }),

  softDelete: writerProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input)
        .eq('organization_id', ctx.orgId)

      if (error) throw error
      return { success: true }
    }),

  bulkUpdateTags: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
      addTags: z.array(z.string()).default([]),
      removeTags: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { leadIds, addTags, removeTags } = input

      // Fetch current leads (scoped to org)
      const { data: leads, error: fetchError } = await ctx.supabase
        .from('leads')
        .select('id, tags')
        .eq('organization_id', ctx.orgId)
        .in('id', leadIds)
        .is('deleted_at', null)

      if (fetchError) throw fetchError

      // Update each lead's tags
      const updates = (leads ?? []).map(lead => {
        let tags = lead.tags ?? []
        tags = [...new Set([...tags, ...addTags])]
        tags = tags.filter((t: string) => !removeTags.includes(t))
        return ctx.supabase
          .from('leads')
          .update({ tags, updated_at: new Date().toISOString() })
          .eq('id', lead.id)
          .eq('organization_id', ctx.orgId)
      })

      await Promise.all(updates)
      return { updated: leads?.length ?? 0 }
    }),

  bulkMoveCampaign: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
      campaignId: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ campaign_id: input.campaignId, updated_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .in('id', input.leadIds)
        .is('deleted_at', null)

      if (error) throw error
      return { updated: input.leadIds.length }
    }),

  bulkUpdateStatus: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
      status: z.enum(['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ status_pipeline: input.status, updated_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .in('id', input.leadIds)
        .is('deleted_at', null)

      if (error) throw error
      return { updated: input.leadIds.length }
    }),

  bulkDelete: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .in('id', input.leadIds)

      if (error) throw error
      return { deleted: input.leadIds.length }
    }),
})
