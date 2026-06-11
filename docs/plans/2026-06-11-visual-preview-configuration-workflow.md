# Visual Preview And CV Configuration Workflow

Fecha: 2026-06-11
Estado: pendiente de aprobacion por pasos

## Estado De Implementacion

Implementado el 2026-06-11:

- Contrato frontend `ProcessingConfig`.
- Migracion `jobs.processing_config`.
- Endpoints `GET /jobs/{job_id}/preview-frame` y `POST /jobs/{job_id}/preview`.
- Etapa `configuring` en `/services/[slug]`.
- Canvas responsive con edicion de poligonos, lineas y ROI.
- Preview anotado por muestra sin descontar creditos.
- `zone_counting` con modo `inside` y `entry_exit`.
- `traffic` leyendo linea desde configuracion visual.
- ROI, confianza y filtros de clase aplicados a procesadores.
- Confirmacion, resultado e historial mostrando resumen de configuracion.
- WebSocket preparado para recibir `processing_config`.
- Correccion de facturacion basica del WebSocket.

Pendiente deliberado:

- `SpeedEstimator` no se implemento porque la version local verificada de `supervision` (`0.28.0`) no expone `sv.SpeedEstimator`.
- Preview de clip corto H.264 queda como evolucion posterior; el MVP actual devuelve frame anotado y metricas preliminares.

## Objetivo

Agregar una etapa de previsualizacion y configuracion visual antes de confirmar el procesamiento de un video. El usuario debe poder ver el frame de referencia, trazar zonas o lineas, ajustar filtros por servicio y revisar una muestra anotada antes de gastar creditos en el procesamiento completo.

## Evidencia Del Repo Actual

- La pantalla principal del servicio vive en `frontend/app/services/[slug]/page.tsx`.
- La entrada actual solo permite `upload` o `url` en `frontend/app/services/[slug]/_components/InputSelector.tsx`.
- El flujo actual pasa directo de calcular costo a `ConfirmModal`, sin etapa visual de configuracion.
- El backend acepta `zone_config` en `backend/routers/services/router.py`, pero no hay UI que lo construya.
- `backend/routers/services/_processors.py` ya usa `sv.PolygonZone` para `zone_counting`.
- `backend/routers/services/_processors.py` ya usa `sv.LineZone` para `traffic`, pero el router no pasa `line_start` ni `line_end`.
- `backend/routers/stream.py` ya puede devolver frames anotados por WebSocket, pero procesa con config vacia `{}`.
- La version local verificada de `supervision` es `0.28.0`; `sv.ByteTrack` existe pero emite deprecation warning.

## Principios De Producto

- La previsualizacion debe vivir dentro del flujo actual de `/services/[slug]`, no en una ruta separada.
- El usuario no debe confirmar creditos hasta revisar la configuracion visual.
- Las coordenadas deben guardarse en coordenadas normalizadas o acompaniadas por `frame_width` y `frame_height`, para que funcionen aunque el canvas escale.
- El backend debe ser la fuente de verdad para convertir esa configuracion al formato de `supervision`.
- Cada accion irreversible o que use creditos mantiene confirmacion modal.
- No se arranca servidor para implementar o probar salvo pedido explicito.

## Flujo Propuesto

1. Usuario abre `/services/[slug]`.
2. Usuario sube archivo o pega URL en `InputSelector`.
3. Backend crea el `job` en estado `estimating` y calcula duracion/costo.
4. Frontend entra a etapa `configuring`.
5. Frontend pide un frame de referencia del job.
6. Usuario dibuja zonas, lineas, ROI o filtros segun el servicio.
7. Usuario ejecuta una muestra corta de previsualizacion.
8. Frontend muestra frame/video anotado y metricas preliminares.
9. Usuario abre `ConfirmModal`.
10. Usuario confirma y se procesa el video completo con la misma configuracion.

## Contrato De Configuracion

Reemplazar `zone_config` por `processing_config` tipado por servicio.

```ts
type Point = {
  x: number
  y: number
}

type NormalizedPoint = {
  x: number // 0..1
  y: number // 0..1
}

type ZoneConfig = {
  id: string
  label: string
  points: NormalizedPoint[]
}

type LineConfig = {
  id: string
  label: string
  start: NormalizedPoint
  end: NormalizedPoint
  direction?: 'in_out' | 'out_in'
}

type RoiConfig = {
  id: string
  label: string
  points: NormalizedPoint[]
}

type ProcessingConfig = {
  frame_width: number
  frame_height: number
  confidence?: number
  class_filter?: string[]
  zones?: ZoneConfig[]
  lines?: LineConfig[]
  rois?: RoiConfig[]
  mode?: 'inside' | 'entry_exit'
}
```

