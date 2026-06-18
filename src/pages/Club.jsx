import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, Check, Loader2 } from 'lucide-react'

const SLOTS = [
  { ordem: 1, label: 'Slot 1' },
  { ordem: 2, label: 'Slot 2' },
  { ordem: 3, label: 'Slot 3' },
  { ordem: 4, label: 'Slot 4' },
]

function SlotCard({ slot: init }) {
  const [slot, setSlot] = useState(init)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ok, setOk] = useState(false)
  const fileRef = useRef()

  function set(field, val) {
    setSlot((s) => ({ ...s, [field]: val }))
  }

  async function uploadImagem(file) {
    setUploading(true)
    const path = init.tipo === 'splash' ? 'splash.jpg' : `slot-${init.ordem}.jpg`
    const { error } = await supabase.storage
      .from('club-images')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (!error) {
      const { data } = supabase.storage.from('club-images').getPublicUrl(path)
      set('imagem_url', data.publicUrl + '?t=' + Date.now())
    }
    setUploading(false)
  }

  async function guardar() {
    setSaving(true)
    const payload = {
      titulo: slot.titulo,
      imagem_url: slot.imagem_url?.split('?')[0] ?? null,
      botao_label: slot.botao_label,
      botao_url: slot.botao_url,
      texto: slot.texto,
      ativo: slot.ativo,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('club_slots').update(payload).eq('ordem', init.ordem)
    setSaving(false)
    setOk(true)
    setTimeout(() => setOk(false), 2000)
  }

  const isSplash = init.tipo === 'splash'

  return (
    <div className="rounded-2xl border border-white/8 bg-surface-1 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">
          {isSplash ? 'Splash — abertura da app' : init.label}
        </h3>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-white/40">Ativo</span>
          <div
            onClick={() => set('ativo', !slot.ativo)}
            className={`relative h-5 w-9 rounded-full transition-colors ${slot.ativo ? 'bg-green-500' : 'bg-white/10'}`}
          >
            <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${slot.ativo ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </label>
      </div>

      {/* Imagem */}
      <div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadImagem(e.target.files[0])} />
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-full h-36 rounded-xl border-2 border-dashed border-white/15 bg-white/3 overflow-hidden flex items-center justify-center hover:border-white/30 transition-colors"
        >
          {slot.imagem_url && (
            <img src={slot.imagem_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className={`flex flex-col items-center gap-1 ${slot.imagem_url ? 'bg-black/50 rounded-lg px-3 py-2' : ''}`}>
            {uploading
              ? <Loader2 size={18} className="text-white/60 animate-spin" />
              : <Upload size={18} className="text-white/40" />}
            <span className="text-xs text-white/40">{uploading ? 'A carregar…' : slot.imagem_url ? 'Trocar imagem' : 'Carregar imagem'}</span>
          </div>
        </button>
      </div>

      {/* Campos */}
      {!isSplash && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-white/40 uppercase tracking-wide">Título</label>
            <input
              value={slot.titulo ?? ''}
              onChange={(e) => set('titulo', e.target.value)}
              placeholder="Título sobre a imagem"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-white/40 uppercase tracking-wide">Label do botão</label>
              <input
                value={slot.botao_label ?? ''}
                onChange={(e) => set('botao_label', e.target.value)}
                placeholder="Ex: Ver mais"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-white/40 uppercase tracking-wide">URL do botão</label>
              <input
                value={slot.botao_url ?? ''}
                onChange={(e) => set('botao_url', e.target.value)}
                placeholder="https://..."
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25"
              />
            </div>
          </div>
        </>
      )}

      {isSplash && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-white/40 uppercase tracking-wide">Texto</label>
          <textarea
            value={slot.texto ?? ''}
            onChange={(e) => set('texto', e.target.value)}
            placeholder="Texto da mensagem de abertura (pode deixar vazio se só tiver imagem)"
            rows={4}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 resize-none"
          />
        </div>
      )}

      <button
        onClick={guardar}
        disabled={saving}
        className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
          ok
            ? 'bg-green-500/20 border border-green-500/40 text-green-400'
            : 'bg-white/8 border border-white/12 text-white hover:bg-white/12'
        } disabled:opacity-40`}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} /> : null}
        {ok ? 'Guardado' : 'Guardar'}
      </button>
    </div>
  )
}

export function Club() {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('club_slots').select('*').order('ordem')
      .then(({ data }) => { setSlots(data ?? []); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-white/30 text-sm">A carregar…</div>
  )

  const slotCards = slots.filter((s) => s.tipo === 'slot')
  const splash = slots.find((s) => s.tipo === 'splash')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-white mb-6">Club — Gestão de Conteúdo</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {slotCards.map((s, i) => (
          <SlotCard key={s.id} slot={{ ...s, label: SLOTS[i]?.label ?? `Slot ${s.ordem}` }} />
        ))}
      </div>

      {splash && (
        <SlotCard slot={{ ...splash, label: 'Splash' }} />
      )}
    </div>
  )
}
