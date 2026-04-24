#!/usr/bin/env node
/**
 * debug-generate.mjs
 *
 * Simula o fluxo do /api/generate-leads modo discover localmente, sem
 * precisar do endpoint. Chama Anthropic direto, parseia, valida campos.
 * Imprime diagnóstico.
 *
 * Uso: node scripts/debug-generate.mjs [quantidade] [segmento] [cidade] [uf]
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envText = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/)
  if (m) env[m[1]] = m[2]
}
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY || env.AI_SERVICE_KEY
if (!ANTHROPIC_KEY) {
  console.error('❌ Sem ANTHROPIC_API_KEY em .env.local')
  process.exit(1)
}

const quantidade = Math.max(1, Math.min(5, Number(process.argv[2] || '2')))
const segmento = process.argv[3] || 'academias de crossfit'
const cidade = process.argv[4] || 'São Paulo'
const estado = process.argv[5] || 'SP'

console.log(`\n=== DEBUG GENERATE ===`)
console.log(`quantidade=${quantidade}  segmento="${segmento}"  cidade=${cidade}/${estado}\n`)

const prompt = `Você é um sistema avançado de geração de leads B2B brasileiro.
Gere EXATAMENTE ${quantidade} leads empresariais detalhados para prospecção.

PARÂMETROS:
- Segmento: ${segmento}
- Região: ${cidade}, ${estado}
- Cargo alvo do decisor: CEO, Diretor, Gerente ou Sócio

RETORNE APENAS um array JSON puro (sem \`\`\`json nem texto adicional). Cada lead DEVE ter TODOS estes campos (os valores abaixo são apenas DESCRIÇÕES do formato — NÃO copie literalmente):
[{
  "empresa_nome": "<nome real da empresa brasileira, com sufixo Ltda/S.A./ME quando aplicável>",
  "decisor_nome": "<nome completo do decisor principal>",
  "decisor_cargo": "Diretor",
  "decisores": [
    {
      "nome": "<nome do decisor principal>",
      "cargo": "Diretor",
      "email": "<email corporativo no domínio da empresa, ou null se não souber>",
      "whatsapp": "<55 + DDD da região + 9 dígitos iniciando com 9, ou null se não souber — NUNCA use padrões sequenciais tipo 999990001>",
      "linkedin_url": "<URL de busca do LinkedIn no formato https://www.linkedin.com/search/results/people/?keywords=...>",
      "principal": true
    }
  ],
  "segmento": "${segmento}",
  "cidade": "${cidade}",
  "estado": "${estado}",
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
  "justificativa_score": "1-2 frases concretas",
  "horario_ideal": "dia + janela",
  "mensagem_whatsapp": "msg com [Nome] e [Empresa Usuário] + CTA reunião 15min",
  "mensagem_email_assunto": "assunto curto",
  "mensagem_email_corpo": "email 3 parágrafos com [Nome], [Empresa], [Seu Nome]"
}]

REGRAS:
- Campos desconhecidos: null, NUNCA inventar
- NUNCA usar 12.345.678/0001-90, 3000-0001 ou similares
- RESPONDA APENAS COM O ARRAY JSON`

const t0 = Date.now()
console.log(`→ chamando Anthropic claude-sonnet-4-20250514 (${prompt.length} chars)...`)

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: Math.min(16000, quantidade * 900),
    messages: [{ role: 'user', content: prompt }],
  }),
})

const latency = Date.now() - t0
console.log(`← ${latency}ms, status ${res.status}`)

if (!res.ok) {
  const err = await res.text()
  console.error('❌ Anthropic error:', err.slice(0, 500))
  process.exit(1)
}

const body = await res.json()
const rawText = body.content?.[0]?.text ?? ''
console.log(`\n=== RAW CLAUDE OUTPUT (${rawText.length} chars) ===`)
console.log(rawText.slice(0, 2000))
if (rawText.length > 2000) console.log(`... (+${rawText.length - 2000} chars)`)

// Extract JSON array
function extractJsonArray(text) {
  // Strip markdown fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  try {
    const parsed = JSON.parse(cleaned)
    return parsed
  } catch {
    // Try to find first `[` and last `]`
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

const parsed = extractJsonArray(rawText)
console.log(`\n=== PARSE ===`)
if (!Array.isArray(parsed)) {
  console.log(`❌ NÃO é array. Tipo: ${typeof parsed}`)
  process.exit(0)
}
console.log(`✓ Array com ${parsed.length} items`)
console.log(`Primeiro item keys: ${Object.keys(parsed[0] || {}).join(', ')}`)

// ── REAL Zod schema validation (same as prod route.ts) ──
// Import would need TS transpile — redefining inline with the same shape + fix.
const { z } = await import('zod')

const zStr = (def = '') =>
  z.preprocess((v) => (v == null ? def : v), z.string().catch(def))
const zNum = (def = 0) =>
  z.preprocess((v) => (v == null ? def : v), z.number().catch(def))
const zBool = (def = false) =>
  z.preprocess((v) => (v == null ? def : v), z.boolean().catch(def))

const decisorSchema = z.object({
  nome: zStr(),
  cargo: zStr(),
  email: zStr(),
  whatsapp: zStr(),
  linkedin_url: zStr(),
  principal: zBool(false),
})

const leadSchema = z.object({
  empresa_nome: zStr(),
  decisor_nome: zStr(),
  decisor_cargo: zStr(),
  segmento: zStr(),
  cidade: zStr(),
  estado: zStr(),
  email: zStr(),
  whatsapp: zStr(),
  telefone: zStr(),
  linkedin_url: zStr(),
  cnpj: zStr(),
  cnpj_ativo: zBool(true),
  rating_maps: z.preprocess((v) => (v == null ? 0 : v), z.number().min(0).max(5).catch(0)),
  total_avaliacoes: zNum(0),
  porte: zStr(),
  funcionarios_estimados: zNum(0),
  score: z.preprocess((v) => (v == null ? 50 : v), z.number().min(0).max(100).catch(50)),
  score_detalhes: z.object({
    maps_presenca: zNum(0),
    decisor_encontrado: zNum(0),
    email_validado: zNum(0),
    linkedin_ativo: zNum(0),
    porte_match: zNum(0),
  }).optional().default({
    maps_presenca: 0, decisor_encontrado: 0, email_validado: 0, linkedin_ativo: 0, porte_match: 0,
  }),
  decisores: z.array(decisorSchema).optional().default([]),
  mensagem_whatsapp: zStr(),
  mensagem_email_assunto: zStr(),
  mensagem_email_corpo: zStr(),
  justificativa_score: zStr(),
  horario_ideal: zStr(),
  verified_sources: z.array(z.enum(['receita_federal', 'google_places', 'email_mx'])).optional().default([]),
  razao_social: zStr(),
  nome_fantasia: zStr(),
  endereco: zStr(),
  cnae_descricao: zStr(),
  situacao_cadastral: zStr(),
})

console.log(`\n=== ZOD VALIDATION (com fix null→empty) ===`)
let passed = 0
parsed.forEach((item, idx) => {
  const r = leadSchema.safeParse(item)
  if (r.success) {
    passed++
    console.log(`  item[${idx}] ✓ PASS — empresa="${r.data.empresa_nome}", decisor="${r.data.decisor_nome}", whatsapp="${r.data.whatsapp}"`)
  } else {
    console.log(`  item[${idx}] ❌ FAIL`)
    r.error.issues.slice(0, 5).forEach((iss) => {
      console.log(`    ${iss.path.join('.')}: ${iss.message}`)
    })
  }
})

console.log(`\n=== RESULT ===`)
console.log(`${passed}/${parsed.length} leads passariam no schema`)
console.log(`Se 0 passaram → é aqui que o prod falha (validLeads.length === 0 → "Leads em formato inválido")\n`)

console.log(`=== SAMPLE FIRST ITEM (pretty) ===`)
console.log(JSON.stringify(parsed[0], null, 2).slice(0, 3000))
