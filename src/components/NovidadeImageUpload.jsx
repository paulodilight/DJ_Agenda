import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ImagePlus, X, Loader2 } from 'lucide-react'

export function NovidadeImageUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `novidades/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('club-images').upload(path, file, { contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from('club-images').getPublicUrl(path)
      onChange(data.publicUrl)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-accent-muted font-medium">Imagem</span>
      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={value} alt="" className="w-full max-h-48 object-cover" />
          <button type="button" onClick={() => onChange('')}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 w-full h-24 rounded-xl border border-dashed border-border bg-surface-1 text-accent-subtle hover:border-amber-500/40 hover:text-amber-400 transition-colors text-sm">
          {uploading
            ? <><Loader2 size={15} className="animate-spin" />A carregar...</>
            : <><ImagePlus size={15} />Carregar imagem</>}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
    </div>
  )
}
