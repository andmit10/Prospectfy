'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

const schema = z.object({
  full_name: z.string().min(1, 'Nome obrigatório'),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  directfy_api_key: z.string().optional(),
  calendly_url: z.string().url('URL inválida').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface SettingsFormProps {
  profile: FormValues & { id: string } | null
}

export function SettingsForm({ profile }: SettingsFormProps) {
  const update = trpc.profile.update.useMutation({
    onSuccess: () => toast.success('Configurações salvas'),
    onError: (err) => toast.error(err.message),
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      company_name: profile?.company_name ?? '',
      phone: profile?.phone ?? '',
      directfy_api_key: profile?.directfy_api_key ?? '',
      calendly_url: profile?.calendly_url ?? '',
    },
  })

  function onSubmit(values: FormValues) {
    update.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perfil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Seu nome" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome da empresa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input placeholder="+55 31 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integrações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="directfy_api_key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Directfy API Key</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="df_live_..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Chave de API para envio de mensagens WhatsApp via Directfy
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="calendly_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL do Calendly</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://calendly.com/seu-usuario"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Link de agendamento enviado automaticamente quando o lead
                    está quente
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Salvando...' : 'Salvar configurações'}
        </Button>
      </form>
    </Form>
  )
}
