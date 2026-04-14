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
  { label: 'Perfil',        icon: User },
  { label: 'Directfy',     icon: Key },
  { label: 'Importar leads', icon: Upload },
]

const profileSchema = z.object({
  full_name: z.string().min(1, 'Nome obrigatório'),
  company_name: z.string().min(1, 'Nome da empresa obrigatório'),
})

const directfySchema = z.object({
  directfy_api_key: z.string().min(1, 'Chave obrigatória'),
  calendly_url: z.string().url('URL inválida').optional().or(z.literal('')),
})

type ProfileValues = z.infer<typeof profileSchema>
type DirectfyValues = z.infer<typeof directfySchema>

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [importOpen, setImportOpen] = useState(false)

  const updateProfile = trpc.profile.update.useMutation()

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', company_name: '' },
  })

  const directfyForm = useForm<DirectfyValues>({
    resolver: zodResolver(directfySchema),
    defaultValues: { directfy_api_key: '', calendly_url: '' },
  })

  async function handleProfileNext() {
    const valid = await profileForm.trigger()
    if (!valid) return
    const values = profileForm.getValues()
    await updateProfile.mutateAsync(values)
    setStep(1)
  }

  async function handleDirectfyNext() {
    const valid = await directfyForm.trigger()
    if (!valid) return
    const values = directfyForm.getValues()
    await updateProfile.mutateAsync({
      directfy_api_key: values.directfy_api_key,
      calendly_url: values.calendly_url || undefined,
    })
    setStep(2)
  }

  async function handleFinish() {
    await updateProfile.mutateAsync({ onboarding_completed: true } as never)
    toast.success('Configuração concluída! Bem-vindo ao Orbya.')
    router.push('/dashboard')
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

          {/* Step 0: Profile */}
          {step === 0 && (
            <Form {...profileForm}>
              <form className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seu nome</FormLabel>
                      <FormControl><Input placeholder="Anderson Silva" {...field} /></FormControl>
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
                      <FormControl><Input placeholder="Acme Ltda" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleProfileNext}
                  disabled={updateProfile.isPending}
                >
                  Próximo
                </Button>
              </form>
            </Form>
          )}

          {/* Step 1: Directfy */}
          {step === 1 && (
            <Form {...directfyForm}>
              <form className="space-y-4">
                <FormField
                  control={directfyForm.control}
                  name="directfy_api_key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Directfy API Key</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="df_live_..." {...field} />
                      </FormControl>
                      <FormDescription>
                        Encontre sua chave no painel do Directfy → Configurações → API
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={directfyForm.control}
                  name="calendly_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL do Calendly (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://calendly.com/seu-usuario" {...field} />
                      </FormControl>
                      <FormDescription>
                        Usado pelo agente para enviar link de agendamento automaticamente
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>
                    Voltar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleDirectfyNext}
                    disabled={updateProfile.isPending}
                  >
                    Próximo
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* Step 2: Import leads */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Importe sua lista de leads para começar a prospectar. Você pode fazer isso agora ou pular para o dashboard.
              </p>
              <Button className="w-full" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Importar CSV / XLSX
              </Button>
              <Button variant="outline" className="w-full" onClick={handleFinish}>
                Pular e ir para o dashboard
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
