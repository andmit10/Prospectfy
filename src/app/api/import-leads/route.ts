import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveCurrentOrgId } from '@/lib/org-context'
import { childLogger } from '@/lib/logger'
import { enforceRateLimit, clientIdFromRequest } from '@/lib/rate-limit'
import { z } from 'zod'

const log = childLogger('api:import-leads')

// Upper bound per request. Bigger files are processed in multiple calls by the
// importer dialog. 1000 keeps a single Postgres INSERT well under the
// statement-size limits while comfortably covering the PRD target (500 rows
// in under 30s).
const MAX_ROWS_PER_REQUEST = 1000
const INSERT_CHUNK_SIZE = 500

const leadRowSchema = z.object({
  // Core
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
  cnpj: z.string().optional(),
  // Maps / quality signals
  cnpj_ativo: z.boolean().optional(),
  rating_maps: z.number().optional(),
  total_avaliacoes: z.number().optional(),
  porte: z.string().optional(),
  funcionarios_estimados: z.number().optional(),
  score: z.number().optional(),
  score_detalhes: z.object({
    maps_presenca: z.number().default(0),
    decisor_encontrado: z.number().default(0),
    email_validado: z.number().default(0),
    linkedin_ativo: z.number().default(0),
    porte_match: z.number().default(0),
  }).optional(),
  // Endereço detalhado
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cep: z.string().optional(),
  endereco_completo: z.string().optional(),
  // CNPJ / empresa details
  razao_social: z.string().optional(),
  nome_fantasia: z.string().optional(),
  data_abertura: z.string().optional(),
  capital_social: z.number().optional(),
  natureza_juridica: z.string().optional(),
  situacao_cnpj: z.string().optional(),
  inscricao_estadual: z.string().optional(),
  opcao_simples: z.boolean().optional(),
  opcao_mei: z.boolean().optional(),
  tipo: z.enum(['Matriz', 'Filial']).optional(),
  // Extras
  website: z.string().optional(),
  telefones_extras: z.array(z.string()).optional(),
  fontes_consultadas: z.array(z.string()).optional(),
})

const inputSchema = z.object({
  leads: z.array(leadRowSchema),
})

