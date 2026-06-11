import { Nav } from '@/components/nav'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SERVICES } from '@/lib/services'

export default function ServicesPage() {
  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Servicios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Selecciona un servicio para procesar tu video.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map((s) => {
            const Icon = s.icon
            return (
              <Card key={s.slug} className="p-5 flex flex-col gap-4 hover:border-border/80 transition-colors">
                <div className="flex items-start gap-3">
                  <Icon className={`h-6 w-6 mt-0.5 shrink-0 ${s.color}`} />
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm">{s.label}</h2>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs font-mono text-muted-foreground">
                    {s.creditsPerSec} cr/s
                  </span>
                  <Link
                    href={`/services/${s.slug}`}
                    className={cn(buttonVariants({ size: 'sm' }))}
                  >
                    Usar
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      </main>
    </>
  )
}
