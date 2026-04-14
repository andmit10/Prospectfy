'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { clientEnv } from '@/lib/env'

type Mode = 'signin' | 'signup' | 'signup_done'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const confirmed = params.get('confirmed') === 'true'
  const authError = params.get('error')

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  // ── Sign In ────────────────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        toast.error('Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.')
      } else if (error.message.toLowerCase().includes('invalid login')) {
        toast.error('E-mail ou senha incorretos.')
      } else {
        toast.error(error.message)
      }
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  // ── Sign Up ────────────────────────────────────────────────────────────────
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/confirm`,
      },
    })
    if (error) {
      toast.error(error.message)
    } else {
      setMode('signup_done')
    }
    setLoading(false)
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────
  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback` },
    })
    if (error) toast.error(error.message)
  }

  // ── Account created — waiting for confirmation ─────────────────────────────
  if (mode === 'signup_done') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confirme seu e-mail</CardTitle>
          <CardDescription>
            Enviamos um link de confirmação para <strong>{email}</strong>.
            Clique no link no e-mail para ativar sua conta e depois volte aqui para entrar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => setMode('signin')}>
            Já confirmei — ir para login
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      {/* ── Tab switcher ── */}
      <div className="flex border-b">
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === 'signin'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setMode('signin')}
        >
          Entrar
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === 'signup'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setMode('signup')}
        >
          Criar conta
        </button>
      </div>

      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {mode === 'signin' ? 'Acesse sua conta' : 'Crie sua conta gratuitamente'}
        </CardTitle>
        {confirmed && (
          <p className="text-sm text-green-600 font-medium">
            ✓ E-mail confirmado! Entre com sua senha abaixo.
          </p>
        )}
        {authError && (
          <p className="text-sm text-destructive">
            Erro ao confirmar e-mail. Tente novamente.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Sign In form ── */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        )}

        {/* ── Sign Up form ── */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Seu nome</Label>
              <Input
                id="name"
                type="text"
                placeholder="Anderson Mitkiewicz"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email-signup">E-mail</Label>
              <Input
                id="email-signup"
                type="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password-signup">Senha</Label>
              <Input
                id="password-signup"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Button>
          </form>
        )}

        {/* ── Google divider ── */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          Continuar com Google
        </Button>
      </CardContent>
    </Card>
  )
}