export async function POST(request: NextRequest) {
  const t0 = Date.now()
  try {
    // First gate: cheap IP-based bucket so anonymous floods don't even reach auth.
    const ipBlocked = await enforceRateLimit({
      key: `import-leads:ip:${clientIdFromRequest(request)}`,
      limit: 30,
      windowSec: 60,
    })
    if (ipBlocked) return ipBlocked

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const orgId = await resolveCurrentOrgId(supabase, user.id)
    if (!orgId) {
      return NextResponse.json({ error: 'Sem organização ativa' }, { status: 403 })
    }

    // Per-org bucket — the real protection. Bulk imports are expensive
    // (dedup + INSERT); 10/min is plenty for legitimate UI flows.
    const orgBlocked = await enforceRateLimit({
      key: `import-leads:org:${orgId}`,
      limit: 10,
      windowSec: 60,
    })
    if (orgBlocked) return orgBlocked

    const body = await request.json()
    const input = inputSchema.safeParse(body)
    if (!input.success) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    if (input.data.leads.length > MAX_ROWS_PER_REQUEST) {
      return NextResponse.json(
        {
          error: `Importe no máximo ${MAX_ROWS_PER_REQUEST} leads por requisição.`,
        },
        { status: 413 }
      )
    }

    const rows = input.data.leads.map((lead) => ({
      empresa_nome: lead.empresa_nome,
      decisor_nome: lead.decisor_nome,
      decisor_cargo: lead.decisor_cargo || null,
      segmento: lead.segmento || null,
      cidade: lead.cidade || null,
      estado: lead.estado || null,
      email: lead.email || null,
      whatsapp: lead.whatsapp,
      telefone: lead.telefone || null,
      linkedin_url: lead.linkedin_url || null,
      cnpj: lead.cnpj || null,
      lead_score: lead.score ?? 50,
      organization_id: orgId,
      user_id: user.id, // audit: creator
      fonte: 'api' as const,
      metadata: {
        cnpj_ativo: lead.cnpj_ativo ?? true,
        rating_maps: lead.rating_maps ?? 0,
        total_avaliacoes: lead.total_avaliacoes ?? 0,
        porte: lead.porte || null,
        funcionarios_estimados: lead.funcionarios_estimados ?? 0,
        score_detalhes: lead.score_detalhes || null,
        // Endereço detalhado
        logradouro: lead.logradouro || null,
        numero: lead.numero || null,
        bairro: lead.bairro || null,
        cep: lead.cep || null,
        endereco_completo: lead.endereco_completo || null,
        // CNPJ / empresa details
        razao_social: lead.razao_social || null,
        nome_fantasia: lead.nome_fantasia || null,
        data_abertura: lead.data_abertura || null,
        capital_social: lead.capital_social ?? null,
        natureza_juridica: lead.natureza_juridica || null,
        situacao_cnpj: lead.situacao_cnpj || null,
        inscricao_estadual: lead.inscricao_estadual || null,
        opcao_simples: lead.opcao_simples ?? null,
        opcao_mei: lead.opcao_mei ?? null,
        tipo: lead.tipo || null,
        // Extras
        website: lead.website || null,
        telefones_extras: lead.telefones_extras ?? [],
        fontes_consultadas: lead.fontes_consultadas ?? [],
      },
    }))

    // Pre-filter: fetch existing fingerprints to report accurate skipped count.
    const fingerprints = rows.map(r => ({ whatsapp: r.whatsapp, empresa_nome: r.empresa_nome }))
    const whatsapps = Array.from(new Set(fingerprints.map(f => f.whatsapp)))

    const { data: existing } = await supabase
      .from('leads')
      .select('whatsapp, empresa_nome')
      .eq('organization_id', orgId)
      .in('whatsapp', whatsapps)
      .is('deleted_at', null)

    const existingSet = new Set(
      (existing ?? []).map(e => `${e.whatsapp}|${(e.empresa_nome ?? '').toLowerCase()}`)
    )
    const newRows = rows.filter(
      r => !existingSet.has(`${r.whatsapp}|${r.empresa_nome.toLowerCase()}`)
    )
    const skipped = rows.length - newRows.length

    if (newRows.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped,
        total: rows.length,
        durationMs: Date.now() - t0,
      })
    }

    // Dedup is handled by the pre-filter above. We intentionally avoid .upsert()
    // with onConflict here because the unique index `idx_leads_dedup` is PARTIAL
    // (`where deleted_at is null`) — Postgres rejects ON CONFLICT targets that
    // don't match a full constraint, throwing "there is no unique or exclusion
    // constraint matching the ON CONFLICT specification".
    //
    // We chunk large inserts so a failure mid-way doesn't roll back the whole
    // batch (PostgREST inserts are statement-scoped but splitting also keeps
    // request payloads comfortably under Supabase's body limits for 500+ rows).
    // `select('id')` instead of `.select()` — we only need the count on the
    // client, so skipping the full round-trip shaves noticeable latency at
    // 500 rows.
    let imported = 0
    for (let i = 0; i < newRows.length; i += INSERT_CHUNK_SIZE) {
      const chunk = newRows.slice(i, i + INSERT_CHUNK_SIZE)
      const { data, error } = await supabase.from('leads').insert(chunk).select('id')
      if (error) {
        log.error('insert chunk failed', {
          orgId,
          chunkStart: i,
          chunkSize: chunk.length,
          error: error.message,
        })
        return NextResponse.json(
          { error: error.message, imported, skipped },
          { status: 500 }
        )
      }
      imported += data?.length ?? 0
    }

    const durationMs = Date.now() - t0
    log.info('import complete', { orgId, imported, skipped, total: rows.length, durationMs })

    return NextResponse.json({
      imported,
      skipped,
      total: rows.length,
      durationMs,
    })
  } catch (err) {
    log.error('import-leads failed', {
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
