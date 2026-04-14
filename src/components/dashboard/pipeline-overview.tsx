'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { PipelineStatus } from '@/types'

const stages: { key: PipelineStatus; label: string; color: string }[] = [
  { key: 'novo',       label: 'Novo',       color: 'bg-slate-400' },
  { key: 'contatado',  label: 'Contatado',  color: 'bg-blue-400' },
  { key: 'respondeu',  label: 'Respondeu',  color: 'bg-yellow-400' },
  { key: 'reuniao',    label: 'Reunião',    color: 'bg-purple-400' },
  { key: 'convertido', label: 'Convertido', color: 'bg-green-400' },
  { key: 'perdido',    label: 'Perdido',    color: 'bg-red-400' },
]

export function PipelineOverview() {
  const { data, isLoading } = trpc.dashboard.metrics.useQuery()

  const pipeline = data?.pipeline ?? {}
  const total = Object.values(pipeline).reduce((a, b) => a + b, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Pipeline de leads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6" />)
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">Importe leads para ver o pipeline.</p>
        ) : (
          <>
            {/* Bar chart */}
            <div className="flex h-3 w-full overflow-hidden rounded-full gap-0.5">
              {stages.map(({ key, color }) => {
                const pct = total > 0 ? ((pipeline[key] ?? 0) / total) * 100 : 0
                return pct > 0 ? (
                  <div
                    key={key}
                    className={`${color} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                ) : null
              })}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {stages.map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color}`} />
                  <span className="text-muted-foreground flex-1">{label}</span>
                  <span className="font-medium tabular-nums">{pipeline[key] ?? 0}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
