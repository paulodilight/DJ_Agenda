import { useState, useEffect } from 'react'
import { X, StickyNote, Boxes, Save } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge } from '@/components/ui/Badge'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { labelEstado } from '@/utils/formatacao'
import { hhmm, dataLonga } from './format'

const statusVar = (s) =>
  ({ confirmado: 'confirmado', proposta: 'proposta', cancelado: 'cancelado', realizado: 'confirmado', 'em curso': 'proposta' }[s?.toLowerCase()] ?? 'default')

function LogoCliente({ logo, nome }) {
  return (
    <div className="w-11 h-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 overflow-hidden">
      {logo
        ? <img src={logo} alt={nome || ''} className="w-full h-full object-cover" />
        : <span className="font-bold text-accent-subtle text-base">{(nome || '?').charAt(0).toUpperCase()}</span>}
    </div>
  )
}

function Campo({ rotulo, valor, realce, colSpan }) {
  if (!valor) return null
  return (
    <div className={clsx('flex flex-col gap-0.5 py-2.5 border-b border-border/40 last:border-0', colSpan === 2 && 'col-span-2')}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">{rotulo}</p>
      <p className={clsx('text-sm', realce ? 'text-accent font-semibold' : 'text-accent-muted')}>{valor}</p>
    </div>
  )
}

export function EventoModal({ evento, mapaTecnicos = {}, onFechar }) {
  const [aba, setAba]             = useState('detalhes')
  const [notas, setNotas]         = useState(evento?.notas_colaborador ?? '')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)
  const [erro, setErro]           = useState(null)

  useEffect(() => {
    if (evento) setNotas(evento.notas_colaborador ?? '')
  }, [evento?.id])

  const logo    = evento.espacos?.logo_url
  const cliente = evento.espacos?.nome || evento.cliente || null
  const tecnico = mapaTecnicos[evento.tecnico_id] || evento.responsavel || null

  const guardar = async () => {
    setGuardando(true); setErro(null)
    try {
      await colaboradorApi.guardarNotasColaborador(evento.id, notas)
      setGuardado(true); setTimeout(() => setGuardado(false), 2000)
    } catch (e) { setErro(e.message) }
    finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onFechar} />
      <div className="relative z-10 w-full md:max-w-lg bg-surface-1 border border-border rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">

        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0">
          <LogoCliente logo={logo} nome={cliente || evento.evento} />
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-accent truncate leading-tight">{evento.evento}</p>
            {cliente && <p className="text-xs text-accent-muted mt-0.5">{cliente}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {evento.status && <Badge variante={statusVar(evento.status)}>{labelEstado(evento.status) || evento.status}</Badge>}
            <button onClick={onFechar} className="text-accent-subtle hover:text-accent p-1 -mr-1">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex border-b border-border px-5 shrink-0">
          {[{ id: 'detalhes', label: 'Detalhes' }, { id: 'notas', label: 'Notas & Equipamento' }].map(t => (
            <button key={t.id} onClick={() => setAba(t.id)}
              className={clsx(
                'px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
                aba === t.id ? 'border-amber-400 text-amber-400' : 'border-transparent text-accent-muted hover:text-accent',
              )}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {aba === 'detalhes' ? (
            <div className="grid grid-cols-2 gap-x-5">
              <Campo rotulo="Nome do evento" valor={evento.evento} realce colSpan={2} />
              <Campo rotulo="Tipo"           valor={evento.tipo} />
              <Campo rotulo="Cliente"        valor={cliente} />
              <Campo rotulo="Status"         valor={labelEstado(evento.status) || evento.status} />
              <Campo rotulo="Técnico responsável" valor={tecnico} />
              <Campo rotulo="Contacto pelo evento" valor={evento.contacto_pelo_evento} />
              <Campo rotulo="Morada"         valor={evento.morada} />
              <Campo rotulo="Dia de instalação"  valor={evento.dia_instalacao ? dataLonga(evento.dia_instalacao) : null} />
              <Campo rotulo="Hora de instalação" valor={hhmm(evento.hora_instalacao)} />
              <Campo rotulo="Data do evento" valor={evento.data_evento ? dataLonga(evento.data_evento) : null} realce colSpan={2} />
              <Campo rotulo="Hora início"    valor={hhmm(evento.hora_inicio)} />
              <Campo rotulo="Hora fim"       valor={hhmm(evento.hora_fim)} />
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent-subtle mb-2">
                  <StickyNote size={12} /> Notas do evento
                </p>
                <div className={clsx('text-sm whitespace-pre-wrap rounded-xl px-3 py-2.5 border', evento.notas_operacionais ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}>
                  {evento.notas_operacionais || 'Sem notas de evento.'}
                </div>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent-subtle mb-2">
                  <Boxes size={12} /> Equipamentos
                </p>
                <div className={clsx('text-sm whitespace-pre-wrap rounded-xl px-3 py-2.5 border', evento.Equipamentos ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}>
                  {evento.Equipamentos || 'Sem equipamentos definidos.'}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-accent-subtle mb-2">As minhas notas</p>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4}
                  placeholder="Adiciona notas antes ou depois do evento…"
                  className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25 resize-none" />
                {erro && <p className="text-xs text-status-cancelado mt-1">{erro}</p>}
                <button onClick={guardar} disabled={guardando}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 transition-colors">
                  <Save size={14} />
                  {guardando ? 'A guardar…' : guardado ? 'Guardado ✓' : 'Guardar notas'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
