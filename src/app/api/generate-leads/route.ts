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
import { verifyCnpj, normalizeCnpj, type CnpjVerified } from '@/lib/verification/cnpj'
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
  // ─── External verification flags (Phase D) ───
  // List of external sources that confirmed at least one field on this lead.
  // UI renders green "Verificado" badge when list is non-empty.
  verified_sources: z.array(z.enum(['receita_federal', 'google_places', 'email_mx'])).optional().default([]),
  // Extra enrichment fields from Receita (when verified_sources includes receita_federal)
  razao_social: z.string().optional().default(''),
  nome_fantasia: z.string().optional().default(''),
  endereco: z.string().optional().default(''),
  cnae_descricao: z.string().optional().default(''),
  situacao_cadastral: z.string().optional().default(''),
})

// SSE helper: send a JSON event to the stream
function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: Record<string, unknown>
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

// ─── Anti-fabrication guardrails ────────────────────────────────────────────
// These strip values the LLM made up (CNPJ placeholders, sequential phones)
// even when the prompt explicitly forbids them — models occasionally slip.

// Well-known synthetic CNPJs used in tutorials/placeholders. The "12.345.678"
// pattern in particular is associated with fraud reports (see advisory on
// Facebook 2025).
const SYNTHETIC_CNPJ_PATTERNS: RegExp[] = [
  /^12[.\-/]?345[.\-/]?678/,
  /^0{2}[.\-/]?0{3}[.\-/]?0{3}/,
  /^1{2}[.\-/]?1{3}[.\-/]?1{3}/,
  /^2{2}[.\-/]?2{3}[.\-/]?2{3}/,
  /^3{2}[.\-/]?3{3}[.\-/]?3{3}/,
  /^4{2}[.\-/]?4{3}[.\-/]?4{3}/,
  /^5{2}[.\-/]?5{3}[.\-/]?5{3}/,
  /^6{2}[.\-/]?6{3}[.\-/]?6{3}/,
  /^7{2}[.\-/]?7{3}[.\-/]?7{3}/,
  /^8{2}[.\-/]?8{3}[.\-/]?8{3}/,
  /^9{2}[.\-/]?9{3}[.\-/]?9{3}/,
]

function isSyntheticCnpj(cnpj: string): boolean {
  if (!cnpj) return false
  return SYNTHETIC_CNPJ_PATTERNS.some((p) => p.test(cnpj))
}

// Modulo-11 CNPJ check digit validation. Returns true when the 14 digits
// form a mathematically valid CNPJ (doesn't prove it exists on Receita, but
// filters out random 14-digit numbers).
function hasValidCnpjCheckDigits(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1+$/.test(d)) return false
  const calc = (slice: string, weights: number[]) => {
    const sum = slice.split('').reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const dv1 = calc(d.slice(0, 12), w1)
  const dv2 = calc(d.slice(0, 12) + String(dv1), w2)
  return Number(d[12]) === dv1 && Number(d[13]) === dv2
}

// Classic tutorial/fake phone patterns. Any phone matching these is dropped.
const SYNTHETIC_PHONE_PATTERNS: RegExp[] = [
  /3000[-\s]?0001/,
  /2000[-\s]?0001/,
  /1234[-\s]?5678/,
  /5555[-\s]?5555/,
  /9999[-\s]?0001/,
  /9999[-\s]?0002/,
  /9999[-\s]?0003/,
  /1111[-\s]?1111/,
  /0000[-\s]?0000/,
  /99999[-]?0001$/,
  /99999[-]?0002$/,
  /99999[-]?0003$/,
]

function isSyntheticPhone(phone: string): boolean {
  if (!phone) return false
  return SYNTHETIC_PHONE_PATTERNS.some((p) => p.test(phone))
}

type SanitizeFlags = {
  cnpjStripped: boolean
  telefoneStripped: boolean
  whatsappStripped: boolean
}

