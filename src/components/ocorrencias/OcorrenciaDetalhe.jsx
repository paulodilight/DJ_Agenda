import { useState } from 'react'
import { X, Plus, CheckCircle, Clock, AlertCircle } from 'lucide-react'
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

export function OcorrenciaDetalhe({ ocorrencia, intervencoes = [], onFechar, onAtualizar, nomeUtilizador, tipoUtilizador }) {
  const [nota, setNota]         = useState('')
  const [aFecho, setAFecho]     = useState(false)
  const [loading, setLoading]   = useState(false)

  const cfg = STATUS_CFG[ocorrencia.status] ?? STATUS_CFG.aberta
  const Ic  = cfg.icon

  const adicionarIntervencao = async () => {
    if (!nota.trim()) return
    setLoading(true)
    await supabase.from('ocorrencias_intervencoes').insert({
      ocorrencia_id: ocorrencia.id,
      nota: nota.trim(),
      tecnico_nome: nomeUtilizador,
    })
    if (ocorrencia.status === 'aberta') {
      await supabase.from('ocorrencias').update({ status: 'em_processo' }).eq('id', ocorrencia.id)
    }
    setNota('')
    setLoading(false)
    onAtualizar?.()
  }

  const fechar = async () => {
    setLoading(true)
    await supabase.from('ocorrencias').update({
      status: 'fechada',
      fechada_em: new Date().toISOString(),
      fechada_por: nomeUtilizador,
    }).eq('id', ocorrencia.id)
    setAFecho(false)
    setLoading(false)
    onAtualizar?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border mb-1', cfg.cls)}>
              <Ic size={10} />{cfg.label}
            </span>
            <p className="text-[15px] font-bold text-accent leading-snug">{ocorrencia.titulo}</p>
            <p className="text-[11px] text-accent-subtle mt-0.5">
              {ocorrencia.data_ocorrencia} · {ocorrencia.registado_por}
              {ocorrencia.espacos?.nome && ` · ${ocorrencia.espacos.nome}`}
            </p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Descrição */}
          {ocorrencia.descricao && (
            <div className="px-5 py-3 border-b border-border/20">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1">Descrição</p>
              <p className="text-[13px] text-accent-muted">{ocorrencia.descricao}</p>
            </div>
          )}

          {/* Foto */}
          {ocorrencia.foto_url && (
            <div className="px-5 py-3 border-b border-border/20">
              <img src={ocorrencia.foto_url} alt="Foto ocorrência"
                className="w-full max-h-48 object-cover rounded-lg border border-border/40" />
            </div>
          )}

          {/* Histórico de intervenções */}
          <div className="px-5 py-3 border-b border-border/20">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-2">Histórico</p>
            {intervencoes.length === 0
              ? <p className="text-[12px] text-accent-subtle/50 italic">Sem intervenções registadas.</p>
              : <div className="flex flex-col gap-2">
                  {intervencoes.map(iv => (
                    <div key={iv.id} className="rounded-lg bg-surface-2/60 border border-border/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[11px] font-semibold text-accent">{iv.tecnico_nome}</span>
                        <span className="text-[10px] text-accent-subtle/60">{fmtDT(iv.created_at)}</span>
                      </div>
                      <p className="text-[12px] text-accent-muted">{iv.nota}</p>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Fecho */}
          {ocorrencia.status === 'fechada' && (
            <div className="px-5 py-3 border-b border-border/20">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-subtle mb-1">Resolução</p>
              <p className="text-[12px] text-green-400">
                Fechada por <strong>{ocorrencia.fechada_por}</strong> em {fmtDT(ocorrencia.fechada_em)}
              </p>
            </div>
          )}
        </div>

        {/* Acções — só se não fechada */}
        {ocorrencia.status !== 'fechada' && (
          <div className="px-5 py-3 border-t border-border/40 flex flex-col gap-2 shrink-0">
            {!aFecho ? (
              <>
                <div className="flex gap-2">
                  <input value={nota} onChange={e => setNota(e.target.value)}
                    placeholder="Adicionar nota de intervenção…"
                    className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25"
                    onKeyDown={e => e.key === 'Enter' && adicionarIntervencao()} />
                  <button onClick={adicionarIntervencao} disabled={!nota.trim() || loading}
                    className="px-3 py-2 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-400 hover:bg-amber-400/25 transition-colors disabled:opacity-40">
                    <Plus size={15} />
                  </button>
                </div>
                <button onClick={() => setAFecho(true)}
                  className="w-full py-2 rounded-lg border border-green-400/30 bg-green-400/10 text-green-400 text-[12px] font-semibold hover:bg-green-400/20 transition-colors">
                  Marcar como resolvida
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-accent-muted text-center">Confirmar resolução da ocorrência?</p>
                <div className="flex gap-2">
                  <button onClick={() => setAFecho(false)}
                    className="flex-1 py-2 rounded-lg border border-border text-accent-subtle text-[12px] font-semibold hover:bg-surface-2 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={fechar} disabled={loading}
                    className="flex-1 py-2 rounded-lg border border-green-400/30 bg-green-400/15 text-green-400 text-[12px] font-semibold hover:bg-green-400/25 transition-colors disabled:opacity-50">
                    {loading ? 'A fechar…' : 'Confirmar'}
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
