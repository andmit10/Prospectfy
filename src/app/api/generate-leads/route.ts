import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentOrgId } from '@/lib/org-context'
import { llm } from '@/lib/llm'
import { extractJson } from '@/lib/llm/validator'
import {
  getTrialStatus,
  incrementLeadsGenerated,
  TRIAL_LEAD_LIMIT,
} from '@/lib/trial/limits'
import { childLogger } from '@/lib/logger'
import { enforceRateLimit, clientIdFromRequest } from '@/lib/rate-limit'
import { z } from 'zod'

const log = childLogger('api:generate-leads')

// Two modes:
//   * 'discover' — classic flow. Filters + quantity, returns N leads.
//   * 'search'   — enrich a single company by name or CNPJ, returns 1 lead.
//                  Skips filters entirely; only `empresa_busca` is required.
const inputSchema = z.object({
  mode: z.enum(['discover', 'search']).default('discover'),
  // Discover-mode fields (required when mode='discover')
  segmento: z.string().optional().default(''),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  bairro: z.string().optional(),
  regiao: z.string().optional(),
  raio_km: z.number().optional(),
  quantidade: z.number().min(1).max(500).default(50),
  cargo_alvo: z.string().optional(),
  cargos_alvo: z.array(z.string()).optional(),
  rating_minimo: z.number().min(0).max(5).default(0),
  rating_maximo: z.number().min(0).max(5).optional(),
  min_avaliacoes: z.number().optional(),
  apenas_cnpj_ativo: z.boolean().default(false),
  porte: z.string().optional(),
  funcionarios_min: z.number().optional(),
  funcionarios_max: z.number().optional(),
  faturamento_min: z.number().optional(),
  anos_empresa_min: z.number().optional(),
  exige_website: z.boolean().optional(),
  exige_email: z.boolean().optional(),
  exige_linkedin: z.boolean().optional(),
  excluir_termos: z.array(z.string()).optional(),
  fontes: z.array(z.string()).default(['google_maps']),
  // Search-mode field (required when mode='search')
  empresa_busca: z.string().optional(),
}).superRefine((val, ctx) => {
  if (val.mode === 'search') {
    if (!val.empresa_busca || val.empresa_busca.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['empresa_busca'],
        message: 'Informe um nome de empresa ou CNPJ para a busca',
      })
    }
  } else {
    if (!val.segmento || val.segmento.trim().length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['segmento'],
        message: 'Segmento é obrigatório no modo descobrir',
      })
    }
  }
})

// A single decision-maker. We deliberately use a search URL (not a direct
// /in/<slug> URL) because the LLM has no way to verify a profile actually
// exists — search URLs always work and let the user click through to the
// real result.
const decisorSchema = z.object({
  nome: z.string(),
  cargo: z.string().optional().default(''),
  email: z.string().optional().default(''),
  whatsapp: z.string().optional().default(''),
  linkedin_url: z.string().optional().default(''),
  principal: z.boolean().optional().default(false),
})

const leadSchema = z.object({
  empresa_nome: z.string(),
  // Legacy single-decisor fields kept for backwards compat with downstream
  // code (DataTable column, exports, agent prompt vars). We populate these
  // from `decisores[0]` when the LLM returns the array form.
  decisor_nome: z.string(),
  decisor_cargo: z.string().optional().default(''),
  segmento: z.string().optional().default(''),
  cidade: z.string().optional().default(''),
  estado: z.string().optional().default(''),
  email: z.string().optional().default(''),
  whatsapp: z.string(),
  telefone: z.string().optional().default(''),
  linkedin_url: z.string().optional().default(''),
  cnpj: z.string().optional().default(''),
  cnpj_ativo: z.boolean().optional().default(true),
  rating_maps: z.number().min(0).max(5).optional().default(0),
  total_avaliacoes: z.number().optional().default(0),
  porte: z.string().optional().default(''),
  funcionarios_estimados: z.number().optional().default(0),
  score: z.number().min(0).max(100).default(50),
  score_detalhes: z.object({
    maps_presenca: z.number().default(0),
    decisor_encontrado: z.number().default(0),
    email_validado: z.number().default(0),
    linkedin_ativo: z.number().default(0),
    porte_match: z.number().default(0),
  }).optional().default({
    maps_presenca: 0,
    decisor_encontrado: 0,
    email_validado: 0,
    linkedin_ativo: 0,
    porte_match: 0,
  }),
  // ─── New enrichment fields (Phase C) ───
  decisores: z.array(decisorSchema).optional().default([]),
  mensagem_whatsapp: z.string().optional().default(''),
  mensagem_email_assunto: z.string().optional().default(''),
  mensagem_email_corpo: z.string().optional().default(''),
  justificativa_score: z.string().optional().default(''),
  horario_ideal: z.string().optional().default(''),
})

