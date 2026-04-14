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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { ImportCsvDialog } from '@/components/leads/import-csv-dialog'
import { toast } from 'sonner'
import { Check, User, Upload } from 'lucide-react'

const STEPS = [
  { label: 'Perfil',         icon: User },
  { label: 'Importar leads', icon: Upload },
]

const profileSchema = z.object({
  full_name:    z.string().min(1, 'Nome obrigatório'),
  company_name: z.string().min(1, 'Nome da empresa obrigatório'),
})

type ProfileValues = z.infer<typeof profileSchema>

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [importOpen, setImportOpen] = useState(false)

  const updateProfile = trpc.profile.update.useMutation()

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', company_name: '' },
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

  // ── Step 1: Concluir ──────────────────────────────────────────────────────
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

          {/* ── Step 1: Importar leads ── */}
          {step === 1 && (
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
