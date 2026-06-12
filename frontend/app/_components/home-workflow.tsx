const STEPS = [
  ['01', 'Carga el material', 'Sube video, pega una URL o continua un job desde el historial.'],
  ['02', 'Configura la escena', 'Dibuja zonas, lineas o ROI y ajusta confianza/clases antes de gastar creditos.'],
  ['03', 'Confirma el costo', 'El modal muestra duracion, tarifa, configuracion y saldo disponible.'],
  ['04', 'Descarga evidencia', 'Obtén video anotado, metricas JSON y trazabilidad en el dashboard.'],
]

export function HomeWorkflow() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Workflow</p>
          <h2 className="mt-2 text-3xl font-semibold">De frame crudo a evidencia auditable.</h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          {STEPS.map(([number, title, description]) => (
            <div key={number} className="bg-card p-5">
              <p className="font-mono text-xs text-brand">{number}</p>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
