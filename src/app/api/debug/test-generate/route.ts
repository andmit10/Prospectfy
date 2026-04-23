import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentOrgId } from '@/lib/org-context'
import { llm } from '@/lib/llm'
import { extractJson } from '@/lib/llm/validator'
import { childLogger } from '@/lib/logger'

const log = childLogger('api:debug:test-generate')

// Required field names on a lead — mirrors leadSchema in /api/generate-leads/route.ts
const REQUIRED_FIELDS = [
  'empresa_nome',
  'decisor_nome',
  'whatsapp',
] as const

const OPTIONAL_FIELDS = [
  'decisor_cargo', 'segmento', 'cidade', 'estado', 'email', 'telefone',
  'linkedin_url', 'cnpj', 'cnpj_ativo', 'rating_maps', 'total_avaliacoes',
  'porte', 'funcionarios_estimados', 'score', 'score_detalhes',
  'decisores', 'mensagem_whatsapp', 'mensagem_email_assunto',
  'mensagem_email_corpo', 'justificativa_score', 'horario_ideal',
  'verified_sources', 'razao_social', 'nome_fantasia', 'endereco',
  'cnae_descricao', 'situacao_cadastral',
] as const

/**
 * Diagnóstico end-to-end do pipeline de geração de leads.
 *
 * Executa o MESMO flow do endpoint de produção mas em modo inspection:
 *   1. Build prompt discover
 *   2. Chama LLM
 *   3. Extrai JSON
 *   4. Roda check de campos obrigatórios lead por lead
 *   5. Retorna relatório JSON com cada passo
 *
 * Não incrementa trial, não grava no banco. Só super_admin acessa.
 *
 * Uso:
 *   GET /api/debug/test-generate               → 2 leads academias SP
 *   GET /api/debug/test-generate?q=3&seg=clinicas+odontologicas&cidade=Belo+Horizonte&uf=MG
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: adminCheck } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .limit(1)
    .maybeSingle()
  if (!adminCheck) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 })
  }

  const orgId = await resolveCurrentOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'Sem organização ativa' }, { status: 400 })

  const url = new URL(request.url)
  const quantidade = Math.max(1, Math.min(5, Number(url.searchParams.get('q') || '2')))
  const segmento = url.searchParams.get('seg') || 'academias de crossfit'
  const cidade = url.searchParams.get('cidade') || 'São Paulo'
  const estado = url.searchParams.get('uf') || 'SP'

  const report: {
    input: { quantidade: number; segmento: string; cidade: string; estado: string }
    prompt_length: number
    llm: {
      ok: boolean
      latency_ms?: number
      data_type?: string
      raw_preview?: string
      error?: string
    }
    parse: {
      count: number
      first_item_keys: string[]
      first_item_preview: string
    }
    validation: {
      total: number
      passed: number
      issues: Array<{ idx: number; missing: string[]; extra_keys: string[]; raw_item_preview: string }>
    }
    sample_first_item: unknown
  } = {
    input: { quantidade, segmento, cidade, estado },
    prompt_length: 0,
    llm: { ok: false },
    parse: { count: 0, first_item_keys: [], first_item_preview: '' },
    validation: { total: 0, passed: 0, issues: [] },
    sample_first_item: null,
  }

  const prompt = buildPrompt({ quantidade, segmento, cidade, estado })
  report.prompt_length = prompt.length

  try {
    const t0 = Date.now()
    const result = await llm.extract<unknown>({
      user: prompt,
      schema: {},
      maxTokens: Math.min(16000, quantidade * 900),
      orgId,
      userId: user.id,
    })
    const latency = Date.now() - t0

    report.llm = {
      ok: true,
      latency_ms: latency,
      data_type: Array.isArray(result.data) ? 'array' : typeof result.data,
      raw_preview: JSON.stringify(result.data).slice(0, 800),
    }

    const parsed: unknown[] = Array.isArray(result.data)
      ? (result.data as unknown[])
      : (() => {
          const pj = extractJson(String(result.data ?? ''))
          return Array.isArray(pj) ? pj : []
        })()

    report.parse = {
      count: parsed.length,
      first_item_keys: parsed[0] && typeof parsed[0] === 'object'
        ? Object.keys(parsed[0] as object)
        : [],
      first_item_preview: JSON.stringify(parsed[0] ?? null, null, 2).slice(0, 1500),
    }

    report.sample_first_item = parsed[0] ?? null

    // Field-by-field validation
    report.validation.total = parsed.length
    parsed.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        report.validation.issues.push({
          idx,
          missing: [...REQUIRED_FIELDS],
          extra_keys: [],
          raw_item_preview: JSON.stringify(item).slice(0, 300),
        })
        return
      }
      const obj = item as Record<string, unknown>
      const keys = Object.keys(obj)
      const missing = REQUIRED_FIELDS.filter((f) => {
        const v = obj[f]
        return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
      })
      const expectedSet = new Set<string>([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS])
      const extra = keys.filter((k) => !expectedSet.has(k))

      if (missing.length === 0) {
        report.validation.passed++
      } else {
        report.validation.issues.push({
          idx,
          missing: [...missing],
          extra_keys: extra.slice(0, 5),
          raw_item_preview: JSON.stringify(obj).slice(0, 400),
        })
      }
    })

    return NextResponse.json(report, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    report.llm = { ok: false, error: message.slice(0, 500) }
    log.error('test-generate failed', { err: message })
    return NextResponse.json(report, { status: 500 })
  }
}

function buildPrompt(opts: { quantidade: number; segmento: string; cidade: string; estado: string }): string {
  const { quantidade, segmento, cidade, estado } = opts
  return `Você é um sistema avançado de geração de leads B2B brasileiro.
Gere EXATAMENTE ${quantidade} leads empresariais detalhados para prospecção.

PARÂMETROS:
- Segmento: ${segmento}
- Região: ${cidade}, ${estado}
- Cargo alvo do decisor: CEO, Diretor, Gerente ou Sócio

RETORNE APENAS um array JSON puro (sem \`\`\`json nem texto adicional). Cada item deve ter:
{
  "empresa_nome": "<nome real da empresa brasileira>",
  "decisor_nome": "<nome completo do decisor>",
  "decisor_cargo": "Diretor Comercial",
  "decisores": [{
    "nome": "<nome>",
    "cargo": "Diretor Comercial",
    "email": null,
    "whatsapp": null,
    "linkedin_url": "https://www.linkedin.com/search/results/people/?keywords=Nome+Empresa",
    "principal": true
  }],
  "segmento": "${segmento}",
  "cidade": "${cidade}",
  "estado": "${estado}",
  "email": null,
  "whatsapp": "<55+DDD+9 dígitos reais, NUNCA padrões sequenciais>",
  "telefone": null,
  "linkedin_url": "<URL de busca>",
  "cnpj": null,
  "cnpj_ativo": false,
  "rating_maps": 0,
  "total_avaliacoes": 0,
  "porte": "ME",
  "funcionarios_estimados": 10,
  "razao_social": "<razão social>",
  "nome_fantasia": "<fantasia>",
  "score": 50,
  "score_detalhes": {"maps_presenca":0,"decisor_encontrado":0,"email_validado":0,"linkedin_ativo":0,"porte_match":0},
  "justificativa_score": "1-2 frases explicando o score",
  "horario_ideal": "Segunda a quarta, 9h-11h",
  "mensagem_whatsapp": "Olá [Nome]! ...",
  "mensagem_email_assunto": "Assunto curto",
  "mensagem_email_corpo": "Olá [Nome],..."
}

REGRAS CRÍTICAS:
- Campos desconhecidos → null, NUNCA inventar
- NUNCA usar CNPJ 12.345.678/0001-90 ou sequências sintéticas
- NUNCA usar telefone 3000-0001 ou 999990001
- RESPONDA APENAS COM O ARRAY JSON, nada mais.`
}
