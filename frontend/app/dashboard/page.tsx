'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Nav } from '@/components/nav'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { listJobs } from '@/lib/api'
import { CreditsCard } from './_components/CreditsCard'
import { JobHistoryTable } from './_components/JobHistoryTable'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 10

export default function DashboardPage() {
  const router = useRouter()
  const params = useSearchParams()
  const page = Math.max(0, Number(params.get('page') ?? 0))

  const { session, profile, isLoading } = useAuthStore()

  useEffect(() => {
    if (!isLoading && !session) router.replace('/login')
  }, [isLoading, session, router])

  const { data, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', page],
    queryFn: () => listJobs(session!.access_token, PAGE_SIZE, page * PAGE_SIZE),
    enabled: !!session,
  })

  function setPage(p: number) {
    const url = new URL(window.location.href)
    url.searchParams.set('page', String(p))
    router.push(url.pathname + url.search)
  }

  if (isLoading || !profile) {
    return (
      <>
        <Nav />
        <div className="max-w-5xl mx-auto px-4 py-10 text-muted-foreground text-sm">Cargando…</div>
      </>
    )
  }

  const jobs = data?.jobs ?? []
  const hasMore = jobs.length === PAGE_SIZE

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Link href="/services" className={cn(buttonVariants({ variant: 'default' }))}>
            Nuevo job
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <CreditsCard profile={profile} />
          </div>

          <div className="md:col-span-2 space-y-4">
            <h2 className="font-semibold">Historial de jobs</h2>
            {jobsLoading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : (
              <JobHistoryTable jobs={jobs} />
            )}

            {(page > 0 || hasMore) && (
              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <span className="text-sm text-muted-foreground">Página {page + 1}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
