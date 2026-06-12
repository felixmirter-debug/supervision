import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SERVICES } from '@/lib/services'

export function HomeServices() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Servicios</p>
          <h2 className="mt-2 text-3xl font-semibold">Cinco flujos de vision, un mismo panel.</h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Cada servicio comparte estimacion de creditos, configuracion previa y resultados descargables.
        </p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
        {SERVICES.map((service) => {
          const Icon = service.icon
          return (
            <Link
              key={service.slug}
              href={`/services/${service.slug}`}
              className="group min-h-64 bg-card p-5 transition-colors hover:bg-brand-soft"
            >
              <div className="flex h-full flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Icon className="size-6 text-brand" />
                    <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{service.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tarifa</span>
                  <span className="font-mono text-sm">{service.creditsPerSec} cr/s</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
