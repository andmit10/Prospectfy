import { describe, it, expect } from 'vitest'
import { sendWhatsappSchema } from './send-whatsapp'
import { updateLeadScoreSchema } from './update-lead-score'
import { movePipelineStageSchema } from './move-pipeline-stage'
import { scheduleMeetingSchema } from './schedule-meeting'

describe('agent tool schemas', () => {
  const schemas = [
    sendWhatsappSchema,
    updateLeadScoreSchema,
    movePipelineStageSchema,
    scheduleMeetingSchema,
  ]

  it('each schema has a unique snake_case name, non-empty description, and object input_schema', () => {
    const names = new Set<string>()
    for (const s of schemas) {
      expect(s.name).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(names.has(s.name)).toBe(false)
      names.add(s.name)
      expect(typeof s.description).toBe('string')
      expect((s.description ?? '').length).toBeGreaterThan(5)
      expect(s.input_schema.type).toBe('object')
      expect(s.input_schema.properties).toBeTypeOf('object')
    }
  })

  it('send_whatsapp requires phone, message, lead_id', () => {
    expect(sendWhatsappSchema.input_schema.required).toEqual(
      expect.arrayContaining(['phone', 'message', 'lead_id'])
    )
  })

  it('move_pipeline_stage enum matches PRD pipeline stages', () => {
    const props = movePipelineStageSchema.input_schema.properties as Record<
      string,
      { enum?: string[] }
    >
    expect(props.new_status?.enum).toEqual(
      expect.arrayContaining([
        'novo',
        'contatado',
        'respondeu',
        'reuniao',
        'convertido',
        'perdido',
      ])
    )
  })
})
