import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure, writerProcedure } from '@/lib/trpc'
import { CAMPAIGN_TEMPLATES, getTemplateById } from '@/lib/campaigns/templates'
import { llm } from '@/lib/llm'

const cadenciaStepInput = z.object({
  step_order: z.number().int().positive(),
  canal: z.enum(['whatsapp', 'email', 'linkedin', 'landing_page']),
  delay_hours: z.number().int().min(0),
  mensagem_template: z.string().min(1),
  tipo_mensagem: z.enum(['texto', 'imagem', 'documento', 'audio']).default('texto'),
  ativo: z.boolean().default(true),
})

export const campaignsRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  }),

  getById: orgProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('campaigns')
        .select('*, cadencia_steps(*)')
        .eq('id', input)
        .eq('organization_id', ctx.orgId)
        .single()

      if (error) throw error
      return data
    }),

  create: writerProcedure
    .input(
      z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        meta_reunioes: z.number().int().positive().optional(),
        steps: z.array(cadenciaStepInput).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { steps, ...campaignData } = input

      const { data: campaign, error } = await ctx.supabase
        .from('campaigns')
        .insert({
          ...campaignData,
          organization_id: ctx.orgId,
          user_id: ctx.user.id, // audit: creator
          status: 'rascunho',
        })
        .select()
        .single()

      if (error) throw error

      if (steps.length > 0) {
        const { error: stepsError } = await ctx.supabase
          .from('cadencia_steps')
          .insert(steps.map((s) => ({ ...s, campaign_id: campaign.id })))

        if (stepsError) throw stepsError
      }

      return campaign
    }),

  update: writerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        nome: z.string().min(1).optional(),
        descricao: z.string().optional(),
        status: z.enum(['rascunho', 'ativa', 'pausada', 'concluida']).optional(),
        meta_reunioes: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('campaigns')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', ctx.orgId)
        .select()
        .single()

      if (error) throw error
      return data
    }),

  /**
   * Expose the catalog so the UI can render template cards without
   * shipping the full copy to every render of the campaigns page.
   */
  listTemplates: orgProcedure.query(() => {
    return CAMPAIGN_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      color: t.color,
      useCase: t.useCase,
      expectedResult: t.expectedResult,
      tags: t.tags,
      stepCount: t.steps.length,
      channels: Array.from(new Set(t.steps.map((s) => s.canal))),
      // Steps are only sent on-demand (getTemplate below) — cheaper list.
    }))
  }),

  getTemplate: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const tpl = getTemplateById(input.id)
      if (!tpl) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Template não encontrado' })
      }
      return tpl
    }),

  /**
   * Clone a template into a real campaign. Defaults to `rascunho` so the
   * user can review + tweak before activating.
   */
  createFromTemplate: writerProcedure
    .input(
      z.object({
        templateId: z.string(),
        nome: z.string().min(1).optional(), // override name; default uses template name
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tpl = getTemplateById(input.templateId)
      if (!tpl) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Template não encontrado' })
      }

      const { data: campaign, error } = await ctx.supabase
        .from('campaigns')
        .insert({
          nome: input.nome ?? tpl.name,
          descricao: tpl.description,
          organization_id: ctx.orgId,
          user_id: ctx.user.id,
          status: 'rascunho',
        })
        .select()
        .single()

      if (error) throw error

      const stepRows = tpl.steps.map((s) => ({
        campaign_id: campaign.id,
        step_order: s.step_order,
        canal: s.canal,
        delay_hours: s.delay_hours,
        tipo_mensagem: s.tipo_mensagem,
        mensagem_template: s.mensagem_template,
        ativo: true,
      }))

      const { error: stepsError } = await ctx.supabase
        .from('cadencia_steps')
        .insert(stepRows)

      if (stepsError) {
        // Best-effort rollback — delete the campaign we just created.
        await ctx.supabase.from('campaigns').delete().eq('id', campaign.id)
        throw stepsError
      }

      return campaign
    }),

  /**
   * Natural-language → compiled campaign.
   *
   * User types e.g. "quero reaquecer clientes que sumiram há 30+ dias com 3
   * mensagens leves" and the LLM compiles a full cadence. Returns the
   * proposed campaign WITHOUT persisting — the UI shows a preview so the
   * user can accept, tweak or regenerate before saving.
   */
  compileFromDescription: writerProcedure
    .input(
      z.object({
        description: z.string().min(10).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['nome', 'descricao', 'steps'],
        properties: {
          nome: { type: 'string', minLength: 3, maxLength: 80 },
          descricao: { type: 'string', minLength: 10, maxLength: 400 },
          steps: {
            type: 'array',
            minItems: 2,
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['step_order', 'canal', 'delay_hours', 'mensagem_template'],
              properties: {
                step_order: { type: 'integer', minimum: 1, maximum: 10 },
                canal: { type: 'string', enum: ['whatsapp', 'email', 'linkedin'] },
                delay_hours: { type: 'integer', minimum: 0, maximum: 720 },
                tipo_mensagem: {
                  type: 'string',
                  enum: ['texto', 'imagem', 'documento', 'audio'],
                  default: 'texto',
                },
                mensagem_template: { type: 'string', minLength: 20, maxLength: 1200 },
              },
            },
          },
        },
      }

      const systemPrompt = `Você é um SDR sênior brasileiro que redige cadências de prospecção em português do Brasil.
Regras obrigatórias:
- Tom consultivo, humano e direto. Zero clichê corporativo, zero "espero que esteja bem".
- Use variáveis {{decisor_nome}}, {{empresa_nome}}, {{segmento}} — o sistema substitui na hora do envio.
- Mensagens WhatsApp: até 3 parágrafos, frases curtas, uma pergunta/CTA no final.
- Mensagens Email: assunto pode estar na primeira linha como "Assunto: ..." seguida da mensagem.
- Intervalos (delay_hours): primeira mensagem delay_hours=0; próximas progressivas (24-72h entre toques, até 168h para reengajar).
- Cada step deve ter um ângulo DIFERENTE (não repita o mesmo gancho).
- Última mensagem: tom de "última tentativa" elegante (não agressivo).

Você recebe uma descrição do usuário e devolve um JSON válido com { nome, descricao, steps[] }.`

      const userPrompt = `Descrição do usuário:\n"""${input.description}"""\n\nCompile em uma campanha pronta. Escolha canal(is) adequados à descrição (padrão WhatsApp se não especificado). Entre 3 e 6 steps na maioria dos casos. JSON apenas.`

      try {
        const result = await llm.extract<{
          nome: string
          descricao: string
          steps: Array<{
            step_order: number
            canal: 'whatsapp' | 'email' | 'linkedin'
            delay_hours: number
            tipo_mensagem?: 'texto' | 'imagem' | 'documento' | 'audio'
            mensagem_template: string
          }>
        }>({
          system: systemPrompt,
          user: userPrompt,
          schema,
          orgId: ctx.orgId,
          userId: ctx.user.id,
          maxTokens: 2500,
        })

        return {
          draft: result.data,
          modelId: result.modelId,
          fallbackUsed: result.fallbackUsed,
          requestId: result.requestId,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao compilar'
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Não consegui compilar a campanha: ${msg}`,
        })
      }
    }),

  upsertSteps: writerProcedure
    .input(
      z.object({
        campaign_id: z.string().uuid(),
        steps: z.array(cadenciaStepInput),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the campaign belongs to the caller's org before mutating steps.
      const { data: campaign } = await ctx.supabase
        .from('campaigns')
        .select('id')
        .eq('id', input.campaign_id)
        .eq('organization_id', ctx.orgId)
        .single()

      if (!campaign) throw new Error('Campaign not found')

      // Delete existing steps and re-insert
      await ctx.supabase
        .from('cadencia_steps')
        .delete()
        .eq('campaign_id', input.campaign_id)

      if (input.steps.length > 0) {
        const { error } = await ctx.supabase
          .from('cadencia_steps')
          .insert(input.steps.map((s) => ({ ...s, campaign_id: input.campaign_id })))

        if (error) throw error
      }

      return { success: true }
    }),
})
