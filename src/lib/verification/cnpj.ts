// Real-data CNPJ verification via BrasilAPI.
//
// BrasilAPI (https://brasilapi.com.br/docs#tag/CNPJ) proxies the Receita
// Federal "minha-receita" endpoint and returns the canonical data we need
// (razão social, endereço, situação cadastral, CNAE). Free, no API key.
//
// The alternative, ReceitaWS (receitaws.com.br), has an aggressive free-tier
// rate limit (3 req/min) that breaks under normal use. BrasilAPI is the
// practical choice.

import { childLogger } from '@/lib/logger'

const log = childLogger('verification:cnpj')

export type CnpjVerified = {
  verified: true
  source: 'brasilapi_receita'
  cnpj: string // digits only, 14 chars
  cnpj_formatted: string // XX.XXX.XXX/0001-XX
  razao_social: string
  nome_fantasia: string | null
  situacao_cadastral: string // "ATIVA" | "BAIXADA" | "SUSPENSA" | "INAPTA" | "NULA"
  cnpj_ativo: boolean // situacao_cadastral === 'ATIVA'
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null // municipio
  estado: string | null // uf
  cep: string | null
  email: string | null // email on file at Receita (rarely set, but useful when it is)
  telefone: string | null // phone on file at Receita
  telefone_mobile: boolean // true when telefone looks like a cell number (9 after DDD)
  cnae_fiscal_codigo: string | null
  cnae_fiscal_descricao: string | null
  porte: string | null // "MICRO EMPRESA" | "EMPRESA DE PEQUENO PORTE" | "DEMAIS"
  capital_social: number | null
  data_inicio_atividade: string | null
  natureza_juridica: string | null
  /** True when natureza_juridica indicates a solo entity (no QSA expected). */
  is_solo_entity: boolean
  socios: Array<{ nome: string; qualificacao: string | null }>
  fetched_at: string // ISO timestamp
}

/** Detect sole-proprietor entities where Receita doesn't expose the titular
 *  (Empresário Individual, MEI, Empresa Individual de Responsabilidade Limitada).
 *  For these, the QSA is always empty — it's a feature, not a bug. */
export function isSoloEntity(naturezaJuridica: string | null): boolean {
  if (!naturezaJuridica) return false
  const nj = naturezaJuridica.toLowerCase()
  return (
    nj.includes('empresário (individual)') ||
    nj.includes('empresario (individual)') ||
    nj.includes('empresário individual') ||
    nj.includes('mei') ||
    nj.includes('microempreendedor') ||
    nj.includes('eireli')
  )
}

/** Heuristic: phone is mobile if the 9 digits after DDD start with 9
 *  (modern Brazilian cellphone format). */
function isMobilePhone(phone: string | null): boolean {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return false
  // DDD + 9 + 8 digits = 11 total (mobile)
  if (digits.length === 11 && digits[2] === '9') return true
  return false
}

export type CnpjVerificationResult =
  | CnpjVerified
  | { verified: false; reason: 'invalid_format'; cnpj_input: string }
  | { verified: false; reason: 'not_found'; cnpj_input: string }
  | { verified: false; reason: 'rate_limited'; cnpj_input: string; retry_after_sec?: number }
  | { verified: false; reason: 'network_error'; cnpj_input: string; message: string }

/**
 * Strip non-digits and validate CNPJ check digits (module-11 algorithm).
 * Returns the 14-digit clean string when valid, or null otherwise.
 */
export function normalizeCnpj(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 14) return null
  if (/^(\d)\1+$/.test(digits)) return null

  const calc = (slice: string, weights: number[]): number => {
    const sum = slice.split('').reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const dv1 = calc(digits.slice(0, 12), w1)
  const dv2 = calc(digits.slice(0, 12) + String(dv1), w2)
  if (Number(digits[12]) !== dv1 || Number(digits[13]) !== dv2) return null

  return digits
}

export function formatCnpj(digits: string): string {
  if (digits.length !== 14) return digits
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
}

/**
 * Verify a CNPJ against Receita Federal.
 *
 * Strategy:
 *   1. Try BrasilAPI (fast, Vercel-edge cached) with 8s timeout
 *   2. If BrasilAPI 4xx/5xx/timeout (not 404), fall back to ReceitaWS
 *   3. ReceitaWS free tier is 3 req/min/IP — use only as backup
 *
 * BrasilAPI is known to occasionally rate-limit shared IPs (Vercel iad1).
 * The sequential fallback keeps the feature reliable for end users without
 * needing a paid API key.
 */
