import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Megaphone, MessageSquare, CalendarCheck } from 'lucide-react'

const metrics = [
  {
    label: 'Leads ativos',
    value: '—',
    description: 'Total em campanhas ativas',
    icon: Users,
  },
  {
    label: 'Campanhas',
    value: '—',
    description: 'Campanhas em andamento',
    icon: Megaphone,
  },
  {
    label: 'Mensagens enviadas',
    value: '—',
    description: 'Últimos 30 dias',
    icon: MessageSquare,
  },
  {
    label: 'Reuniões agendadas',
    value: '—',
    description: 'Últimos 30 dias',
    icon: CalendarCheck,
  },
]

export default function DashboardPage() {
  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(({ label, value, description, icon: Icon }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Atividade recente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Nenhuma atividade ainda. Importe leads e crie uma campanha para
                começar.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Pipeline de leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configure uma campanha para visualizar o pipeline aqui.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
