import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Orbya</h1>
          <p className="text-muted-foreground mt-2">
            Plataforma de prospecção inteligente
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
