'use client'

import { useRef } from 'react'
import { Link2, Loader2, UploadCloud } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export type InputType = 'upload' | 'url'

interface Props {
  onSubmit: (type: InputType, file?: File, url?: string) => void
  loading: boolean
}

export function InputSelector({ onSubmit, loading }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    onSubmit('upload', file)
  }

  function handleUrl() {
    const url = urlRef.current?.value.trim()
    if (!url) return
    onSubmit('url', undefined, url)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Entrada</p>
          <h2 className="mt-2 text-3xl font-semibold">Carga el material y revisa el video.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Podras reproducirlo, acercarte, cortar el segmento y confirmar creditos antes de analizar.
          </p>
        </div>

        <Tabs defaultValue="upload">
          <TabsList>
            <TabsTrigger value="upload">
              <UploadCloud className="mr-1.5 h-4 w-4" />
              Archivo
            </TabsTrigger>
            <TabsTrigger value="url">
              <Link2 className="mr-1.5 h-4 w-4" />
              URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="pt-4">
            <div className="rounded-lg border border-dashed border-brand-border bg-brand-soft p-5">
              <Label htmlFor="file-input">Video (MP4, AVI, MOV)</Label>
              <Input id="file-input" type="file" accept="video/*" ref={fileRef} className="mt-3 cursor-pointer" />
              <Button onClick={handleUpload} disabled={loading} className="mt-4 w-full">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Subir y revisar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="url" className="pt-4">
            <div className="rounded-lg border border-border bg-card/65 p-5">
              <Label htmlFor="url-input">URL del video</Label>
              <Input id="url-input" type="url" placeholder="https://..." ref={urlRef} className="mt-3" />
              <Button onClick={handleUrl} disabled={loading} className="mt-4 w-full">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Revisar URL
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="vision-grid rounded-lg border border-border bg-slate-950 p-5 text-white">
        <UploadCloud className="mb-8 size-8 text-brand" />
        <p className="text-sm font-medium">Formatos operativos</p>
        <div className="mt-5 space-y-3 text-sm text-white/70">
          <p>Archivo local para procesamiento batch.</p>
          <p>URL de video para material ya publicado.</p>
          <p>Webcam en tiempo real se conserva para el flujo de streaming.</p>
        </div>
      </div>
    </div>
  )
}
