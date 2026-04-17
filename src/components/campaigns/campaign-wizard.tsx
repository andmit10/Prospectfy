'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { StepEditor, type DraftStep } from './step-editor'
import { MessagePreview } from './message-preview'
import { toast } from 'sonner'
import { Check } from 'lucide-react'

const WIZARD_STEPS = ['Informações', 'Cadência', 'Revisão'] as const

const infoSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  descricao: z.string().optional(),
  meta_reunioes: z.string().optional(),
})

type InfoValues = z.infer<typeof infoSchema>

export function CampaignWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [cadenciaSteps, setCadenciaSteps] = useState<DraftStep[]>([])
  const [submitting, setSubmitting] = useState(false)

  const createCampaign = trpc.campaigns.create.useMutation()

  const form = useForm<InfoValues>({
    resolver: zodResolver(infoSchema),
    defaultValues: { nome: '', descricao: '', meta_reunioes: '' },
  })

  async function handleSubmit() {
    const values = form.getValues()
    setSubmitting(true)

    try {
      const campaign = await createCampaign.mutateAsync({
        nome: values.nome,
        descricao: values.descricao || undefined,
        meta_reunioes: values.meta_reunioes ? Number(values.meta_reunioes) : undefined,
        steps: cadenciaSteps.filter((s) => s.mensagem_template.trim()),
      })
      toast.success('Campanha criada com sucesso!')
      router.push(`/campaigns/${campaign.id}`)
    } catch (err) {
      toast.error('Erro ao criar campanha')
    } finally {
      setSubmitting(false)
    }
  }

  async function nextStep() {
    if (currentStep === 0) {
      const valid = await form.trigger()
      if (!valid) return
    }
    setCurrentStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1))
  }

  const values = form.watch()

  return (
    <div className="space-y-8">
      {/* Stepper */}
      <nav className="flex items-center gap-2">
        {WIZARD_STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < currentStep && setCurrentStep(i)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < currentStep
                  ? 'bg-primary text-primary-foreground cursor-pointer'
                  : i === currentStep
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < currentStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </button>
            <span
              className={`text-sm ${
                i === currentStep ? 'font-medium' : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <div className="h-px w-8 bg-border" />
            )}
          </div>
        ))}
      </nav>

      {/* Step 0: Info */}
      {currentStep === 0 && (
        <Form {...form}>
          <form className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da campanha</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Agências de Marketing - Abril 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Objetivo e público-alvo desta campanha..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="meta_reunioes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta de reuniões (opcional)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} placeholder="Ex: 10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      )}

      {/* Step 1: Cadência — editor + live preview side-by-side on ≥lg */}
      {currentStep === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Configure os steps de mensagem. Use variáveis como{' '}
            <code className="bg-muted px-1 rounded text-xs">{'{{decisor_nome}}'}</code>{' '}
            para personalização automática — o preview ao lado usa o primeiro
            lead da sua lista.
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <StepEditor steps={cadenciaSteps} onChange={setCadenciaSteps} />
            <MessagePreview steps={cadenciaSteps} />
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Nome: </span>
              <span className="font-medium">{values.nome}</span>
            </div>
            {values.descricao && (
              <div>
                <span className="text-muted-foreground">Descrição: </span>
                {values.descricao}
              </div>
            )}
            {values.meta_reunioes && (
              <div>
                <span className="text-muted-foreground">Meta de reuniões: </span>
                {values.meta_reunioes}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Steps de cadência: </span>
              <span className="font-medium">
                {cadenciaSteps.filter((s) => s.mensagem_template.trim()).length} configurados
              </span>
            </div>
          </div>

          {cadenciaSteps.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Resumo da cadência:</p>
              {cadenciaSteps.filter((s) => s.mensagem_template.trim()).map((s) => (
                <div key={s.step_order} className="rounded border p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Step {s.step_order} · {s.canal}</span>
                    {s.delay_hours > 0 && (
                      <span className="text-muted-foreground">{s.delay_hours}h após anterior</span>
                    )}
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{s.mensagem_template}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
        >
          Voltar
        </Button>
        {currentStep < WIZARD_STEPS.length - 1 ? (
          <Button onClick={nextStep}>Próximo</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar campanha'}
          </Button>
        )}
      </div>
    </div>
  )
}
