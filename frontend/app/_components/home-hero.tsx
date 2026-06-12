import Link from 'next/link'
import { ArrowRight, Cpu, ShieldCheck, Sparkles } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { VisionPreview } from '@/components/vision-preview'
import { cn } from '@/lib/utils'

export function HomeHero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 vision-grid opacity-60" />
      <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="max-w-2xl space-y-7">
          <div className="inline-flex items-center gap-2 rounded-md border border-brand-border bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
            <Sparkles className="size-3.5" />
            60 creditos gratis para probar modelos reales
          </div>
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              CV SaaS
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
              Vision pipelines listos para operar.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Procesa video, URL o webcam con YOLOv8 + supervision. Configura zonas,
              revisa creditos antes de ejecutar y descarga resultados anotados.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
              Empezar con 60 creditos
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/services" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Ver servicios
            </Link>
          </div>
          <div className="grid max-w-lg grid-cols-2 gap-3 pt-2 text-sm sm:grid-cols-3">
            {[
              { icon: Cpu, label: 'YOLOv8', value: 'deteccion' },
              { icon: ShieldCheck, label: 'Creditos', value: 'confirmados' },
              { icon: Sparkles, label: 'Resultados', value: 'video + JSON' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="rounded-md border border-border bg-card/65 p-3 backdrop-blur">
                  <Icon className="mb-2 size-4 text-brand" />
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.value}</p>
                </div>
              )
            })}
          </div>
        </div>
        <VisionPreview />
      </div>
    </section>
  )
}
