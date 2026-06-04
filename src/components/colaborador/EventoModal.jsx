import { useState, useEffect, useRef } from 'react'
import { X, StickyNote, Boxes, Save } from 'lucide-react'
import { clsx } from 'clsx'
import { Badge } from '@/components/ui/Badge'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { labelEstado } from '@/utils/formatacao'
import { corTecnico } from '@/utils/tecnicoColor'
import { hhmm, dataLonga, dataCompleta } from './format'

const statusVar = (s) =>
  ({ confirmado: 'confirmado', proposta: 'proposta', cancelado: 'cancelado', realizado: 'confirmado', 'em curso': 'proposta' }[s?.toLowerCase()] ?? 'default')

const mapaUrl = (v) => /^https?:\/\//i.test(v)
  ? v
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`

function LogoCliente({ logo, nome }) {
  return (
    <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 overflow-hidden">
      {logo
        ? <img src={logo} alt={nome || ''} className="w-full h-full object-cover" />
        : <span className="font-bold text-accent-subtle text-lg">{(nome || '?').charAt(0).toUpperCase()}</span>}
    </div>
  )
}

function TecChip({ nome, idx = 0 }) {
  const c = corTecnico(nome, idx)
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border', c.chip)}>
      {nome}
    </span>
  )
}

// Campo genérico com font 11px
function Campo({ rotulo, valor, negrito, isLink }) {
  if (!valor) return null
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border/30 last:border-0">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-accent-subtle">{rotulo}</p>
      {isLink
        ? <a href={mapaUrl(valor)} target="_blank" rel="noopener noreferrer"
            className={clsx('text-amber-400 underline underline-offset-2 hover:text-amber-400/80 break-words', negrito ? 'font-bold' : '')}
            style={{ fontSize: 11 }}>{valor}</a>
        : <p className={clsx('break-words', negrito ? 'text-white font-bold text-[13px]' : 'text-accent-muted')}
            style={negrito ? {} : { fontSize: 11 }}>{valor}</p>
      }
    </div>
  )
}

export function EventoModal({ evento, mapaTecnicos = {}, onFechar }) {
  const [aba, setAba]             = useState('detalhes')
  const [notas, setNotas]         = useState(evento?.notas_colaborador ?? '')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)
  const [erro, setErro]           = useState(null)
  const touchX = useRef(null)

  useEffect(() => {
    if (evento) setNotas(evento.notas_colaborador ?? '')
  }, [evento?.id])

  const logo    = evento.espacos?.logo_url
  const cliente = evento.espacos?.nome || evento.cliente || null
  const tecNomeResp = mapaTecnicos[evento.tecnico_id] || evento.responsavel || null

  const outrosTecs = (evento._tecnicosIds ?? [])
    .filter(id => id !== evento.tecnico_id)
    .map(id => mapaTecnicos[id])
    .filter(Boolean)

  const guardar = async () => {
    setGuardando(true); setErro(null)
    try {
      await colaboradorApi.guardarNotasColaborador(evento.id, notas)
      setGuardado(true); setTimeout(() => setGuardado(false), 2000)
    } catch (e) { setErro(e.message) }
    finally { setGuardando(false) }
  }

  const onTouchStart = (e) => { touchX.current = e.changedTouches[0].clientX }
  const onTouchEnd   = (e) => {
    if (touchX.current === null) return
    const d = e.changedTouches[0].clientX - touchX.current
    if (d < -60) setAba('notas')
    if (d >  60) setAba('detalhes')
    touchX.current = null
  }

  const dataInstal = evento.dia_instalacao || evento.data_evento
  const horaInstal = hhmm(evento.hora_instalacao)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-lg bg-surface-1 border border-border rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0">
          <LogoCliente logo={logo} nome={cliente || evento.evento} />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-black text-accent truncate leading-tight">{evento.evento}</p>
            {cliente && <p className="text-sm font-medium text-accent-muted mt-0.5">{cliente}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {evento.status && <Badge variante={statusVar(evento.status)}>{labelEstado(evento.status) || evento.status}</Badge>}
            <button onClick={onFechar} className="text-accent-subtle hover:text-accent p-1 -mr-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex border-b border-border px-5 shrink-0 items-center">
          {[{ id: 'detalhes', label: 'Detalhes' }, { id: 'notas', label: 'Notas & Equipamento' }].map(t => (
            <button key={t.id} onClick={() => setAba(t.id)}
              className={clsx(
                'px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
                aba === t.id ? 'border-amber-400 text-amber-400' : 'border-transparent text-accent-muted hover:text-accent',
              )}>{t.label}</button>
          ))}
          <span className="ml-auto text-[9px] text-accent-subtle/30 pr-1 select-none">← desliza →</span>
        </div>

        {/* Conteúdo — swipe */}
        <div className="flex-1 overflow-y-auto px-5 py-3"
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

          {aba === 'detalhes' ? (
            <div className="flex flex-col">

              {/* Linha 1 — Técnicos */}
              <div className="flex gap-5 flex-wrap py-2 border-b border-border/30">
                {tecNomeResp && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-accent-subtle mb-1.5">Responsável</p>
                    <TecChip nome={tecNomeResp} idx={0} />
                  </div>
                )}
                {outrosTecs.length > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-accent-subtle mb-1.5">Equipa</p>
                    <div className="flex gap-1 flex-wrap">
                      {outrosTecs.map((n, i) => <TecChip key={n} nome={n} idx={i + 1} />)}
                    </div>
                  </div>
                )}
              </div>

              {/* Linha 2 — Instalação (branco translúcido 40%) */}
              {(dataInstal || horaInstal) && (
                <div className="my-2 rounded-lg bg-white/[0.08] border border-white/10 px-3 py-2 flex items-center gap-6">
                  {dataInstal && (
                    <div>
                      <p className="text-[9px] text-white/50 uppercase tracking-wider">Instalação</p>
                      <p style={{ fontSize: 11 }} className="text-white/90 font-medium capitalize">
                        {dataLonga(dataInstal)}
                      </p>
                    </div>
                  )}
                  {horaInstal && (
                    <div>
                      <p className="text-[9px] text-white/50 uppercase tracking-wider">Hora</p>
                      <p style={{ fontSize: 11 }} className="text-white/90 font-medium">{horaInstal}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Linha 3 — Data do evento (negrito branco) */}
              {evento.data_evento && (
                <div className="py-2 border-b border-border/30">
                  <p className="text-[9px] uppercase tracking-wider text-accent-subtle mb-0.5">Data do evento</p>
                  <p className="text-[13px] font-bold text-white capitalize leading-snug">
                    {dataCompleta(evento.data_evento)}
                  </p>
                </div>
              )}

              {/* Linha 4 — Hora início / fim (negrito branco) */}
              {(evento.hora_inicio || evento.hora_fim) && (
                <div className="py-2 border-b border-border/30">
                  <p className="text-[9px] uppercase tracking-wider text-accent-subtle mb-0.5">Horário</p>
                  <div className="flex items-baseline gap-2">
                    {evento.hora_inicio && <span className="text-[17px] font-black text-white tabular-nums">{hhmm(evento.hora_inicio)}</span>}
                    {evento.hora_inicio && evento.hora_fim && <span className="text-white/30 text-lg font-light">—</span>}
                    {evento.hora_fim && <span className="text-[17px] font-black text-white tabular-nums">{hhmm(evento.hora_fim)}</span>}
                  </div>
                </div>
              )}

              {/* Linha 5 — Nome do evento */}
              <Campo rotulo="Nome do evento" valor={evento.evento} />

              {/* Restantes */}
              <Campo rotulo="Tipo"     valor={evento.tipo} />
              <Campo rotulo="Cliente"  valor={cliente} />
              <Campo rotulo="Status"   valor={labelEstado(evento.status) || evento.status} />
              <Campo rotulo="Contacto pelo evento" valor={evento.contacto_pelo_evento} />
              <Campo rotulo="Morada"   valor={evento.morada} isLink />
            </div>

          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent-subtle mb-2">
                  <StickyNote size={12} /> Notas do evento
                </p>
                <div style={{ fontSize: 11 }} className={clsx('whitespace-pre-wrap rounded-xl px-3 py-2.5 border',
                  evento.notas_operacionais ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}>
                  {evento.notas_operacionais || 'Sem notas de evento.'}
                </div>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent-subtle mb-2">
                  <Boxes size={12} /> Equipamentos
                </p>
                <div style={{ fontSize: 11 }} className={clsx('whitespace-pre-wrap rounded-xl px-3 py-2.5 border',
                  evento.Equipamentos ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}>
                  {evento.Equipamentos || 'Sem equipamentos definidos.'}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-accent-subtle mb-2">As minhas notas</p>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4}
                  placeholder="Adiciona notas antes ou depois do evento…"
                  style={{ fontSize: 11 }}
                  className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25 resize-none" />
                {erro && <p className="text-xs text-status-cancelado mt-1">{erro}</p>}
                <button onClick={guardar} disabled={guardando}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90 disabled:opacity-40 transition-colors">
                  <Save size={13} />
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
