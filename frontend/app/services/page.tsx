import Link from 'next/link'
import { ArrowRight, SlidersHorizontal } from 'lucide-react'
import { Nav } from '@/components/nav'
import { buttonVariants } from '@/components/ui/button'
import { SERVICES } from '@/lib/services'
import { cn } from '@/lib/utils'

export default function ServicesPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="mb-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Servicios</p>
            <h1 className="mt-2 text-4xl font-semibold">Elige el pipeline para tu video.</h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground lg:justify-self-end">
            Todos los servicios usan el mismo flujo: entrada, estimacion, configuracion visual,
            confirmacion de creditos y resultado descargable.
          </p>
        </section>

        <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
          {SERVICES.map((service) => {
            const Icon = service.icon
            return (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="group flex min-h-80 flex-col justify-between bg-card p-5 transition-colors hover:bg-brand-soft"
              >
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-md border border-brand-border bg-brand-soft">
                      <Icon className="size-5 text-brand" />
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">{service.label}</h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{service.description}</p>
                  </div>
                </div>
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <SlidersHorizontal className="size-3.5 text-brand" />
                    Configurable antes de procesar
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{service.creditsPerSec} cr/s</span>
                    <span className={cn(buttonVariants({ size: 'sm' }), 'pointer-events-none')}>
                      Usar
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </section>
      </main>
    </>
  )
}