export async function verifyCnpj(
  input: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<CnpjVerificationResult> {
  const { timeoutMs = 8000, signal } = options

  const normalized = normalizeCnpj(input)
  if (!normalized) {
    return { verified: false, reason: 'invalid_format', cnpj_input: input }
  }

  // ── Attempt 1: BrasilAPI ────────────────────────────────────────────────
  const brasilApiResult = await tryBrasilApi(normalized, { timeoutMs, signal })

  if (brasilApiResult.kind === 'not_found') {
    return { verified: false, reason: 'not_found', cnpj_input: input }
  }

  if (brasilApiResult.kind === 'ok') {
    // BrasilAPI worked. Check if it returned sparse data — if email/telefone
    // are empty, ReceitaWS often has them (different cache vintage at Receita).
    // Enrich on-demand instead of always double-calling (saves ReceitaWS
    // rate-limit budget).
    const sparse =
      !brasilApiResult.data.email &&
      !brasilApiResult.data.telefone &&
      brasilApiResult.data.socios.length === 0

    if (sparse) {
      log.warn('cnpj brasilapi sparse, enriching with receitaws', { cnpj: normalized })
      const enrichResult = await tryReceitaWs(normalized, { timeoutMs, signal })
      if (enrichResult.kind === 'ok') {
        return mergeEnrichment(brasilApiResult.data, enrichResult.data)
      }
      // Enrichment failed — that's ok, return BrasilAPI data alone.
    }

    return brasilApiResult.data
  }

  // BrasilAPI errored (not 404) — try ReceitaWS as full fallback.
  log.warn('cnpj brasilapi failed, trying receitaws', {
    cnpj: normalized,
    reason: brasilApiResult.reason,
  })

  const receitaWsResult = await tryReceitaWs(normalized, { timeoutMs, signal })
  if (receitaWsResult.kind === 'ok') return receitaWsResult.data
  if (receitaWsResult.kind === 'not_found') {
    return { verified: false, reason: 'not_found', cnpj_input: input }
  }

  log.warn('cnpj both apis failed', {
    cnpj: normalized,
    brasilapi: brasilApiResult.reason,
    receitaws: receitaWsResult.reason,
  })

  return {
    verified: false,
    reason: brasilApiResult.reason === 'rate_limited' ? 'rate_limited' : 'network_error',
    cnpj_input: input,
    message: `BrasilAPI ${brasilApiResult.detail ?? '?'} + ReceitaWS ${receitaWsResult.detail ?? '?'}`,
  }
}

/**
 * Fill in empty fields on BrasilAPI result using ReceitaWS data.
 * BrasilAPI is the primary source (identity fields always come from it).
 * ReceitaWS complements with contact info (email/telefone) and QSA when
 * BrasilAPI's cache lags behind.
 */
function mergeEnrichment(primary: CnpjVerified, enrichment: CnpjVerified): CnpjVerified {
  const merged: CnpjVerified = { ...primary }

  // Contact info — prefer primary, fall back to enrichment.
  if (!merged.email && enrichment.email) merged.email = enrichment.email
  if (!merged.telefone && enrichment.telefone) {
    merged.telefone = enrichment.telefone
    merged.telefone_mobile = enrichment.telefone_mobile
  }

  // Address details — fill gaps.
  if (!merged.logradouro && enrichment.logradouro) merged.logradouro = enrichment.logradouro
  if (!merged.numero && enrichment.numero) merged.numero = enrichment.numero
  if (!merged.complemento && enrichment.complemento) merged.complemento = enrichment.complemento
  if (!merged.bairro && enrichment.bairro) merged.bairro = enrichment.bairro
  if (!merged.cep && enrichment.cep) merged.cep = enrichment.cep

  // QSA — BrasilAPI's empty array + ReceitaWS has socios means we trust enrichment.
  if (merged.socios.length === 0 && enrichment.socios.length > 0) {
    merged.socios = enrichment.socios
  }

  // Capital social + abertura — fill if primary missing.
  if (merged.capital_social === null && enrichment.capital_social !== null) {
    merged.capital_social = enrichment.capital_social
  }
  if (!merged.data_inicio_atividade && enrichment.data_inicio_atividade) {
    merged.data_inicio_atividade = enrichment.data_inicio_atividade
  }

  return merged
}

// ─── BrasilAPI engine ──────────────────────────────────────────────────────
type EngineResult =
  | { kind: 'ok'; data: CnpjVerified }
  | { kind: 'not_found' }
  | { kind: 'rate_limited'; detail: string; reason: 'rate_limited' }
  | { kind: 'error'; detail: string; reason: 'network_error' | 'rate_limited' }

async function tryBrasilApi(
  normalized: string,
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<EngineResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), opts.timeoutMs)
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort('already_aborted')
    else opts.signal.addEventListener('abort', () => ctrl.abort('caller_aborted'), { once: true })
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${normalized}`, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        // Ativafy user-agent helps with rate-limit allowlisting if we ever contact them.
        'user-agent': 'Ativafy/1.0 (+https://ativafy.com.br)',
      },
    })

    if (res.status === 404) return { kind: 'not_found' }
    if (res.status === 429) return { kind: 'rate_limited', detail: '429', reason: 'rate_limited' }
    if (!res.ok) {
      return { kind: 'error', detail: String(res.status), reason: 'network_error' }
    }

    const data = (await res.json()) as BrasilApiCnpjResponse
    const situacao = (data.descricao_situacao_cadastral ?? '').toUpperCase()
    const socios: Array<{ nome: string; qualificacao: string | null }> = Array.isArray(data.qsa)
      ? data.qsa.slice(0, 6).map((s) => ({
          nome: String(s.nome_socio ?? '').trim(),
          qualificacao: s.qualificacao_socio ? String(s.qualificacao_socio) : null,
        }))
      : []

    const naturezaJuridica = data.natureza_juridica ? String(data.natureza_juridica) : null
    const telefone = composeTelefone(data.ddd_telefone_1, data.ddd_telefone_2)
    return {
      kind: 'ok',
      data: {
        verified: true,
        source: 'brasilapi_receita',
        cnpj: normalized,
        cnpj_formatted: formatCnpj(normalized),
        razao_social: String(data.razao_social ?? '').trim(),
        nome_fantasia: data.nome_fantasia ? String(data.nome_fantasia).trim() : null,
        situacao_cadastral: situacao,
        cnpj_ativo: situacao === 'ATIVA',
        logradouro: data.logradouro ? String(data.logradouro) : null,
        numero: data.numero ? String(data.numero) : null,
        complemento: data.complemento ? String(data.complemento) : null,
        bairro: data.bairro ? String(data.bairro) : null,
        cidade: data.municipio ? String(data.municipio) : null,
        estado: data.uf ? String(data.uf) : null,
        cep: data.cep ? String(data.cep) : null,
        email: data.email ? String(data.email).toLowerCase() : null,
        telefone,
        telefone_mobile: isMobilePhone(telefone),
        cnae_fiscal_codigo: data.cnae_fiscal ? String(data.cnae_fiscal) : null,
        cnae_fiscal_descricao: data.cnae_fiscal_descricao ? String(data.cnae_fiscal_descricao) : null,
        porte: data.porte ? String(data.porte) : null,
        capital_social: typeof data.capital_social === 'number' ? data.capital_social : null,
        data_inicio_atividade: data.data_inicio_atividade ? String(data.data_inicio_atividade) : null,
        natureza_juridica: naturezaJuridica,
        is_solo_entity: isSoloEntity(naturezaJuridica),
        socios,
        fetched_at: new Date().toISOString(),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = message.includes('abort') || message.includes('timeout')
    return { kind: 'error', detail: isTimeout ? 'timeout' : message.slice(0, 40), reason: 'network_error' }
  } finally {
    clearTimeout(timer)
  }
}

// ─── ReceitaWS engine ──────────────────────────────────────────────────────
type ReceitaWsResponse = {
  status?: string
  message?: string
  cnpj?: string
  nome?: string
  fantasia?: string
  situacao?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
  email?: string
  telefone?: string
  atividade_principal?: Array<{ code?: string; text?: string }>
  porte?: string
  capital_social?: string | number
  abertura?: string
  natureza_juridica?: string
  qsa?: Array<{ nome?: string; qual?: string }>
}

async function tryReceitaWs(
  normalized: string,
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<EngineResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), opts.timeoutMs)
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort('already_aborted')
    else opts.signal.addEventListener('abort', () => ctrl.abort('caller_aborted'), { once: true })
  }

  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${normalized}`, {
      signal: ctrl.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'Ativafy/1.0 (+https://ativafy.com.br)',
      },
    })

    if (res.status === 404) return { kind: 'not_found' }
    if (res.status === 429) return { kind: 'rate_limited', detail: '429', reason: 'rate_limited' }
    if (!res.ok) {
      return { kind: 'error', detail: String(res.status), reason: 'network_error' }
    }

    const data = (await res.json()) as ReceitaWsResponse

    // ReceitaWS uses a status field — "ERROR" means CNPJ didn't exist or limit hit.
    if (data.status === 'ERROR') {
      const msg = (data.message ?? '').toLowerCase()
      if (msg.includes('não encontrado') || msg.includes('nao encontrado') || msg.includes('not found')) {
        return { kind: 'not_found' }
      }
      if (msg.includes('limite') || msg.includes('excedido') || msg.includes('limit')) {
        return { kind: 'rate_limited', detail: 'limit', reason: 'rate_limited' }
      }
      return { kind: 'error', detail: (data.message ?? 'ERROR').slice(0, 40), reason: 'network_error' }
    }

    const situacao = (data.situacao ?? '').toUpperCase()
    const atividadePrincipal = Array.isArray(data.atividade_principal) && data.atividade_principal.length > 0
      ? data.atividade_principal[0]
      : null
    const socios = Array.isArray(data.qsa)
      ? data.qsa.slice(0, 6).map((s) => ({
          nome: String(s.nome ?? '').trim(),
          qualificacao: s.qual ? String(s.qual) : null,
        }))
      : []

    const capitalSocial = typeof data.capital_social === 'number'
      ? data.capital_social
      : typeof data.capital_social === 'string'
        ? Number(data.capital_social.replace(/[^\d.,]/g, '').replace(',', '.')) || null
        : null

    const naturezaJuridica = data.natureza_juridica ? String(data.natureza_juridica) : null
    const telefone = data.telefone ? String(data.telefone) : null
    return {
      kind: 'ok',
      data: {
        verified: true,
        source: 'brasilapi_receita', // keep same source tag for UI consistency
        cnpj: normalized,
        cnpj_formatted: formatCnpj(normalized),
        razao_social: String(data.nome ?? '').trim(),
        nome_fantasia: data.fantasia ? String(data.fantasia).trim() : null,
        situacao_cadastral: situacao,
        cnpj_ativo: situacao === 'ATIVA',
        logradouro: data.logradouro ? String(data.logradouro) : null,
        numero: data.numero ? String(data.numero) : null,
        complemento: data.complemento ? String(data.complemento) : null,
        bairro: data.bairro ? String(data.bairro) : null,
        cidade: data.municipio ? String(data.municipio) : null,
        estado: data.uf ? String(data.uf) : null,
        cep: data.cep ? String(data.cep) : null,
        email: data.email ? String(data.email).toLowerCase() : null,
        telefone,
        telefone_mobile: isMobilePhone(telefone),
        cnae_fiscal_codigo: atividadePrincipal?.code ?? null,
        cnae_fiscal_descricao: atividadePrincipal?.text ?? null,
        porte: data.porte ? String(data.porte) : null,
        capital_social: typeof capitalSocial === 'number' ? capitalSocial : null,
        data_inicio_atividade: data.abertura ? String(data.abertura) : null,
        natureza_juridica: naturezaJuridica,
        is_solo_entity: isSoloEntity(naturezaJuridica),
        socios,
        fetched_at: new Date().toISOString(),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = message.includes('abort') || message.includes('timeout')
    return { kind: 'error', detail: isTimeout ? 'timeout' : message.slice(0, 40), reason: 'network_error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * BrasilAPI returns `ddd_telefone_1` as "DD999999999" (digits concatenated).
 * Prefer the first one; fall back to the second if the first is empty.
 */
function composeTelefone(t1?: string | null, t2?: string | null): string | null {
  const pick = (t?: string | null) => (typeof t === 'string' && t.trim().length > 0 ? t.trim() : null)
  const raw = pick(t1) ?? pick(t2)
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  const ddd = digits.slice(0, 2)
  const num = digits.slice(2)
  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
  if (num.length === 8) return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`
  return `(${ddd}) ${num}`
}

// ── BrasilAPI response shape (subset we consume) ──────────────────────────
type BrasilApiQsa = { nome_socio?: unknown; qualificacao_socio?: unknown }
type BrasilApiCnpjResponse = {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  descricao_situacao_cadastral?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
  email?: string
  ddd_telefone_1?: string
  ddd_telefone_2?: string
  cnae_fiscal?: number | string
  cnae_fiscal_descricao?: string
  porte?: string
  capital_social?: number
  data_inicio_atividade?: string
  natureza_juridica?: string
  qsa?: BrasilApiQsa[]
}
