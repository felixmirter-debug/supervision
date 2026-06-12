'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/theme-toggle'
import { VisionPreview } from '@/components/vision-preview'
import { toast } from 'sonner'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginFallback() {
  return <main className="min-h-screen px-4 py-5 text-sm text-muted-foreground">Cargando...</main>
}

function LoginContent() {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = params.get('redirectTo') || '/dashboard'
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('Cuenta creada. Revisa tu email para confirmar')
        setMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push(redirectTo)
        router.refresh()
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error de autenticacion')
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink() {
    if (!email) {
      toast.error('Ingresa tu email primero')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({ email })
      if (error) throw error
      toast.success('Magic link enviado. Revisa tu email')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error enviando magic link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex min-h-screen flex-col justify-between px-4 py-5 sm:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 font-semibold">
            <span className="flex size-9 items-center justify-center rounded-md border border-brand-border bg-brand-soft">
              <Eye className="size-4 text-brand" />
            </span>
            CV SaaS
          </div>
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-md py-12">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">
              {mode === 'signin' ? 'Acceso' : 'Registro'}
            </p>
            <h1 className="mt-2 text-4xl font-semibold">
              {mode === 'signin' ? 'Continua tu procesamiento.' : 'Crea tu workspace visual.'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Entra para revisar creditos, configurar jobs y descargar evidencia procesada.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contrasena</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'signin' ? 'Iniciar sesion' : 'Crear cuenta'}
            </Button>
          </form>

          <div className="mt-3 space-y-3">
            <Button variant="outline" className="w-full" onClick={handleMagicLink} disabled={loading}>
              Enviar magic link
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === 'signin' ? 'No tienes cuenta?' : 'Ya tienes cuenta?'}{' '}
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              >
                {mode === 'signin' ? 'Registrate' : 'Inicia sesion'}
              </button>
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">YOLOv8 + supervision, con creditos confirmados antes de procesar.</p>
      </section>

      <section className="hidden min-h-screen items-center border-l border-border bg-muted/30 p-8 lg:flex">
        <VisionPreview compact className="w-full" />
      </section>
    </main>
  )
}
