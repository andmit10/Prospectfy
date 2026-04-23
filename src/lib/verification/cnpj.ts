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
  cnae_fiscal_codigo: string | null
  cnae_fiscal_descricao: string | null
  porte: string | null // "MICRO EMPRESA" | "EMPRESA DE PEQUENO PORTE" | "DEMAIS"
  capital_social: number | null
  data_inicio_atividade: string | null
  natureza_juridica: string | null
  socios: Array<{ nome: string; qualificacao: string | null }>
  fetched_at: string // ISO timestamp
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
 * Verify a CNPJ against Receita Federal (via BrasilAPI proxy).
 *
 * This function is the ONLY authoritative path for "CNPJ ativo na Receita" —
 * no LLM output should be trusted for this flag. Timeout bound to 7s to keep
 * the generate-leads SSE stream responsive.
 */
export async function verifyCnpj(
  input: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<CnpjVerificationResult> {
  const { timeoutMs = 7000, signal } = options

  const normalized = normalizeCnpj(input)
  if (!normalized) {
    return { verified: false, reason: 'invalid_format', cnpj_input: input }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs)
  // If the caller passed an AbortSignal, link it so cancelling the SSE stream
  // also cancels the fetch.
  if (signal) {
    if (signal.aborted) ctrl.abort('already_aborted')
    else signal.addEventListener('abort', () => ctrl.abort('caller_aborted'), { once: true })
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${normalized}`, {
      signal: ctrl.signal,
      // BrasilAPI has a Vercel-edge cache with ~1h TTL — fine for us.
      headers: { accept: 'application/json' },
    })

    if (res.status === 404) {
      return { verified: false, reason: 'not_found', cnpj_input: input }
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || undefined
      return { verified: false, reason: 'rate_limited', cnpj_input: input, retry_after_sec: retryAfter }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      log.warn('brasilapi unexpected status', { cnpj: normalized, status: res.status, body: body.slice(0, 200) })
      return { verified: false, reason: 'network_error', cnpj_input: input, message: `BrasilAPI ${res.status}` }
    }

    const data = (await res.json()) as BrasilApiCnpjResponse
    const situacao = (data.descricao_situacao_cadastral ?? '').toUpperCase()

    const socios: Array<{ nome: string; qualificacao: string | null }> = Array.isArray(data.qsa)
      ? data.qsa.slice(0, 6).map((s) => ({
          nome: String(s.nome_socio ?? '').trim(),
          qualificacao: s.qualificacao_socio ? String(s.qualificacao_socio) : null,
        }))
      : []

    return {
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
      telefone: composeTelefone(data.ddd_telefone_1, data.ddd_telefone_2),
      cnae_fiscal_codigo: data.cnae_fiscal ? String(data.cnae_fiscal) : null,
      cnae_fiscal_descricao: data.cnae_fiscal_descricao ? String(data.cnae_fiscal_descricao) : null,
      porte: data.porte ? String(data.porte) : null,
      capital_social: typeof data.capital_social === 'number' ? data.capital_social : null,
      data_inicio_atividade: data.data_inicio_atividade ? String(data.data_inicio_atividade) : null,
      natureza_juridica: data.natureza_juridica ? String(data.natureza_juridica) : null,
      socios,
      fetched_at: new Date().toISOString(),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('abort') || message.includes('timeout')) {
      return { verified: false, reason: 'network_error', cnpj_input: input, message: 'timeout' }
    }
    log.warn('brasilapi fetch failed', { err: message, cnpj: normalized })
    return { verified: false, reason: 'network_error', cnpj_input: input, message }
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
