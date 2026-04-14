'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { ImportCsvDialog } from '@/components/leads/import-csv-dialog'
import { toast } from 'sonner'
import { Check, User, Key, Upload } from 'lucide-react'

const STEPS = [
  { label: 'Perfil',          icon: User },
  { label: 'Integrações',     icon: Key },
  { label: 'Importar leads',  icon: Upload },
]

const profileSchema = z.object({
  full_name:    z.string().min(1, 'Nome obrigatório'),
  company_name: z.string().min(1, 'Nome da empresa obrigatório'),
})

// Directfy e Calendly são opcionais — podem ser configurados depois em /settings
const integrationsSchema = z.object({
  directfy_api_key: z.string().optional(),
  calendly_url: z.string().url('URL inválida').optional().or(z.literal('')),
})

type ProfileValues      = z.infer<typeof profileSchema>
type IntegrationsValues = z.infer<typeof integrationsSchema>

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [importOpen, setImportOpen] = useState(false)

  const updateProfile = trpc.profile.update.useMutation()

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', company_name: '' },
  })

  const integrationsForm = useForm<IntegrationsValues>({
    resolver: zodResolver(integrationsSchema),
    defaultValues: { directfy_api_key: '', calendly_url: '' },
  })

  // ── Step 0: Perfil ────────────────────────────────────────────────────────
  async function handleProfileNext() {
    const valid = await profileForm.trigger()
    if (!valid) return
    try {
      await updateProfile.mutateAsync(profileForm.getValues())
      setStep(1)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar perfil. Tente novamente.')
    }
  }

  // ── Step 1: Integrações (opcional) ────────────────────────────────────────
  async function handleIntegrationsNext() {
    const values = integrationsForm.getValues()
    try {
      if (values.directfy_api_key || values.calendly_url) {
        await updateProfile.mutateAsync({
          directfy_api_key: values.directfy_api_key || undefined,
          calendly_url:     values.calendly_url     || undefined,
        })
      }
      setStep(2)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar integrações.')
    }
  }

  // ── Step 2: Concluir ──────────────────────────────────────────────────────
  async function handleFinish() {
    try {
      await updateProfile.mutateAsync({ onboarding_completed: true })
      toast.success('Configuração concluída! Bem-vindo ao Orbya.')
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar. Tente novamente.')
    }
  }

  return (
    <>
      {/* Stepper */}
      <nav className="flex justify-center gap-6 mb-6">
        {STEPS.map(({ label, icon: Icon }, i) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
              i < step
                ? 'border-primary bg-primary text-primary-foreground'
                : i === step
                ? 'border-primary text-primary'
                : 'border-muted-foreground/30 text-muted-foreground'
            }`}>
              {i < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span className={`text-xs font-medium ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </div>
        ))}
      </nav>

      <Card>
        <CardContent className="pt-6 space-y-5">

          {/* ── Step 0: Perfil ── */}
          {step === 0 && (
            <Form {...profileForm}>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleProfileNext() }}>
                <FormField
                  control={profileForm.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seu nome</FormLabel>
                      <FormControl>
                        <Input placeholder="Anderson Mitkiewicz" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da empresa</FormLabel>
                      <FormControl>
                        <Input placeholder="Labfy" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending ? 'Salvando...' : 'Próximo →'}
                </Button>
              </form>
            </Form>
          )}

          {/* ── Step 1: Integrações ── */}
          {step === 1 && (
            <Form {...integrationsForm}>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleIntegrationsNext() }}>
                <p className="text-sm text-muted-foreground">
                  Essas integrações são <strong>opcionais agora</strong> — você pode configurar depois em{' '}
                  <span className="font-medium">Configurações</span>.
                </p>
                <FormField
                  control={integrationsForm.control}
                  name="directfy_api_key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Directfy API Key <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="df_live_..." {...field} />
                      </FormControl>
                      <FormDescription>
                        Encontre no painel do Directfy → Configurações → API
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={integrationsForm.control}
                  name="calendly_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL do Calendly <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="https://calendly.com/seu-usuario" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enviado automaticamente quando o lead está pronto para reunião
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)}>
                    ← Voltar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? 'Salvando...' : 'Próximo →'}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground text-sm"
                  onClick={() => setStep(2)}
                >
                  Pular por agora
                </Button>
              </form>
            </Form>
          )}

          {/* ── Step 2: Importar leads ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Importe sua lista de leads para começar a prospectar agora. Você pode fazer isso depois também.
              </p>
              <Button className="w-full" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Importar CSV / XLSX
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleFinish}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Carregando...' : 'Pular e ir para o dashboard'}
              </Button>
            </div>
          )}

        </CardContent>
      </Card>

      <ImportCsvDialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false)
          handleFinish()
        }}
      />
    </>
  )
}
