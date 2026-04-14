import { LoginForm } from '@/components/auth/login-form'
import { Zap } from 'lucide-react'

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: '#00D26A' }}
          >
            <Zap className="h-6 w-6" style={{ color: '#0A0A0A' }} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#F0F0F0' }}>
              Prospectfy
            </h1>
            <p className="text-sm mt-1" style={{ color: '#888888' }}>
              Prospecção inteligente com IA
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: '#141414',
            border: '1px solid #1E1E1E',
          }}
        >
          <div className="mb-6">
            <h2 className="text-lg font-semibold" style={{ color: '#F0F0F0' }}>
              Entrar na sua conta
            </h2>
            <p className="text-sm mt-1" style={{ color: '#888888' }}>
              Use magic link ou Google para acessar
            </p>
          </div>
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: '#888888' }}>
          Não tem conta?{' '}
          <a
            href="mailto:contato@prospectfy.com.br"
            className="hover:underline transition-colors"
            style={{ color: '#00D26A' }}
          >
            Fale com a gente
          </a>
        </p>

        <p className="mt-4 text-center text-xs" style={{ color: '#444444' }}>
          © {new Date().getFullYear()} Prospectfy — Plataforma de Prospecção Inteligente
        </p>
      </div>
    </div>
  )
}