## Fases Y Pasos

### Fase 1: Contrato y persistencia

- [ ] Paso 1.1: Crear tipos frontend para `ProcessingConfig`.
  - Archivos: `frontend/lib/api.ts`, posible `frontend/lib/processing-config.ts`.
  - Aprobacion requerida antes de implementar.
  - Verificacion: `pnpm tsc --noEmit`.

- [ ] Paso 1.2: Cambiar `ProcessRequest` para aceptar `processing_config`.
  - Archivos: `backend/routers/services/router.py`, `backend/routers/services/_pipeline.py`.
  - Mantener compatibilidad temporal con `zone_config` si ya hay UI o jobs viejos.
  - Aprobacion requerida antes de implementar.
  - Verificacion: tests backend acotados.

- [ ] Paso 1.3: Agregar `jobs.processing_config jsonb` en Supabase.
  - Archivo: nueva migracion en `supabase/migrations/`.
  - Tambien actualizar o crear `docs/DB_SCHEMA_LIVE.md`, porque `CLAUDE.md` lo exige para cambios de BD.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual: consultar que la columna exista.

### Fase 2: Frame de referencia

- [ ] Paso 2.1: Crear endpoint para obtener un frame de preview del job.
  - Ruta sugerida: `GET /jobs/{job_id}/preview-frame?at=0`.
  - Respuesta sugerida: JPEG o JSON con `image_base64`, `width`, `height`, `duration_sec`.
  - Debe validar JWT, propietario del job y estado permitido.
  - Aprobacion requerida antes de implementar.
  - Verificacion: test backend con video temporal.

- [ ] Paso 2.2: Mostrar el frame de referencia despues de estimar costo.
  - Archivos: `frontend/app/services/[slug]/page.tsx`, nuevo componente en `_components/`.
  - Nueva etapa: `configuring`.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual:
    - Abrir `/services/zone-counting`.
    - Subir video.
    - Confirmar que aparece un frame antes del modal de costo.

### Fase 3: Editor visual de overlays

- [ ] Paso 3.1: Crear componente base `VideoFrameCanvas`.
  - Ubicacion: `frontend/app/services/[slug]/_components/VideoFrameCanvas.tsx`.
  - Responsabilidades: renderizar imagen, escalar coordenadas, manejar pointer events, exponer puntos normalizados.
  - Sin libreria extra inicialmente; canvas/SVG overlay nativo es suficiente.
  - Aprobacion requerida antes de implementar.
  - Verificacion: puntos no se desplazan al cambiar tamano de pantalla.

- [ ] Paso 3.2: Crear editor de poligonos para `zone-counting`.
  - Ubicacion: `frontend/app/services/[slug]/_components/ZoneEditor.tsx`.
  - Controles esperados: agregar zona, cerrar poligono, mover punto, borrar punto, borrar zona, reset a frame completo.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual:
    - Dibujar poligono de 4 puntos.
    - Mover un punto.
    - Borrar zona.
    - Continuar sin solapar texto o controles en mobile/desktop.

- [ ] Paso 3.3: Crear editor de linea para `traffic`.
  - Ubicacion: `frontend/app/services/[slug]/_components/LineEditor.tsx`.
  - Controles esperados: mover inicio, mover final, invertir direccion, reset a linea horizontal media.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual:
    - Dibujar linea diagonal.
    - Invertir direccion.
    - Confirmar que el resumen muestra entrada/salida.

- [ ] Paso 3.4: Crear editor ROI reutilizable para `ppe-detection` y `quality-control`.
  - Ubicacion: `frontend/app/services/[slug]/_components/RoiEditor.tsx`.
  - Reutiliza poligonos, pero con semantica de area de inspeccion.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual: dibujar area y ver resumen antes de confirmar.

### Fase 4: Preview anotado antes de cobrar completo

- [ ] Paso 4.1: Crear endpoint de muestra anotada.
  - Ruta sugerida: `POST /jobs/{job_id}/preview`.
  - Body: `{ processing_config, seconds?: 3, sample_fps?: 2 }`.
  - Respuesta MVP: primer frame anotado + metricas preliminares.
  - Respuesta posterior: clip corto H.264 con los mismos ajustes que el pipeline final.
  - Aprobacion requerida antes de implementar.
  - Verificacion: no debe reservar ni descontar creditos.

- [ ] Paso 4.2: Conectar boton "Previsualizar muestra" en la etapa `configuring`.
  - Archivos: `page.tsx`, componentes de editor, `frontend/lib/api.ts`.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual:
    - Dibujar zona.
    - Ejecutar previsualizacion.
    - Ver frame anotado con poligono y cajas.
    - Luego abrir confirmacion.

