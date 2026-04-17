import { createClient } from '@/lib/supabase/server'
import { resolveCurrentOrgId } from '@/lib/org-context'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

/**
 * Export all leads of the current org as an Excel workbook (.xlsx).
 *
 * Columns are the user-facing lead fields. Metadata (enrichment JSON) is
 * intentionally not exported here — it would bloat the sheet and doesn't
 * re-import cleanly through `/api/import-leads`.
 */

type LeadRow = {
  empresa_nome: string | null
  decisor_nome: string | null
  decisor_cargo: string | null
  whatsapp: string | null
  telefone: string | null
  email: string | null
  email_status: string | null
  linkedin_url: string | null
  cnpj: string | null
  segmento: string | null
  cidade: string | null
  estado: string | null
  status_pipeline: string | null
  lead_score: number | null
  fonte: string | null
  tags: string[] | null
  created_at: string | null
}

const COLUMNS: Array<{ key: keyof LeadRow; header: string; width: number }> = [
  { key: 'empresa_nome', header: 'Empresa', width: 32 },
  { key: 'decisor_nome', header: 'Decisor', width: 28 },
  { key: 'decisor_cargo', header: 'Cargo', width: 22 },
  { key: 'whatsapp', header: 'WhatsApp', width: 16 },
  { key: 'telefone', header: 'Telefone', width: 16 },
  { key: 'email', header: 'E-mail', width: 30 },
  { key: 'email_status', header: 'Status do e-mail', width: 14 },
  { key: 'linkedin_url', header: 'LinkedIn', width: 34 },
  { key: 'cnpj', header: 'CNPJ', width: 18 },
  { key: 'segmento', header: 'Segmento', width: 20 },
  { key: 'cidade', header: 'Cidade', width: 18 },
  { key: 'estado', header: 'UF', width: 6 },
  { key: 'status_pipeline', header: 'Etapa', width: 14 },
  { key: 'lead_score', header: 'Score', width: 8 },
  { key: 'fonte', header: 'Fonte', width: 14 },
  { key: 'tags', header: 'Tags', width: 24 },
  { key: 'created_at', header: 'Criado em', width: 20 },
]

function formatCell(key: keyof LeadRow, value: unknown): string | number {
  if (value === null || value === undefined) return ''
  if (key === 'tags' && Array.isArray(value)) return value.join(', ')
  if (key === 'lead_score' && typeof value === 'number') return value
  if (key === 'created_at' && typeof value === 'string') {
    // Convert ISO to local-ish readable format
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  }
  return String(value)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await resolveCurrentOrgId(supabase, user.id)
  if (!orgId) {
    return NextResponse.json({ error: 'Sem organização ativa' }, { status: 403 })
  }

  const selectCols = COLUMNS.map((c) => c.key).join(',')
  const { data: leads, error } = await supabase
    .from('leads')
    .select(selectCols)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build rows as array-of-arrays — first row is the header.
  const aoa: Array<Array<string | number>> = [COLUMNS.map((c) => c.header)]
  for (const lead of (leads ?? []) as unknown as LeadRow[]) {
    aoa.push(COLUMNS.map((c) => formatCell(c.key, lead[c.key])))
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Column widths
  ws['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))
  // Freeze header row + turn on autofilter
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  if (aoa.length > 1) {
    const ref = XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: COLUMNS.length - 1, r: aoa.length - 1 },
    })
    ws['!autofilter'] = { ref }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer

  const filename = `leads-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.byteLength),
    },
  })
}
