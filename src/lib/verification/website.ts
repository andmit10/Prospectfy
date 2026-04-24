// Heuristic website detection.
//
// LLMs are conservative about returning website URLs because we (correctly)
// told them never to invent — but for many real Brazilian B2B companies the
// site exists at the obvious slug (`{nome}.com.br`). This probes a handful
// of candidate domains and returns the first one that responds with a
// 2xx/3xx — same logic Apollo/ZoomInfo use for "company website" enrichment.
//
// Conservative by design: only HEAD requests, 2.5s timeout each, returns
// null if nothing matches. False positives are worse than false negatives
// here (sales rep would email a domain that isn't actually the company).

import { Agent } from 'undici'
import { childLogger } from '@/lib/logger'

const log = childLogger('verification:website')

export type WebsiteVerified = {
  verified: true
  source: 'http_probe'
  url: string
  domain: string
  status: number
  fetched_at: string
}

export type WebsiteResult =
  | WebsiteVerified
  | { verified: false; reason: 'no_candidates' | 'all_failed' | 'invalid_input' }

/**
 * Build slug candidates from a company name.
 *
 * Examples:
 *   "F5 Gestão Empresarial" → ["f5gestao", "f5gestaoempresarial", "f5"]
 *   "JDS Consultoria"       → ["jdsconsultoria", "jds"]
 *   "Padaria do João"       → ["padariadojoao", "padariajoao", "padaria"]
 */
export function slugifyCompanyName(nome: string): string[] {
  const normalized = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\b(ltda|s\.?a|me|epp|eireli|cia|companhia)\b/gi, '') // remove legal suffixes
    .replace(/\b(do|da|de|dos|das|e)\b/gi, '') // remove portuguese stopwords
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return []

  const words = normalized.split(' ').filter((w) => w.length > 0)
  const candidates = new Set<string>()

  // Concatenated full slug: "f5gestaoempresarial"
  if (words.length > 0) candidates.add(words.join(''))

  // First two words: "f5gestao"
  if (words.length >= 2) candidates.add(words.slice(0, 2).join(''))

  // First word only: "jdsconsultoria" → "jds"
  if (words.length >= 1 && words[0].length >= 2) candidates.add(words[0])

  // Hyphenated full name: "f5-gestao-empresarial"
  if (words.length >= 2) candidates.add(words.join('-'))

  return [...candidates].filter((s) => s.length >= 2 && s.length <= 40)
}

let cachedDispatcher: Agent | undefined
function dispatcher(): Agent {
  if (!cachedDispatcher) {
    cachedDispatcher = new Agent({
      connect: {
        rejectUnauthorized: false, // many BR sites have weak SSL chain
        timeout: 2500,
      },
    })
  }
  return cachedDispatcher
}

type FetchInit = Parameters<typeof fetch>[1] & { dispatcher?: Agent }

/**
 * Try a single URL via HEAD; return status if reachable.
 */
async function probeUrl(url: string, timeoutMs = 2500): Promise<{ ok: boolean; status: number }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs)
  try {
    const init: FetchInit = {
      method: 'HEAD',
      signal: ctrl.signal,
      redirect: 'manual', // counts 301/302 as success
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AtivafyBot/1.0; +https://ativafy.com.br)',
        accept: 'text/html,*/*',
      },
      dispatcher: dispatcher(),
    }
    const res = await fetch(url, init)
    return { ok: res.status < 400 || res.status === 405, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Detect the official website of a Brazilian company by probing candidate
 * URLs derived from the company name. Returns the first URL that responds
 * with 2xx, 3xx, or 405 (Method Not Allowed — site exists, just doesn't
 * support HEAD).
 *
 * Tries .com.br first (most BR companies), falls back to .com.
 * Total time bound: ~6s for 2 slugs × 3 TLD/protocol variants.
 */
export async function detectWebsite(
  nome: string,
  options: { timeoutMs?: number } = {},
): Promise<WebsiteResult> {
  if (!nome || nome.trim().length < 2) {
    return { verified: false, reason: 'invalid_input' }
  }

  const slugs = slugifyCompanyName(nome).slice(0, 2)
  if (slugs.length === 0) {
    return { verified: false, reason: 'no_candidates' }
  }

  // Build URL candidates ordered by likelihood for BR market.
  const urls: string[] = []
  for (const slug of slugs) {
    urls.push(`https://www.${slug}.com.br`)
    urls.push(`https://${slug}.com.br`)
    urls.push(`https://www.${slug}.com`)
    urls.push(`https://${slug}.com`)
  }

  // Probe sequentially — early-return on first hit. Probing 8 URLs in
  // parallel risks DOSing small sites and triggers more SSL handshakes
  // than needed.
  for (const url of urls) {
    const probe = await probeUrl(url, options.timeoutMs)
    if (probe.ok) {
      const domain = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
      log.info('website detected', { nome, url, status: probe.status })
      return {
        verified: true,
        source: 'http_probe',
        url,
        domain,
        status: probe.status,
        fetched_at: new Date().toISOString(),
      }
    }
  }

  return { verified: false, reason: 'all_failed' }
}
