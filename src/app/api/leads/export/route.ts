import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const HEADERS = [
  'empresa_nome', 'decisor_nome', 'decisor_cargo', 'whatsapp',
  'telefone', 'email', 'email_status', 'linkedin_url',
  'cnpj', 'segmento', 'cidade', 'estado',
  'status_pipeline', 'lead_score', 'fonte', 'tags', 'created_at',
]

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = Array.isArray(value) ? value.join(';') : String(value)
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: leads, error } = await supabase
    .from('leads')
    .select(HEADERS.join(','))
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = [
    HEADERS.join(','),
    ...(leads ?? []).map((lead) =>
      HEADERS.map((h) => escapeCell(lead[h as keyof typeof lead])).join(',')
    ),
  ]

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
