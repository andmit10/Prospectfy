import Papa from 'papaparse'

export type RawRow = Record<string, string>

// Normalize BR phone: strip non-digits, ensure 55 prefix
export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11) return `55${digits}` // 11 with DDD
  if (digits.length === 10) return `55${digits}` // 10 with DDD no 9
  return digits
}

export function isValidBrPhone(phone: string): boolean {
  return /^55\d{10,11}$/.test(phone)
}

export async function parseCsv(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    })
  })
}

export async function parseXlsx(file: File): Promise<RawRow[]> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' })
}

export const COLUMN_LABELS: Record<string, string> = {
  empresa_nome:  'Nome da empresa *',
  decisor_nome:  'Nome do decisor *',
  whatsapp:      'WhatsApp *',
  cnpj:          'CNPJ',
  segmento:      'Segmento',
  cidade:        'Cidade',
  estado:        'Estado',
  decisor_cargo: 'Cargo',
  email:         'E-mail',
  linkedin_url:  'LinkedIn',
  telefone:      'Telefone',
}

export const REQUIRED_FIELDS = ['empresa_nome', 'decisor_nome', 'whatsapp'] as const
