import { Badge } from '@/components/ui/badge'
import type { PipelineStatus } from '@/types'

const config: Record<PipelineStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  novo:       { label: 'Novo',       variant: 'secondary' },
  contatado:  { label: 'Contatado',  variant: 'default' },
  respondeu:  { label: 'Respondeu',  variant: 'default' },
  reuniao:    { label: 'Reunião',    variant: 'default' },
  convertido: { label: 'Convertido', variant: 'default' },
  perdido:    { label: 'Perdido',    variant: 'destructive' },
}

const colors: Record<PipelineStatus, string> = {
  novo:       'bg-slate-100 text-slate-700',
  contatado:  'bg-blue-100 text-blue-700',
  respondeu:  'bg-yellow-100 text-yellow-700',
  reuniao:    'bg-purple-100 text-purple-700',
  convertido: 'bg-green-100 text-green-700',
  perdido:    'bg-red-100 text-red-700',
}

export function PipelineBadge({ status }: { status: PipelineStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {config[status].label}
    </span>
  )
}
