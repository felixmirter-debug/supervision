'use client'

import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatCredits } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { Eye, LayoutDashboard, LogOut } from 'lucide-react'
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
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <Eye className="h-5 w-5 text-brand" />
          <span>CV SaaS</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {user ? (
            <>
              {profile && (
                <Badge variant="secondary" className="font-mono">
                  {formatCredits(profile.credits)}
                </Badge>
              )}
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1')}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              {profile?.role === 'admin' && (
                <Link
                  href="/admin"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                >
                  Admin
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Link href="/login" className={cn(buttonVariants({ size: 'sm' }))}>
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