// SSE helper: send a JSON event to the stream
function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: Record<string, unknown>
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

export async function POST(request: NextRequest) {
  // Rate limits run before we start streaming so the 429 can use a normal JSON
  // response. Claude calls are expensive — 6/min is generous for a real user
  // and cheap enough to deter abuse.
  const ipBlocked = await enforceRateLimit({
    key: `generate-leads:ip:${clientIdFromRequest(request)}`,
    limit: 30,
    windowSec: 60,
  })
  if (ipBlocked) return ipBlocked

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Auth check
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          sendEvent(controller, encoder, { type: 'error', message: 'Não autorizado' })
          controller.close()
          return
        }

        const orgId = await resolveCurrentOrgId(supabase, user.id)
        if (!orgId) {
          sendEvent(controller, encoder, { type: 'error', message: 'Sem organização ativa' })
          controller.close()
          return
        }

        // Per-org cap — 6 generations per minute. The trial counter already
        // bounds total volume; this additional bucket stops a single org from
        // monopolising Claude/Maps capacity with a loop.
        const orgLimitResult = await enforceRateLimit({
          key: `generate-leads:org:${orgId}`,
          limit: 6,
          windowSec: 60,
        })
        if (orgLimitResult) {
          sendEvent(controller, encoder, {
            type: 'error',
            reason: 'rate_limit',
            message: 'Você atingiu o limite de gerações por minuto. Tente novamente em alguns segundos.',
          })
          controller.close()
          return
        }

        // Trial gate — fail closed with a specific event type so the UI can
        // show an upgrade modal instead of a generic error toast.
        const trial = await getTrialStatus(supabase, orgId)
        if (trial.expired) {
          sendEvent(controller, encoder, {
            type: 'error',
            reason: 'trial_expired',
            message: 'Seu trial de 7 dias acabou. Faça upgrade para continuar gerando leads.',
          })
          controller.close()
          return
        }
        if (trial.exhausted) {
          sendEvent(controller, encoder, {
            type: 'error',
            reason: 'trial_quota',
            message: `Você já gerou os ${trial.leadsLimit} leads incluídos no trial. Faça upgrade para continuar.`,
          })
          controller.close()
          return
        }

        // Parse input
        const body = await request.json()
        const input = inputSchema.safeParse(body)
        if (!input.success) {
          sendEvent(controller, encoder, { type: 'error', message: 'Dados inválidos' })
          controller.close()
          return
        }

        // Search mode always asks for exactly 1 company, so trial allowance
        // only bounds the discover flow.
        const isSearch = input.data.mode === 'search'
        if (isSearch) {
          input.data.quantidade = 1
        }

        // Trim the requested quantity to the remaining trial allowance (discover only).
        const remainingAllowance =
          trial.plan === 'trial'
            ? Math.max(0, trial.leadsLimit - trial.leadsGenerated)
            : Number.POSITIVE_INFINITY
        if (!isSearch && input.data.quantidade > remainingAllowance) {
          input.data.quantidade = remainingAllowance
          sendEvent(controller, encoder, {
            type: 'progress',
            step: 'maps',
            status: 'running',
            message: `Trial: restam ${remainingAllowance} leads do seu limite. Gerando ${remainingAllowance}.`,
          })
        }

        const {
          segmento, cidade, estado, bairro, regiao: regiaoCustom, raio_km,
          quantidade, cargo_alvo, cargos_alvo,
          rating_minimo, rating_maximo, min_avaliacoes,
          apenas_cnpj_ativo, porte,
          funcionarios_min, funcionarios_max,
          faturamento_min, anos_empresa_min,
          exige_website, exige_email, exige_linkedin,
          excluir_termos,
          empresa_busca,
        } = input.data

        const regiao = regiaoCustom
          || [bairro, cidade, estado].filter(Boolean).join(', ')
          || 'Brasil'
        const cargo = cargos_alvo?.length
          ? cargos_alvo.join(', ')
          : cargo_alvo || 'CEO, Diretor, Gerente ou Sócio'

        // Step 1: Maps (different message per mode)
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'maps',
          status: 'running',
          message: isSearch
            ? `Pesquisando "${empresa_busca}"...`
            : `Buscando empresas de "${segmento}" em ${regiao}...`,
        })

        // Legacy env check kept for backwards-compat — Gateway also honors it
        // when Anthropic is the selected provider.
        const apiKey = process.env.AI_SERVICE_KEY ?? process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          sendEvent(controller, encoder, { type: 'error', message: 'Chave da IA não configurada' })
          controller.close()
          return
        }

        // ── Pre-generation dedup: fetch existing fingerprints to exclude ──
        // We ask Claude not to re-generate leads the user already has.
        const { data: existingLeads } = await supabase
          .from('leads')
          .select('empresa_nome, whatsapp, cnpj')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .limit(500)

        const existingCompanies = (existingLeads ?? []).map(l => l.empresa_nome).filter(Boolean)
        const existingWhatsapps = new Set((existingLeads ?? []).map(l => l.whatsapp).filter(Boolean))
        const existingCnpjs = new Set((existingLeads ?? []).map(l => l.cnpj).filter(Boolean))

        const excludeBlock = existingCompanies.length
          ? `\nEMPRESAS JÁ EXISTENTES NA BASE DO USUÁRIO (NÃO INCLUIR — são duplicatas):\n${existingCompanies.slice(0, 200).map(n => `- ${n}`).join('\n')}${
              existingCompanies.length > 200 ? `\n(... mais ${existingCompanies.length - 200} empresas omitidas)` : ''
            }\n`
          : ''

        // Build enhanced filter list
        const filterLines: string[] = []
        if (porte) filterLines.push(`- Porte: ${porte}`)
        if (apenas_cnpj_ativo) filterLines.push(`- Todos os CNPJs devem ser ativos (cnpj_ativo: true)`)
        if (rating_minimo > 0) filterLines.push(`- Rating mínimo Google Maps: ${rating_minimo}`)
        if (rating_maximo && rating_maximo < 5) filterLines.push(`- Rating máximo Google Maps: ${rating_maximo}`)
        if (min_avaliacoes) filterLines.push(`- Mínimo de ${min_avaliacoes} avaliações no Maps`)
        if (bairro) filterLines.push(`- Bairro/Região específica: ${bairro}`)
        if (raio_km) filterLines.push(`- Raio de ${raio_km}km da cidade`)
        if (funcionarios_min) filterLines.push(`- Mínimo ${funcionarios_min} funcionários`)
        if (funcionarios_max) filterLines.push(`- Máximo ${funcionarios_max} funcionários`)
        if (faturamento_min) filterLines.push(`- Faturamento anual estimado mínimo: R$ ${faturamento_min.toLocaleString('pt-BR')}`)
        if (anos_empresa_min) filterLines.push(`- Empresa com pelo menos ${anos_empresa_min} anos de existência`)
        if (exige_website) filterLines.push(`- Obrigatório ter website funcional`)
        if (exige_email) filterLines.push(`- Obrigatório ter e-mail corporativo válido`)
        if (exige_linkedin) filterLines.push(`- Obrigatório ter LinkedIn da empresa ou decisor`)
        if (excluir_termos?.length) filterLines.push(`- EXCLUIR empresas que contenham: ${excluir_termos.join(', ')}`)

        const filterBlock = filterLines.length ? `\nFILTROS AVANÇADOS:\n${filterLines.join('\n')}` : ''

        function buildPrompt(batchSize: number): string {
          return `Você é um sistema avançado de geração de leads B2B brasileiro.
Gere EXATAMENTE ${batchSize} leads empresariais detalhados para prospecção.

PARÂMETROS:
- Segmento: ${segmento}
- Região: ${regiao}
- Cargo alvo do decisor: ${cargo}${filterBlock}${excludeBlock}

RETORNE APENAS um array JSON puro (sem \`\`\`json nem texto adicional). Cada lead DEVE ter TODOS estes campos:
[{
  "empresa_nome": "Nome Real da Empresa Ltda",
  "decisor_nome": "Nome Completo Real",
  "decisor_cargo": "${cargos_alvo?.[0] || cargo_alvo || 'Diretor'}",
  "decisores": [
    {
      "nome": "Nome do decisor principal",
      "cargo": "${cargos_alvo?.[0] || cargo_alvo || 'Diretor'}",
      "email": "nome@empresa.com.br",
      "whatsapp": "5531999990001",
      "linkedin_url": "https://www.linkedin.com/search/results/people/?keywords=Nome+Sobrenome+Empresa",
      "principal": true
    },
    {
      "nome": "Nome de um sócio ou diretor secundário",
      "cargo": "Sócio / Diretor Comercial / Diretor Financeiro",
      "email": "nome2@empresa.com.br",
      "whatsapp": "5531999990002",
      "linkedin_url": "https://www.linkedin.com/search/results/people/?keywords=Nome2+Empresa",
      "principal": false
    }
  ],
  "segmento": "${segmento}",
  "cidade": "${cidade || 'São Paulo'}",
  "estado": "${estado || 'SP'}",
  "email": "nome@empresa.com.br",
  "whatsapp": "5531999990001",
  "telefone": "(31) 3000-0001",
  "linkedin_url": "https://www.linkedin.com/search/results/people/?keywords=Nome+Sobrenome+Empresa",
  "cnpj": "12.345.678/0001-90",
  "cnpj_ativo": true,
  "website": "https://www.empresa.com.br",
  "rating_maps": 4.5,
  "total_avaliacoes": 127,
  "porte": "ME",
  "funcionarios_estimados": 15,
  "razao_social": "EMPRESA LTDA",
  "nome_fantasia": "Empresa",
  "score": 78,
  "score_detalhes": {
    "maps_presenca": 20,
    "decisor_encontrado": 25,
    "email_validado": 15,
    "linkedin_ativo": 20,
    "porte_match": 10
  },
  "justificativa_score": "Empresa com X funcionários no segmento certo, decisor com cargo de decisão de compra, presente no LinkedIn e Google Maps com boa reputação. Alta probabilidade de resposta porque [razão específica].",
  "horario_ideal": "Segunda a quarta, 9h às 11h ou 14h às 16h (horário comercial onde decisores B2B costumam estar mais responsivos)",
  "mensagem_whatsapp": "Olá [Nome]! Sou da [Empresa Usuário] e ajudamos [tipo de empresa] como a [Empresa Lead] a [benefício específico]. Vi que vocês [observação personalizada baseada no segmento/porte]. Faz sentido marcarmos 15min essa semana pra eu te mostrar como funciona?",
  "mensagem_email_assunto": "Assunto curto e instigante (5-8 palavras)",
  "mensagem_email_corpo": "Olá [Nome],\\n\\nParágrafo 1: contexto + por que estou entrando em contato com a [Empresa].\\n\\nParágrafo 2: benefício específico que entregamos pra empresas como a sua.\\n\\nParágrafo 3: CTA claro — proposta de reunião curta.\\n\\nAbraço,\\n[Seu Nome]"
}]

REGRAS OBRIGATÓRIAS:
- Nomes realistas de empresas brasileiras do segmento "${segmento}" em ${regiao}
- Decisores com nomes brasileiros completos e cargos reais
- decisores: array com 2-4 decisores por empresa (1 principal + sócios/diretores secundários). O primeiro deve ter principal: true e bater com decisor_nome do nível superior.
- linkedin_url SEMPRE em formato de BUSCA (https://www.linkedin.com/search/results/people/?keywords=...). NUNCA gere URLs do tipo /in/<slug> porque você não tem como verificar se existem.
- WhatsApp: 55 + DDD da região + 9 dígitos (13 dígitos total)
- CNPJ: formato XX.XXX.XXX/0001-XX com dígitos plausíveis
- rating_maps: nota de 1.0 a 5.0 (com 1 casa decimal)
- total_avaliacoes: número entre 5 e 500
- porte: um de "MEI", "ME", "EPP", "Média", "Grande"
- funcionarios_estimados: número compatível com o porte
- website: domínio institucional plausível da empresa. Use variações do nome real. NUNCA repita o exemplo — gere domínios realistas. Se a empresa for muito pequena, pode ser null.
- razao_social: nome jurídico completo em CAIXA ALTA terminando em LTDA/S.A./EIRELI/ME
- nome_fantasia: nome comercial curto (sem o sufixo jurídico)
- score: 0-100, soma dos score_detalhes
- justificativa_score: 1-2 frases concretas explicando POR QUE esse lead é quente. Cite dados específicos (porte, presença online, cargo). NÃO seja genérico.
- horario_ideal: 1 frase com dia e janela de horário recomendada para o primeiro contato.
- mensagem_whatsapp: 2-3 parágrafos curtos, tom profissional mas casual (WhatsApp brasileiro). Use [Nome] e [Empresa Usuário] como placeholders. Termina com CTA pra reunião de 15min.
- mensagem_email_assunto: curto, direto, instigante.
- mensagem_email_corpo: 3 parágrafos. Use \\n para quebras. Use [Nome], [Empresa], [Seu Nome] como placeholders.
- Todos os ${batchSize} leads DIFERENTES entre si
- E-mails com domínio da empresa (.com.br ou .com)
- NÃO use nomes genéricos — seja específico e realista
- RESPONDA APENAS COM O ARRAY JSON — NENHUM TEXTO ANTES OU DEPOIS`
        }

        // Search-mode prompt: enrich a single company by name or CNPJ.
        // Returns a single-item array to keep the parsing path identical to
        // discover-mode (downstream code treats everything as an array).
        function buildSearchPrompt(): string {
          const query = (empresa_busca ?? '').trim()
          const looksLikeCnpj = /\d{2}[.\-\/]?\d{3}[.\-\/]?\d{3}[.\-\/]?\d{4}[.\-\/]?\d{2}/.test(query)
          return `Você é um sistema avançado de enriquecimento de empresas B2B brasileiras.
Retorne os dados da empresa "${query}" em formato de lead enriquecido.
${looksLikeCnpj ? 'A query é um CNPJ — use exatamente esse CNPJ e deduza o resto.' : 'A query é um nome — deduza o CNPJ mais plausível e os demais dados.'}

Se você NÃO tiver dados confiáveis sobre essa empresa específica, ainda assim retorne um
lead com os dados mais prováveis baseados no nome/CNPJ. Use o nome como razão social
formal e deduza nome_fantasia, segmento, porte e decisores típicos do setor.

RETORNE APENAS um array JSON com EXATAMENTE 1 item no mesmo formato da geração normal:
[{
  "empresa_nome": "Nome da empresa",
  "decisor_nome": "Nome do decisor principal",
  "decisor_cargo": "Cargo (CEO, Diretor, Sócio, etc.)",
  "decisores": [
    { "nome": "...", "cargo": "...", "email": "...", "whatsapp": "...", "linkedin_url": "https://www.linkedin.com/search/results/people/?keywords=...", "principal": true },
    { "nome": "...", "cargo": "...", "email": "...", "whatsapp": "...", "linkedin_url": "...", "principal": false }
  ],
  "segmento": "Segmento da empresa",
  "cidade": "Cidade", "estado": "UF",
  "email": "contato@empresa.com.br",
  "whatsapp": "5531999990001",
  "telefone": "(31) 3000-0001",
  "linkedin_url": "https://www.linkedin.com/search/results/people/?keywords=Empresa",
  "cnpj": "XX.XXX.XXX/0001-XX",
  "cnpj_ativo": true,
  "website": "https://www.empresa.com.br",
  "rating_maps": 4.5, "total_avaliacoes": 127,
  "porte": "ME", "funcionarios_estimados": 15,
  "razao_social": "EMPRESA LTDA", "nome_fantasia": "Empresa",
  "score": 78,
  "score_detalhes": { "maps_presenca": 20, "decisor_encontrado": 25, "email_validado": 15, "linkedin_ativo": 20, "porte_match": 10 },
  "justificativa_score": "Por que essa empresa é um alvo quente (1-2 frases concretas).",
  "horario_ideal": "Dia + janela de horário recomendada para o primeiro contato.",
  "mensagem_whatsapp": "WhatsApp pronto com [Nome], [Empresa Usuário] como placeholders, CTA para reunião de 15min.",
  "mensagem_email_assunto": "Assunto curto e instigante",
  "mensagem_email_corpo": "Email em 3 parágrafos usando placeholders [Nome], [Empresa], [Seu Nome]."
}]

REGRAS:
- linkedin_url SEMPRE em formato de busca. NUNCA invente /in/<slug>.
- 2-4 decisores por empresa.
- Se a empresa é conhecida (grande ou pública), use dados reais. Se desconhecida,
  dedução baseada no setor + porte é aceitável — sinalize na justificativa_score.
- RESPONDA APENAS COM O ARRAY JSON.`
        }

        // Step 2: Decisor
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'maps',
          status: 'done',
          message: isSearch
            ? `Empresa "${empresa_busca}" localizada`
            : `${quantidade} empresas encontradas no Google Maps`,
        })
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'decisor',
          status: 'running',
          message: 'Identificando decisores e quadro societário...',
        })

        // Chunking: split into batches of max 25 leads to stay within token limits
        // Smaller batches now that each lead is bigger (decisores array +
        // 4 enrichment fields = ~3x payload). 15 keeps us well under the
        // 16k output token cap.
        const BATCH_SIZE = 15
        const batches: number[] = []
        let remaining = quantidade
        while (remaining > 0) {
          const n = Math.min(BATCH_SIZE, remaining)
          batches.push(n)
          remaining -= n
        }

        // NOTE: JSON extraction now lives in `@/lib/llm/validator.ts` (`extractJson`).
        // The Gateway parses/repairs JSON for every call; we only need the fallback
        // cast below when the provider returns raw strings.

        // Run batches in parallel through the LLM Gateway. The `extract`
        // task is a permissive schema tier — the inner batched prompt still
        // asks for a JSON array, and we let the Gateway's extractJson handle
        // markdown fences / partial content. Telemetry (modelId, latency,
        // cost) is recorded per batch by the Gateway.
        const batchResults = await Promise.all(
          batches.map(async (batchSize) => {
            // ~900 tokens/lead now (was ~400) due to decisores + enrichment.
            const maxTokens = Math.min(16000, Math.max(4096, batchSize * 900))
            try {
              const result = await llm.extract<unknown>({
                user: isSearch ? buildSearchPrompt() : buildPrompt(batchSize),
                // We accept any JSON shape — the batched prompt returns a raw
                // array. extractJson handles markdown fences + partial JSON.
                schema: { type: 'array' },
                maxTokens,
                orgId,
                userId: user.id,
              })
              // `result.data` is whatever extractJson produced; fall back to
              // parsing the raw content when needed.
              if (Array.isArray(result.data)) return result.data as unknown[]
              const parsed = extractJson(String(result.data ?? ''))
              return Array.isArray(parsed) ? parsed : []
            } catch (err) {
              console.error('[generate-leads] batch error:', err)
              return []
            }
          })
        )

        const combined = batchResults.flat()

        // Step 3: LinkedIn
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'decisor',
          status: 'done',
          message: `Decisores identificados com sucesso`,
        })
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'linkedin',
          status: 'running',
          message: 'Verificando perfis no LinkedIn...',
        })

        if (combined.length === 0) {
          sendEvent(controller, encoder, { type: 'error', message: 'IA não retornou formato esperado. Tente novamente.' })
          controller.close()
          return
        }

        // Validate leniently: drop only malformed leads, keep valid ones.
        // Also filter out any duplicates that Claude generated despite the exclude list.
        const validLeads: z.infer<typeof leadSchema>[] = []
        const seenWhatsapp = new Set<string>()
        const seenCompany = new Set<string>()
        let dedupSkipped = 0
        for (const item of combined) {
          const ok = leadSchema.safeParse(item)
          if (!ok.success) continue
          const lead = ok.data
          const companyKey = lead.empresa_nome.trim().toLowerCase()

          // Skip if already in user's DB (by whatsapp or CNPJ) or duplicated within batch
          if (existingWhatsapps.has(lead.whatsapp)) { dedupSkipped++; continue }
          if (lead.cnpj && existingCnpjs.has(lead.cnpj)) { dedupSkipped++; continue }
          if (seenWhatsapp.has(lead.whatsapp)) { dedupSkipped++; continue }
          if (seenCompany.has(companyKey)) { dedupSkipped++; continue }

          seenWhatsapp.add(lead.whatsapp)
          seenCompany.add(companyKey)
          validLeads.push(lead)
        }

        if (dedupSkipped > 0) {
          sendEvent(controller, encoder, {
            type: 'log',
            level: 'info',
            message: `${dedupSkipped} leads duplicados foram descartados automaticamente`,
          })
        }

        if (validLeads.length === 0) {
          const firstErr = z.array(leadSchema).safeParse(combined)
          if (!firstErr.success) console.error('Lead schema validation failed:', firstErr.error.flatten())
          sendEvent(controller, encoder, { type: 'error', message: 'Leads em formato inválido. Tente novamente.' })
          controller.close()
          return
        }

        const leads = { data: validLeads }

        // Step 4: Email
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'linkedin',
          status: 'done',
          message: `${leads.data.filter(l => l.linkedin_url).length} perfis LinkedIn encontrados`,
        })
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'email',
          status: 'running',
          message: 'Validando e-mails corporativos...',
        })

        // Simulate email validation delay
        await new Promise(r => setTimeout(r, 500))

        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'email',
          status: 'done',
          message: `${leads.data.filter(l => l.email).length} e-mails validados`,
        })

        // Step 5: Score
        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'score',
          status: 'running',
          message: 'Calculando ProspectScore 0-100 por lead...',
        })

        await new Promise(r => setTimeout(r, 400))

        sendEvent(controller, encoder, {
          type: 'progress',
          step: 'score',
          status: 'done',
          message: `Scores calculados — média: ${Math.round(leads.data.reduce((a, l) => a + l.score, 0) / leads.data.length)}`,
        })

        // Count generated leads against the trial quota. Counter increments
        // BEFORE the import step — the user "consumed" the AI budget regardless
        // of whether they choose to import these rows. Returning a non-zero
        // count ensures the header badge updates on the next refetch.
        let newTotal = trial.leadsGenerated
        if (leads.data.length > 0 && trial.plan === 'trial') {
          try {
            newTotal = await incrementLeadsGenerated(supabase, orgId, leads.data.length)
          } catch (err) {
            log.warn('failed to increment leads_generated_count', {
              orgId,
              delta: leads.data.length,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }

        // Final: Send leads
        sendEvent(controller, encoder, {
          type: 'complete',
          leads: leads.data,
          total: leads.data.length,
          trial: {
            plan: trial.plan,
            leadsGenerated: newTotal,
            leadsLimit: trial.leadsLimit,
          },
          stats: {
            emails_validados: leads.data.filter(l => l.email).length,
            linkedin_encontrados: leads.data.filter(l => l.linkedin_url).length,
            cnpj_ativos: leads.data.filter(l => l.cnpj_ativo).length,
            score_medio: Math.round(leads.data.reduce((a, l) => a + l.score, 0) / leads.data.length),
          },
        })

        controller.close()
      } catch (err) {
        log.error('generate-leads error', {
          error: err instanceof Error ? err.message : String(err),
        })
        const msg = err instanceof Error ? err.message : 'Erro interno'
        sendEvent(controller, encoder, { type: 'error', message: msg })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
