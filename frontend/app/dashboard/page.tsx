'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CirclePlus, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { Nav } from '@/components/nav'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { listJobs } from '@/lib/api'
import { CreditsCard } from './_components/CreditsCard'
import { JobHistoryTable } from './_components/JobHistoryTable'

const PAGE_SIZE = 10

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardFallback() {
  return (
    <>
      <Nav />
      <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-muted-foreground">Cargando...</div>
    </>
  )
}

function DashboardContent() {
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
    return <DashboardFallback />
  }

  const jobs = data?.jobs ?? []
  const hasMore = jobs.length === PAGE_SIZE
  const doneCount = jobs.filter((job) => job.status === 'done').length
  const activeCount = jobs.filter((job) => job.status === 'processing' || job.status === 'confirmed').length

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Dashboard</p>
            <h1 className="mt-2 text-4xl font-semibold">Control de procesamiento.</h1>
          </div>
          <Link href="/services" className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
            <CirclePlus className="size-4" />
            Nuevo job
          </Link>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <CreditsCard profile={profile} />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Jobs visibles', value: jobs.length, icon: Clock },
              { label: 'En curso', value: activeCount, icon: Loader2 },
              { label: 'Completados', value: doneCount, icon: CheckCircle2 },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="surface-panel rounded-lg p-5">
                  <Icon className="mb-5 size-5 text-brand" />
                  <p className="font-mono text-3xl">{item.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-6 surface-panel rounded-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Historial de jobs</h2>
              <p className="text-sm text-muted-foreground">Resultados, costos y configuraciones recientes.</p>
            </div>
            <Badge variant="secondary" className="font-mono">Pagina {page + 1}</Badge>
          </div>
          {jobsLoading ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">Cargando jobs...</div>
          ) : (
            <JobHistoryTable jobs={jobs} />
          )}
        </section>

        {(page > 0 || hasMore) && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
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
      </main>
    </>
  )
}
