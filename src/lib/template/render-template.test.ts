import { describe, it, expect } from 'vitest'
import { renderTemplate, extractTokens, unknownTokens } from './render-template'

describe('renderTemplate', () => {
  it('substitutes known variables from the lead', () => {
    const out = renderTemplate('Oi {{decisor_nome}} da {{empresa_nome}}!', {
      decisor_nome: 'Maria',
      empresa_nome: 'Orbya',
    })
    expect(out).toBe('Oi Maria da Orbya!')
  })

  it('uses fallbacks for missing/empty fields', () => {
    const out = renderTemplate('{{decisor_nome}} · {{empresa_nome}}', {
      decisor_nome: '',
      empresa_nome: null,
    })
    expect(out).toBe('João Silva · Acme Ltda')
  })

  it('is whitespace-tolerant in tokens', () => {
    expect(renderTemplate('{{ decisor_nome  }}', { decisor_nome: 'X' })).toBe('X')
  })

  it('leaves unknown tokens visible (typos stay visible)', () => {
    expect(renderTemplate('{{nome_errado}}', {})).toBe('{{nome_errado}}')
  })

  it('handles a realistic multi-variable template', () => {
    const out = renderTemplate(
      'Olá {{decisor_nome}}, vi que a {{empresa_nome}} atua em {{segmento}} em {{cidade}}/{{estado}}.',
      {
        decisor_nome: 'Ana',
        empresa_nome: 'TechCo',
        segmento: 'SaaS',
        cidade: 'Curitiba',
        estado: 'PR',
      }
    )
    expect(out).toBe('Olá Ana, vi que a TechCo atua em SaaS em Curitiba/PR.')
  })
})

describe('token extraction', () => {
  it('extractTokens returns unique tokens', () => {
    expect(extractTokens('{{decisor_nome}} e {{decisor_nome}} na {{empresa_nome}}').sort()).toEqual(
      ['decisor_nome', 'empresa_nome']
    )
  })

  it('unknownTokens only returns names not in the allowed list', () => {
    expect(unknownTokens('{{decisor_nome}} {{foo}} {{bar}}')).toEqual(['foo', 'bar'])
    expect(unknownTokens('{{decisor_nome}} {{empresa_nome}}')).toEqual([])
  })
})
