import { useState } from 'react'
import { Bell, Check, X, ChevronDown, ChevronUp, Clock, User, Calendar, ArrowRight } from 'lucide-react'
import { useEventosManagerPropostas } from '@/hooks/useEventosManagerPropostas'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'

function DiffItem({ campo, antes, depois }) {
  return (
    <div className="flex items-baseline gap-1.5 text-xs">
      <span className="shrink-0 font-medium text-gray-400">{campo}:</span>
      {antes !== null && (
        <>
          <span className="line-through text-gray-500">{antes ?? '—'}</span>
          <ArrowRight size={10} className="shrink-0 text-gray-500" />
        </>
      )}
      <span className="font-semibold text-amber-400">{depois ?? '—'}</span>
    </div>
  )
}

function CamposDisplay({ proposta }) {
  if (proposta.tipo === 'alteracao' && proposta.campos?.diff) {
    return (
      <div className="flex flex-col gap-1 mt-2">
        {proposta.campos.diff.map((c, i) => (
          <DiffItem key={i} campo={c.campo} antes={c.antes} depois={c.depois} />
        ))}
      </div>
    )
  }
  // Criação — mostrar campos principais
  const campos = proposta.tipo === 'alteracao' ? proposta.campos?.payload : proposta.campos
  if (!campos) return null
  const mostrar = [
    { label: 'Evento', val: campos.nome },
    { label: 'Data', val: campos.data },
    { label: 'Hora início', val: campos.hora_inicio?.slice(0, 5) },
    { label: 'Hora fim', val: campos.hora_fim?.slice(0, 5) },
    { label: 'Tipo', val: campos.tipo },
  ].filter((c) => c.val)
  return (
    <div className="flex flex-col gap-1 mt-2">
      {mostrar.map((c) => (
        <DiffItem key={c.label} campo={c.label} antes={null} depois={c.val} />
      ))}
    </div>
  )
}

function PropostaCard({ proposta, onAprovar, onRejeitar }) {
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(true)

  async function handleAprovar() {
    setBusy(true)
    await onAprovar(proposta)
    setBusy(false)
  }

  async function handleRejeitar() {
    setBusy(true)
    await onRejeitar(proposta.id)
    setBusy(false)
  }

  const semSupaEvento = !proposta.supa_evento_id

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx(
              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              proposta.tipo === 'criacao'
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
            )}>
              {proposta.tipo === 'criacao' ? 'Nova entrada' : 'Alteração'}
            </span>
            <span className="text-xs font-semibold text-white truncate">{proposta.espaco_nome}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><User size={10} />{proposta.criado_por}</span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {format(new Date(proposta.criado_em), "d MMM · HH:mm", { locale: pt })}
            </span>
            {proposta.supa_evento_id && (
              <span className="flex items-center gap-1 text-emerald-400/70"><Calendar size={10} />supa_evento #{proposta.supa_evento_id}</span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-gray-500 hover:text-white transition-colors shrink-0 mt-0.5">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && <CamposDisplay proposta={proposta} />}

      {semSupaEvento && (
        <p className="mt-2 text-[10px] text-blue-400/70 italic">
          Novo evento — aprovação cria na tua agenda automaticamente.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleAprovar}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40 transition-all"
        >
          <Check size={12} /> Aprovar
        </button>
        <button
          type="button"
          onClick={handleRejeitar}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-all"
        >
          <X size={12} /> Rejeitar
        </button>
      </div>
    </div>
  )
}

export function PropostasManagerPopup() {
  const { propostas, loading, aprovar, rejeitar } = useEventosManagerPropostas()
  const [aberto, setAberto] = useState(true)

  if (loading || propostas.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-2" style={{ maxWidth: 360 }}>
      {/* Badge / toggle */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-gray-900/95 px-3 py-1.5 shadow-xl backdrop-blur-sm hover:border-amber-500/70 transition-all"
      >
        <Bell size={13} className="text-amber-400 animate-pulse" />
        <span className="text-xs font-bold text-amber-400">{propostas.length} proposta{propostas.length !== 1 ? 's' : ''} pendente{propostas.length !== 1 ? 's' : ''}</span>
        {aberto ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronUp size={13} className="text-gray-400" />}
      </button>

      {/* Lista de propostas */}
      {aberto && (
        <div className="w-full flex flex-col gap-2 rounded-2xl border border-white/10 bg-gray-950/95 p-3 shadow-2xl backdrop-blur-sm max-h-[70vh] overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Manager → DJ Schedule</p>
          {propostas.map((p) => (
            <PropostaCard key={p.id} proposta={p} onAprovar={aprovar} onRejeitar={rejeitar} />
          ))}
        </div>
      )}
    </div>
  )
}
