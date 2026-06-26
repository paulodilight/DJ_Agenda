import { useState, useRef } from 'react'
import { X, Camera, ImageIcon, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

async function uploadFoto(file) {
  const ext  = file.name.split('.').pop()
  const path = `${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('ocorrencias').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('ocorrencias').getPublicUrl(path).data.publicUrl
}

export function ModalNovaOcorrencia({ onFechar, onCriada, nomeUtilizador, tipoUtilizador, espacos = [], espacoIdInicial = null }) {
  const [titulo,    setTitulo]    = useState('')
  const [descricao, setDescricao] = useState('')
  const [espacoId,  setEspacoId]  = useState(espacoIdInicial ?? '')
  const [fotoUrl,   setFotoUrl]   = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [aEnviar,   setAEnviar]   = useState(false)
  const camaraRef  = useRef(null)
  const galeriaRef = useRef(null)

  const onFoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAEnviar(true)
    try {
      setFotoUrl(await uploadFoto(file))
    } catch (err) {
      alert('Erro ao enviar foto: ' + err.message)
    } finally {
      setAEnviar(false)
      e.target.value = ''
    }
  }

  const gravar = async () => {
    if (!titulo.trim()) return
    setLoading(true)
    try {
      const { error } = await supabase.from('ocorrencias').insert({
        titulo:             titulo.trim(),
        descricao:          descricao.trim() || null,
        foto_url:           fotoUrl,
        espaco_id:          espacoId || null,
        registado_por:      nomeUtilizador,
        registado_por_tipo: tipoUtilizador,
        data_ocorrencia:    new Date().toISOString().slice(0, 10),
      })
      if (error) throw error
      onCriada?.()
      onFechar()
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]">

        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <p className="text-[15px] font-bold text-accent">Nova Ocorrência</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">

          {espacos.length > 0 && !espacoIdInicial && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1 block">Local</label>
              <select value={espacoId} onChange={e => setEspacoId(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] text-accent focus:outline-none focus:border-white/25">
                <option value="">— Sem local específico —</option>
                {espacos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1 block">Ocorrência *</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Subwoofer com avaria"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25" />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1 block">Descrição</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              rows={3} placeholder="Detalhe o problema…"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25 resize-none" />
          </div>

          {/* Foto */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1.5 block">Foto</label>
            {fotoUrl ? (
              <div className="relative">
                <img src={fotoUrl} alt="Foto" className="w-full max-h-40 object-cover rounded-lg border border-border/40" />
                <button onClick={() => setFotoUrl(null)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => camaraRef.current?.click()} disabled={aEnviar}
                  className="flex-1 py-2.5 rounded-lg border border-dashed border-border/60 text-accent-subtle hover:border-white/20 hover:text-accent transition-colors flex items-center justify-center gap-1.5 text-[12px] disabled:opacity-50">
                  <Camera size={14} />
                  {aEnviar ? 'A enviar…' : 'Câmara'}
                </button>
                <button onClick={() => galeriaRef.current?.click()} disabled={aEnviar}
                  className="flex-1 py-2.5 rounded-lg border border-dashed border-border/60 text-accent-subtle hover:border-white/20 hover:text-accent transition-colors flex items-center justify-center gap-1.5 text-[12px] disabled:opacity-50">
                  <ImageIcon size={14} />
                  {aEnviar ? 'A enviar…' : 'Galeria'}
                </button>
              </div>
            )}
            <input ref={camaraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={onFoto} />
            <input ref={galeriaRef} type="file" accept="image/*" className="hidden" onChange={onFoto} />
          </div>

          <p className="text-[11px] text-accent-subtle/60">Registado por: <strong className="text-accent-subtle">{nomeUtilizador}</strong></p>
        </div>

        <div className="px-5 py-3 border-t border-border/40 flex gap-2 shrink-0">
          <button onClick={onFechar}
            className="flex-1 py-2.5 rounded-xl border border-border text-accent-subtle text-[13px] font-semibold hover:bg-surface-2 transition-colors">
            Cancelar
          </button>
          <button onClick={gravar} disabled={!titulo.trim() || loading}
            className="flex-1 py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/15 text-amber-400 text-[13px] font-semibold hover:bg-amber-400/25 transition-colors disabled:opacity-40">
            {loading ? 'A gravar…' : 'Registar'}
          </button>
        </div>
      </div>
    </div>
  )
}
