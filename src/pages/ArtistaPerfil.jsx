import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Save, Check } from 'lucide-react'
import { artistasApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

const ESTADO_OPCOES = [
  { value: 'activo',   label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
]

const iCls = 'w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors'

function SecaoTitulo({ label, sub }) {
  return (
    <div className="px-5 py-3.5 border-b border-border/50">
      <p className="text-xs font-semibold text-accent uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[10px] text-accent-subtle/60 mt-0.5">{sub}</p>}
    </div>
  )
}

export function ArtistaPerfil() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNovo   = id === 'novo'

  const [artista, setArtista]       = useState(null)
  const [loadingDados, setLoadingDados] = useState(!isNovo)
  const [erroDados, setErroDados]   = useState(null)

  const [form, setForm]             = useState({
    nome: '', bio: '', instagram_url: '', rede_social_url: '',
    presskit_url: '', estado: 'activo',
  })
  const [saving, setSaving]         = useState(false)
  const [saveErro, setSaveErro]     = useState(null)
  const [saveSucesso, setSaveSucesso] = useState(false)

  const [fotoFile, setFotoFile]     = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const fotoInputRef                = useRef(null)

  // Carregar artista existente
  useEffect(() => {
    if (isNovo) return
    setLoadingDados(true)
    artistasApi.buscar(id)
      .then(data => {
        setArtista(data)
        setForm({
          nome:            data.nome            ?? '',
          bio:             data.bio             ?? '',
          instagram_url:   data.instagram_url   ?? '',
          rede_social_url: data.rede_social_url ?? '',
          presskit_url:    data.presskit_url    ?? '',
          estado:          data.estado          ?? 'activo',
        })
        if (data.foto_url) setFotoPreview(data.foto_url)
      })
      .catch(e => setErroDados(e.message))
      .finally(() => setLoadingDados(false))
  }, [id, isNovo])

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  const uploadFoto = useCallback(async (file, artistaId) => {
    const { error } = await supabase.storage
      .from('dj-fotos')
      .upload(`artistas/${artistaId}`, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage
      .from('dj-fotos')
      .getPublicUrl(`artistas/${artistaId}`)
    return publicUrl
  }, [])

  const guardar = async () => {
    if (!form.nome.trim()) { setSaveErro('Nome obrigatório.'); return }
    setSaving(true)
    setSaveErro(null)
    setSaveSucesso(false)
    try {
      let fotoUrl = artista?.foto_url ?? null
      const savedId = isNovo
        ? (await artistasApi.criar({ ...form })).id
        : id

      if (fotoFile) {
        fotoUrl = await uploadFoto(fotoFile, savedId)
        await artistasApi.actualizar(savedId, { ...form, foto_url: fotoUrl })
      } else if (isNovo) {
        // já criado acima sem foto, nada a fazer
      } else {
        await artistasApi.actualizar(savedId, { ...form })
      }

      setSaveSucesso(true)
      setTimeout(() => setSaveSucesso(false), 3500)
      if (isNovo) navigate(`/artistas/${savedId}`, { replace: true })
    } catch (e) {
      setSaveErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loadingDados) return <LoadingPage />
  if (erroDados)    return <div className="p-6"><Alerta tipo="erro" mensagem={erroDados} /></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Cabeçalho */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-4 shrink-0">
        <button onClick={() => navigate('/artistas')}
          className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent transition-colors">
          <ArrowLeft size={14} />Artistas
        </button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-semibold text-accent">
          {isNovo ? 'Novo Artista' : (artista?.nome ?? '…')}
        </h1>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-5">

          {saveErro   && <Alerta tipo="erro" mensagem={saveErro} />}
          {saveSucesso && <Alerta tipo="sucesso" mensagem="Guardado com sucesso." />}

          {/* Foto */}
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <SecaoTitulo label="Foto" sub="Imagem do artista para o marketing" />
            <div className="px-5 py-4 flex items-center gap-5">
              <div className="relative shrink-0">
                {fotoPreview ? (
                  <img src={fotoPreview} alt="foto"
                    className="w-24 h-24 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="w-24 h-24 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <span className="text-2xl font-bold text-violet-400/40">
                      {(form.nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => fotoInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center text-accent-muted hover:text-accent hover:border-white/20 transition-colors shadow-lg"
                  title="Alterar foto"
                >
                  <Camera size={12} />
                </button>
                <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
              </div>
              {fotoFile && (
                <p className="text-xs text-accent-subtle">
                  <span className="text-status-confirmado">Nova foto seleccionada:</span>{' '}
                  {fotoFile.name}
                </p>
              )}
            </div>
          </div>

          {/* Dados básicos */}
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <SecaoTitulo label="Dados" />
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Nome *</label>
                  <input className={iCls} value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Nome artístico ou nome do projecto…" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Estado</label>
                  <select className={iCls} value={form.estado}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                    {ESTADO_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <SecaoTitulo label="Bio" sub="Texto público sobre o artista — aparece na área do marketing" />
            <div className="px-5 py-4">
              <textarea rows={4} className={clsx(iCls, 'resize-none')}
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="Breve descrição do artista, estilo musical, experiência…" />
            </div>
          </div>

          {/* Links */}
          <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
            <SecaoTitulo label="Links" />
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Instagram</label>
                <input className={iCls} value={form.instagram_url}
                  onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))}
                  placeholder="https://instagram.com/…" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Rede Social (TikTok / Facebook…)</label>
                <input className={iCls} value={form.rede_social_url}
                  onChange={e => setForm(f => ({ ...f, rede_social_url: e.target.value }))}
                  placeholder="https://…" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Presskit</label>
                <input className={iCls} value={form.presskit_url}
                  onChange={e => setForm(f => ({ ...f, presskit_url: e.target.value }))}
                  placeholder="https://…" />
              </div>
            </div>
          </div>

          {/* Guardar */}
          <div className="flex justify-end">
            <Button onClick={guardar} disabled={saving} className="gap-2">
              {saving ? (
                'A guardar…'
              ) : saveSucesso ? (
                <><Check size={14} />Guardado</>
              ) : (
                <><Save size={14} />{isNovo ? 'Criar artista' : 'Guardar alterações'}</>
              )}
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}
