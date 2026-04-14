import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div>
          <span className="text-2xl font-bold tracking-tight">Orbya</span>
        </div>
        <div className="space-y-4">
          <h2 className="text-4xl font-bold leading-tight">
            Prospecção B2B via WhatsApp com IA
          </h2>
          <p className="text-primary-foreground/70 text-lg">
            Importe seus leads, configure a cadência e deixe o agente de IA prospectar enquanto você fecha negócios.
          </p>
          <ul className="space-y-2 text-primary-foreground/80 text-sm">
            {[
              'Envio automático via Directfy',
              'Personalização com Claude AI',
              'Pipeline visual com drag-and-drop',
              'Métricas em tempo real',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/60" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/40">
          © {new Date().getFullYear()} Orbya — Plataforma de Prospecção Inteligente
        </p>
      </div>

      {/* Right — auth form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <h1 className="text-2xl font-bold">Orbya</h1>
          </div>
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Entrar na sua conta</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Use magic link ou Google para acessar
            </p>
          </div>
          <LoginForm />
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Não tem conta?{' '}
            <a href="mailto:contato@orbya.com.br" className="text-primary hover:underline">
              Fale com a gente
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
