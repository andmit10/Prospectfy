import { z } from 'zod'
import { router, orgProcedure, writerProcedure } from '@/lib/trpc'
import { llm } from '@/lib/llm'
import { TRPCError } from '@trpc/server'

// Schema for a single generated lead
const generatedLeadSchema = z.object({
  empresa_nome: z.string(),
  decisor_nome: z.string(),
  decisor_cargo: z.string().optional(),
  segmento: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  email: z.string().optional(),
  whatsapp: z.string(),
  telefone: z.string().optional(),
  linkedin_url: z.string().optional(),
  lead_score: z.number().min(0).max(100).default(50),
})

type GeneratedLead = z.infer<typeof generatedLeadSchema>

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]

export const generateRouter = router({
  // Generate leads via the LLM Gateway. Task "lead_gen" routes to Claude
  // Sonnet 4.5 primary with Qwen3-8B vLLM fallback, both constrained by the
  // `generate-leads` JSON Schema.
  generateLeads: orgProcedure
    .input(
      z.object({
        segmento: z.string().min(1, 'Segmento obrigatório'),
        cidade: z.string().optional(),
        estado: z.enum(ESTADOS_BR as [string, ...string[]]).optional(),
        quantidade: z.number().min(5).max(50).default(10),
        fontes: z.array(z.enum(['google_maps', 'linkedin', 'hunter'])).default(['google_maps']),
        cargo_alvo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { segmento, cidade, estado, quantidade, cargo_alvo } = input

      const regiao = [cidade, estado].filter(Boolean).join(', ') || 'Brasil'
      const cargo = cargo_alvo || 'Diretor, Gerente, CEO, Sócio ou Dono'

      const prompt = `Você é um sistema de geração de leads B2B brasileiro.
Gere ${quantidade} leads empresariais REAIS e PLAUSÍVEIS para prospecção.

Parâmetros:
- Segmento: ${segmento}
- Região: ${regiao}
- Cargo alvo do decisor: ${cargo}

Retorne um JSON válido no formato:
{
  "leads": [
    {
      "empresa_nome": "Nome da Empresa Ltda",
      "decisor_nome": "Nome Sobrenome",
      "decisor_cargo": "CEO",
      "segmento": "${segmento}",
      "cidade": "${cidade || 'São Paulo'}",
      "estado": "${estado || 'SP'}",
      "email": "nome@empresa.com.br",
      "whatsapp": "5511999990001",
      "telefone": "(11) 3000-0001",
      "linkedin_url": "https://linkedin.com/company/empresa",
      "lead_score": 65
    }
  ]
}

Regras obrigatórias:
- Nomes de empresas e pessoas brasileiros e realistas para o segmento "${segmento}"
- WhatsApp: formato 55 + DDD + número (13 dígitos total, ex: 5511912345678)
- DDD deve ser compatível com a cidade/estado
- E-mails com domínio da empresa (.com.br ou .com)
- lead_score entre 40 e 85
- Todos os ${quantidade} leads devem ser diferentes entre si
- NÃO use nomes genéricos como "Empresa ABC" ou "João Silva" — seja específico e realista`

      let leadsResult: { leads: GeneratedLead[] }
      try {
        const result = await llm.leadGen({
          user: prompt,
          orgId: ctx.orgId,
          userId: ctx.user.id,
        })
        leadsResult = result.parsed as { leads: GeneratedLead[] }
      } catch (err: unknown) {
        if (err instanceof TRPCError) throw err
        const msg = err instanceof Error ? err.message : 'Erro ao chamar a IA'
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro na geração: ${msg}` })
      }

      // Validate shape with Zod (the JSON Schema is looser to survive Qwen output).
      let leads: GeneratedLead[] = []
      try {
        leads = z.array(generatedLeadSchema).parse(leadsResult.leads ?? [])
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao processar leads gerados pela IA. Tente novamente.',
        })
      }

      return { leads, total: leads.length }
    }),

  // Import selected generated leads into the leads table
  importGeneratedLeads: writerProcedure
    .input(
      z.object({
        leads: z.array(
          z.object({
            empresa_nome: z.string(),
            decisor_nome: z.string(),
            decisor_cargo: z.string().optional(),
            segmento: z.string().optional(),
            cidade: z.string().optional(),
            estado: z.string().optional(),
            email: z.string().optional(),
            whatsapp: z.string(),
            telefone: z.string().optional(),
            linkedin_url: z.string().optional(),
            lead_score: z.number().optional(),
            cnpj: z.string().optional(),
            // Rich enrichment data — everything here lands in `metadata` jsonb
            website: z.string().optional(),
            rating_maps: z.number().optional(),
            total_avaliacoes: z.number().optional(),
            porte: z.string().optional(),
            funcionarios_estimados: z.number().optional(),
            razao_social: z.string().optional(),
            nome_fantasia: z.string().optional(),
            data_abertura: z.string().optional(),
            capital_social: z.number().optional(),
            natureza_juridica: z.string().optional(),
            situacao_cnpj: z.string().optional(),
            endereco_completo: z.string().optional(),
            logradouro: z.string().optional(),
            numero: z.string().optional(),
            bairro: z.string().optional(),
            cep: z.string().optional(),
            score_detalhes: z
              .object({
                maps_presenca: z.number(),
                decisor_encontrado: z.number(),
                email_validado: z.number(),
                linkedin_ativo: z.number(),
                porte_match: z.number(),
              })
              .optional(),
            fontes_consultadas: z.array(z.string()).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rows = input.leads.map((lead) => {
        // Split out core lead columns from the enrichment payload.
        // Anything outside core goes into `metadata`.
        const {
          empresa_nome, decisor_nome, decisor_cargo, segmento, cidade, estado,
          email, whatsapp, telefone, linkedin_url, lead_score, cnpj,
          ...enrichment
        } = lead
        return {
          empresa_nome,
          decisor_nome,
          decisor_cargo,
          segmento,
          cidade,
          estado,
          email: email || null,
          whatsapp,
          telefone,
          linkedin_url: linkedin_url || null,
          lead_score: lead_score ?? 50,
          cnpj: cnpj || null,
          organization_id: ctx.orgId,
          user_id: ctx.user.id, // audit: creator
          fonte: 'api' as const,
          metadata: enrichment, // website, rating_maps, razao_social, score_detalhes, ...
        }
      })

      const { data, error } = await ctx.supabase
        .from('leads')
        .insert(rows)
        .select()

      if (error) {
        // Handle duplicate WhatsApp+empresa_nome gracefully
        if (error.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Alguns leads já existem na sua lista (WhatsApp + empresa duplicado).',
          })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return { imported: data?.length ?? 0 }
    }),
})
