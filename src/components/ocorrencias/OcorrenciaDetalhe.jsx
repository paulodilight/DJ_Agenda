import { useState, useRef } from 'react'
import { X, CheckCircle, Clock, AlertCircle, Camera, ImageIcon, Pencil, Trash2, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'

const STATUS_CFG = {
  aberta:      { label: 'Aberta',      icon: AlertCircle, cls: 'text-red-400 bg-red-400/10 border-red-400/30' },
  em_processo: { label: 'Em processo', icon: Clock,        cls: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  fechada:     { label: 'Fechada',     icon: CheckCircle,  cls: 'text-green-400 bg-green-400/10 border-green-400/30' },
}

const fmtDT = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

async function uploadFoto(file) {
  const ext  = file.name.split('.').pop()
  const path = `intervencoes/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('ocorrencias').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('ocorrencias').getPublicUrl(path).data.publicUrl
}

export function OcorrenciaDetalhe({ ocorrencia, intervencoes = [], onFechar, onAtualizar, onApagar, nomeUtilizador, podeEditar = false }) {
  const [nota,        setNota]        = useState('')
  const [fotoUrl,     setFotoUrl]     = useState(null)
  const [aEnviar,     setAEnviar]     = useState(false)
  const [aFecho,      setAFecho]      = useState(false)
  const [aApagar,     setAApagar]     = useState(false)
  const [aEditar,     setAEditar]     = useState(false)
  const [editTitulo,  setEditTitulo]  = useState(ocorrencia.titulo)
  const [editDescr,   setEditDescr]   = useState(ocorrencia.descricao ?? '')
  const [loading,     setLoading]     = useState(false)
  const camaraRef  = useRef(null)
  const galeriaRef = useRef(null)

  const cfg = STATUS_CFG[ocorrencia.status] ?? STATUS_CFG.aberta
  const Ic  = cfg.icon

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

  const registarNota = async () => {
    if (!nota.trim() && !fotoUrl) return
    setLoading(true)
    await supabase.from('ocorrencias_intervencoes').insert({
      ocorrencia_id: ocorrencia.id,
      nota:          nota.trim() || '(foto)',
      tecnico_nome:  nomeUtilizador,
      foto_url:      fotoUrl,
    })
    if (ocorrencia.status === 'aberta') {
      await supabase.from('ocorrencias').update({ status: 'em_processo' }).eq('id', ocorrencia.id)
    }
    setNota('')
    setFotoUrl(null)
    setLoading(false)
    onAtualizar?.()
  }

  const fecharOcorrencia = async () => {
    setLoading(true)
    if (nota.trim() || fotoUrl) {
      await supabase.from('ocorrencias_intervencoes').insert({
        ocorrencia_id: ocorrencia.id,
        nota:          nota.trim() || '(foto)',
        tecnico_nome:  nomeUtilizador,
        foto_url:      fotoUrl,
      })
    }
    await supabase.from('ocorrencias').update({
      status:      'fechada',
      fechada_em:  new Date().toISOString(),
      fechada_por: nomeUtilizador,
    }).eq('id', ocorrencia.id)
    setNota('')
    setFotoUrl(null)
    setAFecho(false)
    setLoading(false)
    onAtualizar?.()
  }

  const temConteudo = nota.trim() || fotoUrl

  const gravarEdicao = async () => {
    if (!editTitulo.trim()) return
    setLoading(true)
    await supabase.from('ocorrencias').update({
      titulo:    editTitulo.trim(),
      descricao: editDescr.trim() || null,
    }).eq('id', ocorrencia.id)
    setAEditar(false)
    setLoading(false)
    onAtualizar?.()
  }

  const confirmarApagar = async () => {
    setLoading(true)
    await supabase.from('ocorrencias').delete().eq('id', ocorrencia.id)
    setLoading(false)
    onApagar?.()
    onFechar()
  }

  const marcarEmCurso = async () => {
    setLoading(true)
    await supabase.from('ocorrencias').update({ status: 'em_processo' }).eq('id', ocorrencia.id)
    setLoading(false)
    onAtualizar?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-lg max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.cls)}>
                <Ic size={10} />{cfg.label}
              </span>
              {ocorrencia.status === 'aberta' && (
                <button onClick={marcarEmCurso} disabled={loading}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border text-amber-400 bg-amber-400/10 border-amber-400/30 hover:bg-amber-400/20 transition-colors disabled:opacity-50">
                  <Clock size={10} /> Em curso
                </button>
              )}
            </div>
            {aEditar ? (
              <input value={editTitulo} onChange={e => setEditTitulo(e.target.value)} autoFocus
                className="w-full bg-surface-2 border border-border rounded-lg px-2 py-1 text-[14px] font-bold text-accent focus:outline-none focus:border-white/25" />
            ) : (
              <p className="text-[15px] font-bold text-accent leading-snug">{ocorrencia.titulo}</p>
            )}
            <p className="text-[11px] text-accent-subtle mt-0.5">
              {ocorrencia.data_ocorrencia} · {ocorrencia.registado_por}
              {ocorrencia.espacos?.nome && ` · ${ocorrencia.espacos.nome}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {podeEditar && !aEditar && (
              <>
                <button onClick={() => { setAEditar(true); setEditTitulo(ocorrencia.titulo); setEditDescr(ocorrencia.descricao ?? '') }}
                  title="Editar" className="p-1.5 rounded-lg hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setAApagar(true)} title="Apagar"
                  className="p-1.5 rounded-lg hover:bg-red-400/10 text-accent-subtle hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              </>
            )}
            {aEditar && (
              <>
                <button onClick={gravarEdicao} disabled={!editTitulo.trim() || loading}
                  className="p-1.5 rounded-lg hover:bg-green-400/10 text-green-400 transition-colors disabled:opacity-40">
                  <Check size={14} />
                </button>
                <button onClick={() => setAEditar(false)}
                  className="p-1.5 rounded-lg hover:bg-surface-2 text-accent-subtle transition-colors">
                  <X size={14} />
                </button>
              </>
            )}
            {!aEditar && (
              <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Confirmação apagar */}
        {aApagar && (
          <div className="px-5 py-3 bg-red-400/5 border-b border-red-400/20 flex items-center justify-between gap-3 shrink-0">
            <p className="text-[12px] text-red-400 font-semibold">Apagar esta ocorrência e todo o histórico?</p>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setAApagar(false)}
                className="px-3 py-1 rounded-lg border border-border text-accent-subtle text-[11px] font-semibold hover:bg-surface-2 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarApagar} disabled={loading}
                className="px-3 py-1 rounded-lg border border-red-400/30 bg-red-400/15 text-red-400 text-[11px] font-semibold hover:bg-red-400/25 transition-colors disabled:opacity-50">
                {loading ? 'A apagar…' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {/* Corpo */}
        <div className="flex-1 min-h-0 overflow-y-auto">

          {(ocorrencia.descricao || aEditar) && (
            <div className="px-5 py-3 border-b border-border/20">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1">Descrição</p>
              {aEditar ? (
                <textarea value={editDescr} onChange={e => setEditDescr(e.target.value)} rows={3}
                  placeholder="Descrição (opcional)…"
                  className="w-full bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-[13px] text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25 resize-none" />
              ) : (
                <p className="text-[13px] text-accent-muted">{ocorrencia.descricao}</p>
              )}
            </div>
          )}

          {ocorrencia.foto_url && (
            <div className="px-5 py-3 border-b border-border/20">
              <img src={ocorrencia.foto_url} alt="Foto ocorrência"
                className="w-full max-h-48 object-cover rounded-lg border border-border/40" />
            </div>
          )}

          {/* Histórico */}
          <div className="px-5 py-3 border-b border-border/20">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-2">Histórico</p>
            {intervencoes.length === 0
              ? <p className="text-[12px] text-accent-subtle/50 italic">Sem intervenções registadas.</p>
              : <div className="flex flex-col gap-2">
                  {intervencoes.map(iv => (
                    <div key={iv.id} className="rounded-lg bg-surface-2/60 border border-border/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-accent">{iv.tecnico_nome}</span>
                        <span className="text-[10px] text-accent-subtle/60">{fmtDT(iv.created_at)}</span>
                      </div>
                      {iv.nota && iv.nota !== '(foto)' && (
                        <p className="text-[12px] text-accent-muted mb-1">{iv.nota}</p>
                      )}
                      {iv.foto_url && (
                        <img src={iv.foto_url} alt="Foto intervenção"
                          className="w-full max-h-32 object-cover rounded-lg border border-border/30 mt-1" />
                      )}
                    </div>
                  ))}
                </div>
            }
          </div>

          {ocorrencia.status === 'fechada' && (
            <div className="px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1">Resolução</p>
              <p className="text-[12px] text-green-400">
                Fechada por <strong>{ocorrencia.fechada_por}</strong> em {fmtDT(ocorrencia.fechada_em)}
              </p>
            </div>
          )}
        </div>

        {/* Acções */}
        {ocorrencia.status !== 'fechada' && (
          <div className="px-5 py-3 border-t border-border/40 flex flex-col gap-2 shrink-0">

            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Nota de intervenção…"
              rows={2}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25 resize-none"
            />

            {/* Foto da intervenção */}
            {fotoUrl ? (
              <div className="relative">
                <img src={fotoUrl} alt="Foto" className="w-full max-h-28 object-cover rounded-lg border border-border/40" />
                <button onClick={() => setFotoUrl(null)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80">
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => camaraRef.current?.click()} disabled={aEnviar}
                  className="flex-1 py-1.5 rounded-lg border border-border/60 text-accent-subtle hover:border-white/20 hover:text-accent transition-colors flex items-center justify-center gap-1.5 text-[11px] disabled:opacity-50">
                  <Camera size={13} />{aEnviar ? 'A enviar…' : 'Câmara'}
                </button>
                <button onClick={() => galeriaRef.current?.click()} disabled={aEnviar}
                  className="flex-1 py-1.5 rounded-lg border border-border/60 text-accent-subtle hover:border-white/20 hover:text-accent transition-colors flex items-center justify-center gap-1.5 text-[11px] disabled:opacity-50">
                  <ImageIcon size={13} />{aEnviar ? 'A enviar…' : 'Galeria'}
                </button>
              </div>
            )}
            <input ref={camaraRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={onFoto} />
            <input ref={galeriaRef} type="file" accept="image/*" className="hidden" onChange={onFoto} />

            {/* Botões de acção */}
            {!aFecho ? (
              <div className="flex gap-2">
                <button
                  onClick={registarNota}
                  disabled={!temConteudo || loading}
                  className="flex-1 py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-400 text-[12px] font-semibold hover:bg-amber-400/20 transition-colors disabled:opacity-40">
                  {loading ? 'A registar…' : 'Registar nota'}
                </button>
                <button
                  onClick={() => setAFecho(true)}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl border border-green-400/30 bg-green-400/10 text-green-400 text-[12px] font-semibold hover:bg-green-400/20 transition-colors disabled:opacity-40">
                  Fechar ocorrência
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-accent-muted text-center">
                  {temConteudo ? 'A nota/foto será gravada e a ocorrência fechada.' : 'Confirmar fecho da ocorrência?'}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setAFecho(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-accent-subtle text-[12px] font-semibold hover:bg-surface-2 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={fecharOcorrencia} disabled={loading}
                    className="flex-1 py-2.5 rounded-xl border border-green-400/30 bg-green-400/15 text-green-400 text-[12px] font-semibold hover:bg-green-400/25 transition-colors disabled:opacity-50">
                    {loading ? 'A fechar…' : 'Confirmar fecho'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
