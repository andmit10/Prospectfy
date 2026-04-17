/**
 * Lead fields usable as `{{variable}}` tokens in campaign message templates.
 * Kept narrow on purpose — surface only what's useful for personalization so
 * the UI variable picker stays short and users don't leak fields like `cnpj`
 * into WhatsApp copy.
 */
export type TemplateVars = {
  decisor_nome?: string | null
  decisor_cargo?: string | null
  empresa_nome?: string | null
  segmento?: string | null
  cidade?: string | null
  estado?: string | null
}

const FALLBACKS: Required<Omit<TemplateVars, never>> = {
  decisor_nome: 'João Silva',
  decisor_cargo: 'CEO',
  empresa_nome: 'Acme Ltda',
  segmento: 'Tecnologia',
  cidade: 'São Paulo',
  estado: 'SP',
}

export const TEMPLATE_VARIABLES = [
  '{{decisor_nome}}',
  '{{empresa_nome}}',
  '{{segmento}}',
  '{{decisor_cargo}}',
  '{{cidade}}',
  '{{estado}}',
] as const

/**
 * Replace `{{key}}` tokens with values from `vars`, falling back to a
 * representative sample when a field is empty or missing. Unknown tokens are
 * left as-is so typos are visible in the preview instead of silently blanked.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey as keyof TemplateVars
    const value = vars[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value)
    }
    return FALLBACKS[key] ?? match
  })
}

/**
 * Extract all `{{variable}}` tokens referenced in a template. Useful to warn
 * the user about unknown/invalid tokens before they send.
 */
export function extractTokens(template: string): string[] {
  const out = new Set<string>()
  const re = /\{\{\s*([a-z_]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) out.add(m[1])
  return [...out]
}

const KNOWN: Set<string> = new Set(
  TEMPLATE_VARIABLES.map((v) => v.replace(/[{}]/g, ''))
)

export function unknownTokens(template: string): string[] {
  return extractTokens(template).filter((t) => !KNOWN.has(t))
}
