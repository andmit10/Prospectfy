'use client'

import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const planLabel: Record<string, string> = {
  trial:   'Trial',
  starter: 'Starter — R$197/mês',
  pro:     'Pro',
  agency:  'Agency',
}

export function BillingCard() {
  const { data, isLoading } = trpc.stripe.getSubscription.useQuery()
  const checkout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => { window.location.href = url },
    onError: (err) => toast.error(err.message),
  })
  const portal = trpc.stripe.createPortalSession.useMutation({
    onSuccess: ({ url }) => { window.location.href = url },
    onError: (err) => toast.error(err.message),
  })

  if (isLoading) return <Skeleton className="h-32" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assinatura</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Plano atual:</span>
          <Badge variant={data?.plan === 'trial' ? 'secondary' : 'default'}>
            {planLabel[data?.plan ?? 'trial'] ?? data?.plan}
          </Badge>
        </div>

        {data?.plan === 'trial' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Assine o plano Starter para ter acesso completo: envios ilimitados, agente de IA e suporte prioritário.
            </p>
            <Button
              onClick={() => checkout.mutate()}
              disabled={checkout.isPending}
              className="w-full"
            >
              {checkout.isPending ? 'Redirecionando...' : 'Assinar por R$197/mês'}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => portal.mutate()}
            disabled={portal.isPending}
          >
            {portal.isPending ? 'Abrindo portal...' : 'Gerenciar assinatura'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
