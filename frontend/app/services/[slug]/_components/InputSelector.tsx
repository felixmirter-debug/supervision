'use client'

import { useRef } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Upload, Link2, Loader2 } from 'lucide-react'

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
    <Tabs defaultValue="upload">
      <TabsList>
        <TabsTrigger value="upload">
          <Upload className="h-4 w-4 mr-1.5" />
          Archivo
        </TabsTrigger>
        <TabsTrigger value="url">
          <Link2 className="h-4 w-4 mr-1.5" />
          URL
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upload" className="pt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="file-input">Video (MP4, AVI, MOV)</Label>
          <Input
            id="file-input"
            type="file"
            accept="video/*"
            ref={fileRef}
            className="cursor-pointer"
          />
        </div>
        <Button onClick={handleUpload} disabled={loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Calcular costo
        </Button>
      </TabsContent>

      <TabsContent value="url" className="pt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="url-input">URL del video</Label>
          <Input
            id="url-input"
            type="url"
            placeholder="https://..."
            ref={urlRef}
          />
        </div>
        <Button onClick={handleUrl} disabled={loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Calcular costo
        </Button>
      </TabsContent>
    </Tabs>
  )
}