### Fase 5: Procesadores por servicio

- [ ] Paso 5.1: Normalizar configuracion en backend.
  - Crear helpers para convertir puntos normalizados a pixeles.
  - Validar minimo de puntos: poligono >= 3, linea = 2.
  - Aprobacion requerida antes de implementar.
  - Verificacion: tests unitarios de conversion y validacion.

- [ ] Paso 5.2: Mejorar `zone_counting`.
  - Usar `zones` de `processing_config`.
  - Mantener default de frame completo si no hay zona.
  - Agregar modo `inside` primero.
  - Aprobacion requerida antes de implementar.
  - Verificacion: processor test con zona custom.

- [ ] Paso 5.3: Agregar modo `entry_exit` para zonas.
  - Requiere tracking por `tracker_id` y estado anterior dentro/fuera por zona.
  - No debe prometer entrada/salida con solo `PolygonZone.trigger`.
  - Aprobacion requerida antes de implementar.
  - Verificacion: test con detecciones simuladas cruzando zona.

- [ ] Paso 5.4: Mejorar `traffic`.
  - Usar `lines[0]` para `LineZone`.
  - Agregar filtros por clases de vehiculos.
  - Aprobacion requerida antes de implementar.
  - Verificacion: processor test con `line_start`/`line_end` derivados.

- [ ] Paso 5.5: Mejorar `tracking`.
  - Mostrar labels con `tracker_id` y clase.
  - Revisar migracion de `sv.ByteTrack` deprecado a la libreria nueva de tracking.
  - Aprobacion requerida antes de implementar.
  - Verificacion: no warnings nuevos en tests donde sea posible.

- [ ] Paso 5.6: Mejorar `ppe-detection` y `quality-control`.
  - Aplicar ROI antes o despues de deteccion segun costo/calidad.
  - Para `quality-control`, mantener `HeatMapAnnotator`.
  - Aprobacion requerida antes de implementar.
  - Verificacion: metrics solo cuentan dentro de ROI.

### Fase 6: Confirmacion, resultados e historial

- [ ] Paso 6.1: Expandir `ConfirmModal` con resumen de configuracion.
  - Mostrar numero de zonas, lineas, ROI, confianza y clases.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual: el usuario entiende que configuracion sera usada en el proceso final.

- [ ] Paso 6.2: Guardar y mostrar configuracion en resultados/historial.
  - Archivos: `ResultView.tsx`, `JobHistoryTable.tsx`, API types.
  - Aprobacion requerida antes de implementar.
  - Verificacion manual: desde dashboard se puede abrir resultado y entender como fue configurado.

- [ ] Paso 6.3: Persistir etapa y job en URL query params.
  - Requisito de `CLAUDE.md`: estado relevante en URL.
  - Ejemplo: `/services/traffic?job=e18...&stage=configuring`.
  - Aprobacion requerida antes de implementar.
  - Verificacion: recargar la pagina conserva el contexto.

### Fase 7: WebSocket y camara en vivo

- [ ] Paso 7.1: Extender primer mensaje del WebSocket para aceptar `processing_config`.
  - Archivo: `backend/routers/stream.py`.
  - Debe pasar config al processor en vez de `{}`.
  - Aprobacion requerida antes de implementar.
  - Verificacion: frame de webcam respeta zona/linea.

- [ ] Paso 7.2: Corregir facturacion de stream antes de exponerlo en UI.
  - La funcion `_deduct_credits` llama `refund_credits` con payload vacio antes del update directo; eso debe corregirse antes de usar webcam en produccion.
  - Aprobacion requerida antes de implementar.
  - Verificacion: test de saldo insuficiente y descuento correcto.

## Orden Recomendado

1. Fase 1 completa: contrato y persistencia.
2. Fase 2 completa: frame de referencia.
3. Fase 3.1 a 3.3: canvas, poligonos y lineas.
4. Fase 4: preview anotado.
5. Fase 5.1, 5.2 y 5.4: backend para zone-counting y traffic.
6. Fase 6: confirmacion e historial.
7. Fase 5.3, 5.5, 5.6 y Fase 7: mejoras avanzadas.

## Primer Paso Implementable

Paso 1.1 propuesto:

- Crear `frontend/lib/processing-config.ts`.
- Definir tipos compartidos frontend.
- Actualizar `frontend/lib/api.ts` para que `processService` acepte `processing_config`.
- No cambiar backend todavia en este paso.

Checklist manual/test:

- Ejecutar `cd frontend && pnpm tsc --noEmit`.
- Confirmar que el flujo actual sigue tipando.
- Confirmar que no se cambio comportamiento visible.
