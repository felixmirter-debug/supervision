'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Boxes, Eye, LayoutDashboard, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import { formatCredits } from '@/lib/formatters'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'

export function Nav() {
  const { user, profile } = useAuthStore()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-card/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 font-semibold">
          <span className="flex size-9 items-center justify-center rounded-md border border-brand-border bg-brand-soft">
            <Eye className="h-4 w-4 text-brand" />
          </span>
          <span className="hidden sm:inline">CV SaaS</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/services"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden gap-1.5 sm:inline-flex')}
          >
            <Boxes className="h-4 w-4" />
            Servicios
          </Link>
          <ThemeToggle />
          {user ? (
            <>
              {profile && (
                <Badge variant="secondary" className="hidden font-mono sm:inline-flex">
                  {formatCredits(profile.credits)}
                </Badge>
              )}
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              {profile?.role === 'admin' && (
                <Link href="/admin" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                  Admin
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={signOut} aria-label="Cerrar sesion">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Link href="/login" className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
              Iniciar sesion
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
