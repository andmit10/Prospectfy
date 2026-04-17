import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'
import { Logo } from '@/components/brand/logo'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--background)]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <Logo size={56} />
          <div className="text-center">
            <h1
              className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif', letterSpacing: '-0.03em' }}
            >
              Prospectfy
            </h1>
            <p className="text-sm mt-1 text-[var(--text-secondary)]">
              Prospecção inteligente com IA
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl p-6 bg-[var(--surface-1)] border border-[var(--border)] shadow-[var(--shadow-card)]">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Entrar na sua conta
            </h2>
            <p className="text-sm mt-1 text-[var(--text-secondary)]">
              Use magic link ou Google para acessar
            </p>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-5 text-center text-xs text-[var(--text-secondary)]">
          Não tem conta?{' '}
          <a
            href="mailto:contato@prospectfy.com.br"
            className="hover:underline transition-colors text-[var(--primary)]"
          >
            Fale com a gente
          </a>
        </p>

        <p className="mt-4 text-center text-xs text-[var(--text-tertiary)]">
          © {new Date().getFullYear()} Prospectfy — Plataforma de Prospecção Inteligente
        </p>
      </div>
    </div>
  )
}
