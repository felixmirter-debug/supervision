import { Nav } from '@/components/nav'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SERVICES } from '@/lib/services'

export default function Home() {
  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-20 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-6">
          <div className="flex justify-center">
            <Eye className="h-16 w-16 text-brand" />
          </div>
          <h1 className="bg-gradient-to-r from-brand to-brand-secondary bg-clip-text text-5xl font-bold text-transparent">
            Computer Vision as a Service
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            5 servicios de visión por computadora alimentados por YOLOv8 + supervision.
            60 créditos gratis al registrarte — sin tarjeta de crédito.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/login" className={cn(buttonVariants({ size: 'lg' }))}>
              Empezar gratis — 60 créditos
            </Link>
            <Link href="/services" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Ver servicios
            </Link>
          </div>
        </section>

        {/* Services grid */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-center">Servicios disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SERVICES.map((s) => {
              const Icon = s.icon
              return (
                <Card key={s.slug} className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${s.color}`} />
                    <h3 className="font-semibold text-sm">{s.label}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    desde {s.creditsPerSec} cr/s
                  </p>
                </Card>
              )
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="text-center space-y-3">
          <h2 className="text-xl font-semibold">¿Cómo funciona?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
            {[
              { step: '1', title: 'Sube tu video', desc: 'Desde archivo, URL o webcam en tiempo real.' },
              { step: '2', title: 'Confirma el costo', desc: 'Ve exactamente cuántos créditos se usarán antes de procesar.' },
              { step: '3', title: 'Descarga el resultado', desc: 'Video anotado + métricas JSON en segundos.' },
            ].map((item) => (
              <div key={item.step} className="space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft font-bold text-brand">
                  {item.step}
                </div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