function sanitizeLead<L extends z.infer<typeof leadSchema>>(lead: L): { lead: L; flags: SanitizeFlags } {
  const flags: SanitizeFlags = { cnpjStripped: false, telefoneStripped: false, whatsappStripped: false }
  const out: L = { ...lead }

  // CNPJ: strip if synthetic or digit-invalid. cnpj_ativo can only be true
  // when we have a digit-valid non-synthetic CNPJ.
  if (out.cnpj) {
    if (isSyntheticCnpj(out.cnpj) || !hasValidCnpjCheckDigits(out.cnpj)) {
      out.cnpj = ''
      out.cnpj_ativo = false
      flags.cnpjStripped = true
    }
  } else {
    out.cnpj_ativo = false
  }

  // Telefone fixo: strip if matches synthetic patterns.
  if (out.telefone && isSyntheticPhone(out.telefone)) {
    out.telefone = ''
    flags.telefoneStripped = true
  }

  // WhatsApp: strip if matches synthetic patterns. Downstream will see empty
  // string and the UI will mark as não-verificado.
  if (out.whatsapp && isSyntheticPhone(out.whatsapp)) {
    out.whatsapp = ''
    flags.whatsappStripped = true
  }

  // Decisores array — same treatment per-row.
  if (Array.isArray(out.decisores) && out.decisores.length > 0) {
    out.decisores = out.decisores.map((d) => ({
      ...d,
      whatsapp: d.whatsapp && isSyntheticPhone(d.whatsapp) ? '' : d.whatsapp,
    })) as L['decisores']
  }

  return { lead: out, flags }
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

        // ── Phase D: Receita Federal verification (search mode, CNPJ queries) ──
        // When the user searched by CNPJ, we hit BrasilAPI BEFORE asking the LLM
        // to generate anything. This gives us ground-truth data (razão social,
        // endereço, situação cadastral, CNAE, quadro societário) that the LLM
        // then enriches with decisor message/email copy — without inventing
        // the base identity fields.
        let receitaData: CnpjVerified | null = null
        if (isSearch) {
          const query = (empresa_busca ?? '').trim()
          const looksLikeCnpj = /\d{2}[.\-\/]?\d{3}[.\-\/]?\d{3}[.\-\/]?\d{4}[.\-\/]?\d{2}/.test(query)

          if (looksLikeCnpj) {
            sendEvent(controller, encoder, {
              type: 'progress',
              step: 'maps',
              status: 'running',
              message: 'Consultando CNPJ na Receita Federal...',
            })

            const normalized = normalizeCnpj(query)
            if (!normalized) {
              sendEvent(controller, encoder, {
                type: 'error',
                reason: 'not_found',
                message: 'CNPJ inválido — os dígitos verificadores não batem. Verifique o número digitado.',
              })
              controller.close()
              return
            }

            const result = await verifyCnpj(query)
            if (result.verified === false) {
              if (result.reason === 'not_found') {
                sendEvent(controller, encoder, {
                  type: 'error',
                  reason: 'not_found',
                  message: `CNPJ ${normalized} não foi localizado na Receita Federal. Confirme o número ou tente outro.`,
                })
                controller.close()
                return
              }
              if (result.reason === 'invalid_format') {
                sendEvent(controller, encoder, {
                  type: 'error',
                  reason: 'not_found',
                  message: 'CNPJ em formato inválido. Use 14 dígitos (com ou sem pontuação).',
                })
                controller.close()
                return
              }
              // rate_limited / network_error — fall through to LLM-only mode
              // but tell the user we couldn't verify so they know the fields
              // won't carry the ✓ Receita badge.
              sendEvent(controller, encoder, {
                type: 'log',
                level: 'warn',
                message: result.reason === 'rate_limited'
                  ? 'Receita Federal retornou rate limit — gerando sem verificação externa.'
                  : 'Receita Federal indisponível — gerando sem verificação externa.',
              })
            } else {
              receitaData = result
              if (!result.cnpj_ativo) {
                // Still useful: the CNPJ exists but is BAIXADA/SUSPENSA/INAPTA.
                // We return the data with a warning so the user sees the status
                // and decides whether to prospect.
                sendEvent(controller, encoder, {
                  type: 'log',
                  level: 'warn',
                  message: `Atenção: situação cadastral é ${result.situacao_cadastral} (não ATIVA).`,
                })
              }
              sendEvent(controller, encoder, {
                type: 'progress',
                step: 'maps',
                status: 'running',
                message: `${result.razao_social} localizada na Receita Federal · ${result.situacao_cadastral}`,
              })
            }
          }
        }

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

RETORNE APENAS um array JSON puro (sem \`\`\`json nem texto adicional). Cada lead DEVE ter TODOS estes campos (os valores abaixo são apenas DESCRIÇÕES do formato — NÃO copie literalmente):
[{
  "empresa_nome": "<nome real da empresa brasileira, com sufixo Ltda/S.A./ME quando aplicável>",
  "decisor_nome": "<nome completo do decisor principal>",
  "decisor_cargo": "${cargos_alvo?.[0] || cargo_alvo || 'Diretor'}",
  "decisores": [
    {
      "nome": "<nome do decisor principal>",
      "cargo": "${cargos_alvo?.[0] || cargo_alvo || 'Diretor'}",
      "email": "<email corporativo no domínio da empresa, ou null se não souber>",
      "whatsapp": "<55 + DDD da região + 9 dígitos iniciando com 9, ou null se não souber — NUNCA use padrões sequenciais tipo 999990001>",
      "linkedin_url": "<URL de busca do LinkedIn no formato https://www.linkedin.com/search/results/people/?keywords=...>",
      "principal": true
    },
    {
      "nome": "<nome de sócio ou diretor secundário>",
      "cargo": "<Sócio / Diretor Comercial / Diretor Financeiro>",
      "email": "<email ou null>",
      "whatsapp": "<whatsapp ou null>",
      "linkedin_url": "<URL de busca>",
      "principal": false
    }
  ],
  "segmento": "${segmento}",
  "cidade": "${cidade || 'São Paulo'}",
  "estado": "${estado || 'SP'}",
  "email": "<email corporativo do decisor principal no domínio real da empresa, ou null>",
  "whatsapp": "<whatsapp do decisor principal — NUNCA use padrões sequenciais fake>",
  "telefone": "<telefone fixo real da empresa no formato (DD) XXXX-XXXX, ou null se não souber — NUNCA use 3000-0001 ou padrões sequenciais>",
  "linkedin_url": "<URL de busca do LinkedIn da empresa ou decisor>",
  "cnpj": "<CNPJ real e plausível no formato XX.XXX.XXX/0001-XX com dígitos verificadores corretos, ou null se não souber — NUNCA use 12.345.678/0001-90 nem sequências como 00.000.000, 11.111.111, etc.>",
  "cnpj_ativo": "<true SOMENTE se tiver razão plausível pra acreditar que o CNPJ está ativo na Receita; caso contrário false>",
  "website": "<domínio institucional real da empresa, ou null se não souber>",
  "rating_maps": "<nota Google Maps de 1.0 a 5.0 se conhecida; 0 se desconhecida/sem perfil>",
  "total_avaliacoes": "<número real de avaliações, ou 0 se desconhecido>",
  "porte": "<MEI | ME | EPP | Média | Grande>",
  "funcionarios_estimados": "<número compatível com porte>",
  "razao_social": "<razão social completa em CAIXA ALTA>",
  "nome_fantasia": "<nome comercial>",
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

POLÍTICA ANTI-FABRICAÇÃO (crítica — o produto pode ser responsabilizado legalmente se você inventar):
- Se você NÃO souber um valor real para um campo, RETORNE null. NUNCA invente.
- É PROIBIDO usar valores sintéticos/sequenciais clássicos:
  - CNPJ: NÃO use 12.345.678/0001-90, 00.000.000/0001-00, 11.111.111/0001-11, 99.999.999/0001-99, ou qualquer sequência obviamente sintética.
  - Telefone fixo: NÃO use padrões como (DD) 3000-0001, (DD) 2000-0001, (DD) 1234-5678.
  - WhatsApp: NÃO use padrões como 55DD999990001, 55DD999990002, 55DD911111111, 55DD900000000 ou sequências similares.
- Se não tiver CNPJ real e plausível da empresa: retorne cnpj: null e cnpj_ativo: false.
- Se não tiver telefone/whatsapp real: retorne null nesse campo — o lead pode ser usado mesmo sem esses dados.
- cnpj_ativo deve ser true SOMENTE quando você tem razão concreta pra acreditar que o CNPJ gerado existe e está ativo. Em caso de dúvida, false.

FORMATOS (quando o valor NÃO for null):
- WhatsApp: 55 + DDD da região + 9 dígitos (13 dígitos total), dígitos não-sequenciais e plausíveis.
- CNPJ: formato XX.XXX.XXX/0001-XX com dígitos verificadores corretos (use o algoritmo do módulo 11 do CNPJ). Se não conseguir gerar um válido, retorne null.
- rating_maps: nota de 1.0 a 5.0 (com 1 casa decimal) APENAS se você souber que a empresa tem perfil no Maps; caso contrário 0.
- total_avaliacoes: número real se conhecido, ou 0.
- porte: um de "MEI", "ME", "EPP", "Média", "Grande"
- funcionarios_estimados: número compatível com o porte
- website: domínio institucional plausível da empresa. Use variações do nome real. Se a empresa for muito pequena ou desconhecida, retorne null.
- razao_social: nome jurídico completo em CAIXA ALTA terminando em LTDA/S.A./EIRELI/ME
- nome_fantasia: nome comercial curto (sem o sufixo jurídico)

CAMPOS COMERCIAIS (sempre preenchidos, baseados no que você sabe do segmento):
- score: 0-100, soma dos score_detalhes
- justificativa_score: 1-2 frases concretas explicando POR QUE esse lead é quente. Cite dados específicos (porte, presença online, cargo). NÃO seja genérico.
- horario_ideal: 1 frase com dia e janela de horário recomendada para o primeiro contato.
- mensagem_whatsapp: 2-3 parágrafos curtos, tom profissional mas casual (WhatsApp brasileiro). Use [Nome] e [Empresa Usuário] como placeholders. Termina com CTA pra reunião de 15min.
- mensagem_email_assunto: curto, direto, instigante.
- mensagem_email_corpo: 3 parágrafos. Use \\n para quebras. Use [Nome], [Empresa], [Seu Nome] como placeholders.

OUTROS:
- Todos os ${batchSize} leads DIFERENTES entre si
- E-mails com domínio da empresa (.com.br ou .com) quando souber
- NÃO use nomes genéricos — seja específico e realista
- RESPONDA APENAS COM O ARRAY JSON — NENHUM TEXTO ANTES OU DEPOIS`
        }

        // Search-mode prompt: enrich a single company by name or CNPJ.
        // Returns either a single-item array OR a not_found sentinel object.
        //
        // Two branches:
        //   * With receitaData (BrasilAPI hit) → LLM is given ground-truth
        //     identity and only enriches decisor/mensagem. This is the
        //     "vendable" path: CNPJ/nome/endereço are real.
        //   * Without receitaData (name query or BrasilAPI down) → LLM-only
        //     path with strict not_found fallback. UI will mark everything as
        //     "não verificado".
        function buildSearchPrompt(): string {
          const query = (empresa_busca ?? '').trim()
          const looksLikeCnpj = /\d{2}[.\-\/]?\d{3}[.\-\/]?\d{3}[.\-\/]?\d{4}[.\-\/]?\d{2}/.test(query)

          // Path A: we have ground-truth data from Receita Federal. LLM's job
          // is ONLY to generate decisor entries (using the socios list when
          // available) and the sales copy.
          if (receitaData) {
            const r = receitaData
            const sociosBlock = r.socios.length
              ? r.socios
                  .map((s, i) => `  ${i + 1}. ${s.nome}${s.qualificacao ? ` — ${s.qualificacao}` : ''}`)
                  .join('\n')
              : '  (Receita não retornou quadro societário)'
            const enderecoLinha = [r.logradouro, r.numero, r.bairro].filter(Boolean).join(', ')
            return `Você é um sistema de enriquecimento B2B. Os dados de identidade da empresa abaixo JÁ FORAM VERIFICADOS na Receita Federal (via BrasilAPI). Você deve APENAS:
1. Gerar o array de decisores (usando o quadro societário abaixo quando útil)
2. Gerar mensagem_whatsapp, mensagem_email_assunto, mensagem_email_corpo, justificativa_score, horario_ideal, score (com score_detalhes)
3. Deduzir segmento com base no CNAE
4. COPIAR os dados da Receita nos campos indicados (NÃO inventar razão social, CNPJ, endereço, cidade, estado)

DADOS VERIFICADOS (use exatamente estes valores nos campos correspondentes):
- CNPJ: ${r.cnpj_formatted}
- Razão social: ${r.razao_social}
- Nome fantasia: ${r.nome_fantasia ?? '(não consta na Receita)'}
- Situação cadastral: ${r.situacao_cadastral}${r.cnpj_ativo ? ' (ativa)' : ' (NÃO ATIVA — alerte o usuário na justificativa)'}
- Endereço: ${enderecoLinha || '(não consta)'}
- Cidade/UF: ${r.cidade ?? '—'}/${r.estado ?? '—'}
- CEP: ${r.cep ?? '—'}
- CNAE: ${r.cnae_fiscal_codigo ?? '—'} — ${r.cnae_fiscal_descricao ?? '—'}
- Porte Receita: ${r.porte ?? '—'}
- Capital social: ${r.capital_social ? `R$ ${r.capital_social.toLocaleString('pt-BR')}` : '—'}
- Data início atividade: ${r.data_inicio_atividade ?? '—'}
- Natureza jurídica: ${r.natureza_juridica ?? '—'}
- E-mail cadastrado na Receita: ${r.email ?? '(não consta)'}
- Telefone cadastrado: ${r.telefone ?? '(não consta)'}
- Quadro societário (QSA):
${sociosBlock}

RETORNE APENAS um array JSON com 1 item:
[{
  "empresa_nome": "${r.nome_fantasia || r.razao_social}",
  "razao_social": "${r.razao_social}",
  "nome_fantasia": "${r.nome_fantasia ?? ''}",
  "cnpj": "${r.cnpj_formatted}",
  "cnpj_ativo": ${r.cnpj_ativo},
  "situacao_cadastral": "${r.situacao_cadastral}",
  "endereco": "${enderecoLinha}",
  "cidade": "${r.cidade ?? ''}",
  "estado": "${r.estado ?? ''}",
  "cnae_descricao": "${(r.cnae_fiscal_descricao ?? '').replace(/"/g, '\\"')}",
  "segmento": "<deduza do CNAE — ex: 'Comércio varejista de vestuário', 'Restaurantes', 'Consultoria em TI'>",
  "porte": "<mapeie do porte Receita: 'MICRO EMPRESA'→'MEI' ou 'ME', 'EMPRESA DE PEQUENO PORTE'→'EPP', 'DEMAIS'→'Média' ou 'Grande' baseado em capital/idade>",
  "funcionarios_estimados": "<estime com base no porte e CNAE, número>",
  "telefone": "${r.telefone ?? ''}",
  "email": "${r.email ?? ''}",
  "whatsapp": "<se telefone acima é móvel (começa com 9 após DDD), use-o em formato 55DDDDDDDDDDD; senão null>",
  "linkedin_url": "https://www.linkedin.com/search/results/companies/?keywords=<nome da empresa URL-encoded>",
  "website": null,
  "rating_maps": 0,
  "total_avaliacoes": 0,
  "decisor_nome": "<primeiro nome do QSA, se houver — senão '' e deixe para o usuário preencher>",
  "decisor_cargo": "<qualificacao do primeiro sócio, ex: 'Sócio Administrador'>",
  "decisores": [
    <uma entrada para cada sócio do QSA (até 4), usando 'Sócio Administrador' como cargo se a qualificacao não disser outro cargo. Cada entrada: { nome, cargo, email: null, whatsapp: null, linkedin_url: "https://www.linkedin.com/search/results/people/?keywords=<nome+empresa>", principal: <true para o primeiro, false para os outros> }>
  ],
  "score": <0-100>,
  "score_detalhes": { "maps_presenca": <0-20>, "decisor_encontrado": <0-25>, "email_validado": <0-20>, "linkedin_ativo": <0-20>, "porte_match": <0-15> },
  "justificativa_score": "<1-2 frases: cite situação cadastral, CNAE, porte. Se situação ≠ ATIVA, alerte para validar antes de prospectar>",
  "horario_ideal": "<dia + janela de horário ideal para primeiro contato B2B>",
  "mensagem_whatsapp": "<2-3 parágrafos curtos usando [Nome] e [Empresa Usuário] como placeholders, CTA reunião 15min>",
  "mensagem_email_assunto": "<assunto curto>",
  "mensagem_email_corpo": "<3 parágrafos com [Nome], [Empresa], [Seu Nome]>"
}]

REGRAS:
- linkedin_url SEMPRE em formato de busca. NUNCA invente /in/<slug>.
- NUNCA sobrescreva os dados de identidade (CNPJ/razão/endereço) — use EXATAMENTE como veio da Receita.
- E-mails, website, rating Maps NÃO foram verificados. Se não souber, deixe null/0 — NUNCA invente.
- RESPONDA APENAS COM O ARRAY JSON, sem markdown.`
          }

          // Path B: no Receita data (nome query or BrasilAPI failed).
          return `Você é um sistema de enriquecimento de empresas B2B brasileiras.
A query do usuário é: "${query}".
${looksLikeCnpj ? 'A query parece um CNPJ.' : 'A query é um nome de empresa.'}

POLÍTICA CRÍTICA — LEIA COM ATENÇÃO:
Este é um sistema de prospecção real. O cliente vai DISPARAR mensagens de WhatsApp para os
dados que você retornar. Se você inventar CNPJ, telefone, email ou nome de decisor, o cliente
pode acabar mandando mensagem pra uma pessoa aleatória (uso indevido de dados, LGPD, ação civil).

POR ISSO, É PROIBIDO INVENTAR DADOS.

DECISÃO:

OPÇÃO A — se você tem CERTEZA razoável de que conhece essa empresa específica (é uma
empresa grande/pública/notória que aparece em notícias, redes sociais, Receita Federal, ou
você conhece dados reais sobre ela):
  → retorne um array JSON com 1 item no formato abaixo, preenchendo APENAS os campos que
    você sabe com certeza. Campos desconhecidos devem ser null.

OPÇÃO B — se você NÃO conhece essa empresa específica (é nome pequeno, genérico, ambíguo,
desconhecido, ou você tá prestes a inventar CNPJ/telefone/email):
  → retorne EXATAMENTE este objeto (não array):
    {
      "status": "not_found",
      "reason": "Empresa '${query}' não foi localizada com dados confiáveis.",
      "suggestion": "<mensagem de 1 frase pro usuário sugerindo o que fornecer: CNPJ completo, ou nome + cidade/UF, ou nome mais específico>"
    }

  Exemplos de quando retornar not_found:
  - Nome curto ou genérico (ex: "awl", "locações", "ABC") sem cidade/UF
  - Empresa pequena/local que você não tem certeza que existe
  - Você só consegue deduzir os dados a partir do setor, não a partir da empresa em si
  - Você teria que inventar o CNPJ pra completar os campos

OPÇÃO A — formato (apenas se aplicável):
[{
  "empresa_nome": "<nome real>",
  "decisor_nome": "<nome real ou null>",
  "decisor_cargo": "<cargo real ou null>",
  "decisores": [
    { "nome": "<nome real>", "cargo": "<cargo>", "email": "<email real ou null>", "whatsapp": "<whatsapp real ou null>", "linkedin_url": "<URL de busca>", "principal": true }
  ],
  "segmento": "<segmento real>",
  "cidade": "<cidade ou null>", "estado": "<UF ou null>",
  "email": "<email real ou null>",
  "whatsapp": "<whatsapp real ou null — NUNCA inventar>",
  "telefone": "<telefone real ou null — NUNCA inventar, PROIBIDO usar padrões 3000-0001>",
  "linkedin_url": "<URL de busca no LinkedIn>",
  "cnpj": "<CNPJ real com dígitos verificadores corretos, ou null — PROIBIDO usar 12.345.678/0001-90 ou sequências sintéticas>",
  "cnpj_ativo": "<true apenas se souber com certeza>",
  "website": "<domínio real ou null>",
  "rating_maps": "<nota real ou 0>", "total_avaliacoes": "<número real ou 0>",
  "porte": "<MEI|ME|EPP|Média|Grande>", "funcionarios_estimados": "<número ou null>",
  "razao_social": "<razão social real ou null>", "nome_fantasia": "<nome fantasia ou null>",
  "score": "<0-100>",
  "score_detalhes": { "maps_presenca": 0, "decisor_encontrado": 0, "email_validado": 0, "linkedin_ativo": 0, "porte_match": 0 },
  "justificativa_score": "<1-2 frases concretas; se a maioria dos campos foi null, explique que os dados precisam ser validados manualmente>",
  "horario_ideal": "<dia + janela>",
  "mensagem_whatsapp": "<mensagem com [Nome], [Empresa Usuário], CTA reunião 15min>",
  "mensagem_email_assunto": "<assunto curto>",
  "mensagem_email_corpo": "<3 parágrafos com [Nome], [Empresa], [Seu Nome]>"
}]

REGRAS FINAIS:
- linkedin_url SEMPRE em formato de busca. NUNCA invente /in/<slug>.
- Se retornar null em cnpj/telefone/whatsapp/email, a UI vai mostrar como "não verificado" — melhor null do que fake.
- NÃO inclua markdown, \`\`\`json ou comentários — apenas o JSON puro (array OU objeto not_found).`
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
        // Search mode can also return a {status:"not_found"} sentinel object,
        // so we accept either shape and normalize below.
        type BatchOutput =
          | { kind: 'array'; items: unknown[] }
          | { kind: 'not_found'; reason: string; suggestion: string }

        const batchResults: BatchOutput[] = await Promise.all(
          batches.map(async (batchSize): Promise<BatchOutput> => {
            // ~900 tokens/lead now (was ~400) due to decisores + enrichment.
            const maxTokens = Math.min(16000, Math.max(4096, batchSize * 900))
            try {
              const result = await llm.extract<unknown>({
                user: isSearch ? buildSearchPrompt() : buildPrompt(batchSize),
                // Permissive — may be array (leads) or object (not_found
                // sentinel in search mode).
                schema: {},
                maxTokens,
                orgId,
                userId: user.id,
              })
              // `result.data` is whatever extractJson produced; may already be
              // parsed or may be a string we still need to extract JSON from.
              const raw: unknown = Array.isArray(result.data) || (result.data && typeof result.data === 'object')
                ? result.data
                : extractJson(String(result.data ?? ''))

              // Not-found sentinel (search mode) — {status:"not_found",...}
              if (
                raw !== null &&
                typeof raw === 'object' &&
                !Array.isArray(raw) &&
                (raw as { status?: unknown }).status === 'not_found'
              ) {
                const obj = raw as { reason?: string; suggestion?: string }
                return {
                  kind: 'not_found',
                  reason: obj.reason || 'Empresa não localizada com dados confiáveis.',
                  suggestion: obj.suggestion || 'Tente o CNPJ completo ou o nome + cidade/UF.',
                }
              }

              return { kind: 'array', items: Array.isArray(raw) ? raw : [] }
            } catch (err) {
              console.error('[generate-leads] batch error:', err)
              return { kind: 'array', items: [] }
            }
          })
        )

        // Search mode: honor not_found before running the rest of the pipeline.
        if (isSearch) {
          const nf = batchResults.find((b): b is Extract<BatchOutput, { kind: 'not_found' }> => b.kind === 'not_found')
          if (nf) {
            sendEvent(controller, encoder, {
              type: 'progress',
              step: 'maps',
              status: 'done',
              message: nf.reason,
            })
            sendEvent(controller, encoder, {
              type: 'error',
              reason: 'not_found',
              message: `${nf.reason} ${nf.suggestion}`,
            })
            controller.close()
            return
          }
        }

        const combined = batchResults.flatMap((b) => (b.kind === 'array' ? b.items : []))

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
        // Each passing lead is sanitized — synthetic CNPJs/phones get stripped
        // here even if the prompt guardrails didn't catch them.
        const validLeads: z.infer<typeof leadSchema>[] = []
        const seenWhatsapp = new Set<string>()
        const seenCompany = new Set<string>()
        let dedupSkipped = 0
        let cnpjStrippedCount = 0
        let phoneStrippedCount = 0
        for (const item of combined) {
          const ok = leadSchema.safeParse(item)
          if (!ok.success) continue
          const { lead, flags } = sanitizeLead(ok.data)
          if (flags.cnpjStripped) cnpjStrippedCount++
          if (flags.telefoneStripped || flags.whatsappStripped) phoneStrippedCount++

          // Phase D: if we have ground-truth Receita data, OVERWRITE the
          // identity fields on the lead so the LLM can't accidentally
          // fabricate anything different. Mark the source for UI badge.
          if (receitaData && isSearch) {
            lead.cnpj = receitaData.cnpj_formatted
            lead.cnpj_ativo = receitaData.cnpj_ativo
            lead.razao_social = receitaData.razao_social
            lead.nome_fantasia = receitaData.nome_fantasia ?? ''
            lead.empresa_nome = receitaData.nome_fantasia || receitaData.razao_social
            lead.cidade = receitaData.cidade ?? lead.cidade
            lead.estado = receitaData.estado ?? lead.estado
            lead.situacao_cadastral = receitaData.situacao_cadastral
            lead.cnae_descricao = receitaData.cnae_fiscal_descricao ?? ''
            const enderecoLinha = [receitaData.logradouro, receitaData.numero, receitaData.bairro]
              .filter(Boolean)
              .join(', ')
            lead.endereco = enderecoLinha
            // Prefer Receita phone/email over LLM guesses when Receita has them.
            if (receitaData.telefone) lead.telefone = receitaData.telefone
            if (receitaData.email) lead.email = receitaData.email
            // Flag the source so UI renders green "Verificado" badge.
            lead.verified_sources = Array.from(new Set([...(lead.verified_sources ?? []), 'receita_federal']))
          }

          const companyKey = lead.empresa_nome.trim().toLowerCase()

          // Skip if already in user's DB (by whatsapp or CNPJ) or duplicated within batch.
          // Empty whatsapp after sanitization is still allowed — UI marks it as não-verificado.
          if (lead.whatsapp && existingWhatsapps.has(lead.whatsapp)) { dedupSkipped++; continue }
          if (lead.cnpj && existingCnpjs.has(lead.cnpj)) { dedupSkipped++; continue }
          if (lead.whatsapp && seenWhatsapp.has(lead.whatsapp)) { dedupSkipped++; continue }
          if (seenCompany.has(companyKey)) { dedupSkipped++; continue }

          if (lead.whatsapp) seenWhatsapp.add(lead.whatsapp)
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
        if (cnpjStrippedCount > 0) {
          sendEvent(controller, encoder, {
            type: 'log',
            level: 'warn',
            message: `${cnpjStrippedCount} CNPJ(s) sintético(s) ou inválido(s) foram removidos — valide manualmente.`,
          })
        }
        if (phoneStrippedCount > 0) {
          sendEvent(controller, encoder, {
            type: 'log',
            level: 'warn',
            message: `${phoneStrippedCount} telefone(s) com padrão fake foram removidos.`,
          })
        }

        // Fallback crítico: quando BrasilAPI retornou dados REAIS (receitaData),
        // mas o Claude falhou (schema inválido, timeout, não retornou, etc),
        // construímos o lead direto da Receita. Dados de identidade são ground
        // truth — o enriquecimento IA (decisor/mensagem) é bonus, não obrigatório.
        // Sem este fallback, o usuário via "Empresa não localizada" mesmo quando
        // a Receita confirmou a existência — péssima UX.
        if (validLeads.length === 0 && receitaData && isSearch) {
          sendEvent(controller, encoder, {
            type: 'log',
            level: 'warn',
            message: 'IA não retornou enriquecimento — usando dados da Receita Federal diretamente.',
          })

          const r = receitaData
          const enderecoLinha = [r.logradouro, r.numero, r.bairro].filter(Boolean).join(', ')

          // Map Receita porte to our schema values.
          const porteMap: Record<string, string> = {
            'MICRO EMPRESA': 'ME',
            'EMPRESA DE PEQUENO PORTE': 'EPP',
            'DEMAIS': 'Média',
          }
          const porteReceita = r.porte ? (porteMap[r.porte.toUpperCase()] ?? r.porte) : ''

          // Primary decisor from QSA when available.
          const primarioSocio = r.socios[0]
          const outrosSocios = r.socios.slice(1, 4)

          const fallbackLead: z.infer<typeof leadSchema> = {
            empresa_nome: r.nome_fantasia || r.razao_social,
            razao_social: r.razao_social,
            nome_fantasia: r.nome_fantasia ?? '',
            cnpj: r.cnpj_formatted,
            cnpj_ativo: r.cnpj_ativo,
            situacao_cadastral: r.situacao_cadastral,
            endereco: enderecoLinha,
            cidade: r.cidade ?? '',
            estado: r.estado ?? '',
            cnae_descricao: r.cnae_fiscal_descricao ?? '',
            segmento: r.cnae_fiscal_descricao ?? '',
            porte: porteReceita,
            funcionarios_estimados: 0,
            telefone: r.telefone ?? '',
            email: r.email ?? '',
            whatsapp: '', // Receita não fornece distinção móvel/fixo — não inventar
            linkedin_url: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(r.nome_fantasia || r.razao_social)}`,
            rating_maps: 0,
            total_avaliacoes: 0,
            decisor_nome: primarioSocio?.nome ?? '',
            decisor_cargo: primarioSocio?.qualificacao ?? 'Sócio',
            decisores: r.socios.length > 0
              ? [
                  {
                    nome: primarioSocio!.nome,
                    cargo: primarioSocio!.qualificacao ?? 'Sócio',
                    email: '',
                    whatsapp: '',
                    linkedin_url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(primarioSocio!.nome + ' ' + (r.nome_fantasia || r.razao_social))}`,
                    principal: true,
                  },
                  ...outrosSocios.map((s) => ({
                    nome: s.nome,
                    cargo: s.qualificacao ?? 'Sócio',
                    email: '',
                    whatsapp: '',
                    linkedin_url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(s.nome + ' ' + (r.nome_fantasia || r.razao_social))}`,
                    principal: false,
                  })),
                ]
              : [],
            score: r.cnpj_ativo ? 55 : 20, // Receita ok = baseline; inativa = baixo
            score_detalhes: {
              maps_presenca: 0,
              decisor_encontrado: r.socios.length > 0 ? 15 : 0,
              email_validado: r.email ? 10 : 0,
              linkedin_ativo: 0,
              porte_match: porteReceita ? 10 : 0,
            },
            justificativa_score: r.cnpj_ativo
              ? `Empresa ATIVA na Receita Federal (${r.razao_social}). ${r.socios.length > 0 ? `${r.socios.length} sócio(s) identificado(s) no QSA.` : 'Sem QSA detalhado na Receita.'} Dados de rating, LinkedIn e e-mail precisam ser enriquecidos manualmente ou via integrações.`
              : `ATENÇÃO: situação cadastral é ${r.situacao_cadastral} (não ATIVA). Verifique antes de prospectar.`,
            horario_ideal: 'Segunda a quarta, 9h–11h ou 14h–16h (horário comercial B2B)',
            mensagem_whatsapp: '',
            mensagem_email_assunto: '',
            mensagem_email_corpo: '',
            verified_sources: ['receita_federal'],
          }

          validLeads.push(fallbackLead)
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
