'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2, Plus, GripVertical } from 'lucide-react'
import type { CadenciaStep } from '@/types'
import {
  renderTemplate,
  TEMPLATE_VARIABLES,
  type TemplateVars,
} from '@/lib/template/render-template'

export type DraftStep = Omit<CadenciaStep, 'id' | 'campaign_id' | 'created_at'>

const VARIABLES = TEMPLATE_VARIABLES.slice(0, 4)

interface StepEditorProps {
  steps: DraftStep[]
  onChange: (steps: DraftStep[]) => void
  sampleLead?: TemplateVars
}

export function StepEditor({ steps, onChange, sampleLead = {} }: StepEditorProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  function addStep() {
    onChange([
      ...steps,
      {
        step_order: steps.length + 1,
        canal: 'whatsapp',
        delay_hours: steps.length === 0 ? 0 : 24,
        mensagem_template: '',
        tipo_mensagem: 'texto',
        ativo: true,
      },
    ])
  }

  function removeStep(index: number) {
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, step_order: i + 1 }))
    onChange(updated)
    if (previewIndex === index) setPreviewIndex(null)
  }

  function updateStep(index: number, patch: Partial<DraftStep>) {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function insertVariable(index: number, variable: string) {
    const current = steps[index].mensagem_template
    updateStep(index, { mensagem_template: current + variable })
  }

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <Card key={i} className="border-l-4 border-l-primary/40">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold flex-1">
              Step {step.step_order}
              {step.delay_hours > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">
                  · {step.delay_hours}h após step anterior
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeStep(i)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Canal</Label>
                <Select
                  value={step.canal}
                  onValueChange={(v) => updateStep(i, { canal: v as DraftStep['canal'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {i === 0 ? 'Envio imediato' : 'Aguardar (horas)'}
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={step.delay_hours}
                  disabled={i === 0}
                  onChange={(e) => updateStep(i, { delay_hours: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Mensagem template</Label>
                <div className="flex gap-1">
                  {VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(i, v)}
                      className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 font-mono"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                rows={4}
                value={step.mensagem_template}
                onChange={(e) => updateStep(i, { mensagem_template: e.target.value })}
                placeholder="Olá {{decisor_nome}}, tudo bem? Vi que a {{empresa_nome}} atua em..."
                className="font-mono text-sm resize-none"
              />
            </div>

            {step.mensagem_template && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setPreviewIndex(previewIndex === i ? null : i)}
                  className="text-xs text-primary hover:underline"
                >
                  {previewIndex === i ? 'Ocultar preview' : 'Ver preview com dados reais'}
                </button>
                {previewIndex === i && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm whitespace-pre-wrap">
                    {renderTemplate(step.mensagem_template, sampleLead)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addStep} className="w-full">
        <Plus className="mr-1 h-4 w-4" /> Adicionar step
      </Button>
    </div>
  )
}
