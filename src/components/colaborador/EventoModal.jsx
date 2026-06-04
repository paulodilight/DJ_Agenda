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
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md font-semibold border', c.chip)}
      style={{ fontSize: 14 }}>
      {nome}
    </span>
  )
}

function Campo({ rotulo, valor, negrito, isLink, full, size = 13 }) {
  if (!valor) return null
  return (
    <div className={clsx('flex flex-col gap-0.5 py-2 border-b border-border/30', full ? 'col-span-2' : '')}>
      <p className="font-semibold uppercase tracking-wider text-accent-subtle" style={{ fontSize: 10 }}>{rotulo}</p>
      {isLink
        ? <a href={mapaUrl(valor)} target="_blank" rel="noopener noreferrer"
            className="text-amber-400 underline underline-offset-2 hover:text-amber-400/80 break-words"
            style={{ fontSize: size }}>{valor}</a>
        : <p className={clsx('break-words', negrito ? 'text-white font-bold' : 'text-accent-muted')}
            style={{ fontSize: size }}>{valor}</p>
      }
    </div>
  )
}

export function EventoModal({ evento, mapaTecnicos = {}, onFechar }) {
  const [aba, setAba]             = useState('detalhes')
  const [dir, setDir]             = useState('right')   // animação de entrada
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

  const goAba = (novaAba, direcao) => {
    if (novaAba === aba) return
    setDir(direcao)
    setAba(novaAba)
  }

  const onTouchStart = (e) => { touchX.current = e.changedTouches[0].clientX }
  const onTouchEnd   = (e) => {
    if (touchX.current === null) return
    const d = e.changedTouches[0].clientX - touchX.current
    if (d < -60) goAba('notas', 'right')
    if (d >  60) goAba('detalhes', 'left')
    touchX.current = null
  }

  const dataInstal = evento.dia_instalacao || evento.data_evento
  const horaInstal = hhmm(evento.hora_instalacao)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-lg bg-surface-1 border border-border rounded-2xl shadow-2xl flex flex-col"
        style={{ height: '82vh', maxHeight: '92vh' }}>

        {/* Cabeçalho — 2 linhas: logo+cliente+badge+X / nome do evento */}
        <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <LogoCliente logo={logo} nome={cliente || evento.evento} />
            <div className="flex-1 min-w-0">
              {cliente && <p className="font-medium text-accent-muted truncate" style={{ fontSize: 14 }}>{cliente}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {evento.status && <Badge variante={statusVar(evento.status)}>{labelEstado(evento.status) || evento.status}</Badge>}
              <button onClick={onFechar} className="text-accent-subtle hover:text-accent p-1.5 -mr-1">
                <X size={24} />
              </button>
            </div>
          </div>
          {/* 2ª linha — Nome do evento */}
          <p className="mt-2 font-black text-accent leading-tight" style={{ fontSize: 16 }}>{evento.evento}</p>
        </div>

        {/* Abas */}
        <div className="flex border-b border-border px-5 shrink-0 items-center">
          {[{ id: 'detalhes', label: 'Detalhes', d: 'left' }, { id: 'notas', label: 'Notas & Equipamento', d: 'right' }].map(t => (
            <button key={t.id} onClick={() => goAba(t.id, t.d)}
              className={clsx(
                'px-4 py-2.5 font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
                aba === t.id ? 'border-amber-400 text-amber-400' : 'border-transparent text-accent-muted hover:text-accent',
              )}
              style={{ fontSize: 12 }}>{t.label}</button>
          ))}
          <span className="ml-auto pr-1 select-none text-accent-subtle/30" style={{ fontSize: 9 }}>← desliza →</span>
        </div>

        {/* Conteúdo — altura fixa, swipe */}
        <div key={aba}
          className={clsx('flex-1 overflow-y-auto px-5 py-3', dir === 'right' ? 'tab-from-right' : 'tab-from-left')}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

          {aba === 'detalhes' ? (
            <div className="flex flex-col">

              {/* Linha 1 — Técnicos */}
              <div className="flex gap-5 flex-wrap py-2 border-b border-border/30">
                {tecNomeResp && (
                  <div>
                    <p className="uppercase tracking-wider text-accent-subtle mb-1.5" style={{ fontSize: 10 }}>Responsável</p>
                    <TecChip nome={tecNomeResp} idx={0} />
                  </div>
                )}
                {outrosTecs.length > 0 && (
                  <div>
                    <p className="uppercase tracking-wider text-accent-subtle mb-1.5" style={{ fontSize: 10 }}>Apoio</p>
                    <div className="flex gap-1 flex-wrap">
                      {outrosTecs.map((n, i) => <TecChip key={n} nome={n} idx={i + 1} />)}
                    </div>
                  </div>
                )}
              </div>

              {/* Linha 2 — Instalação em 2 colunas (branco translúcido) */}
              {(dataInstal || horaInstal) && (
                <div className="my-2 rounded-lg bg-white/[0.08] border border-white/10 px-3 py-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-white/50 uppercase tracking-wider" style={{ fontSize: 10 }}>Instalação</p>
                    <p className="text-white/90 font-medium capitalize" style={{ fontSize: 14 }}>
                      {dataInstal ? dataLonga(dataInstal) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/50 uppercase tracking-wider" style={{ fontSize: 10 }}>Hora</p>
                    <p className="text-white/90 font-medium" style={{ fontSize: 14 }}>{horaInstal || '—'}</p>
                  </div>
                </div>
              )}

              {/* Linha 3 — Data do evento */}
              {evento.data_evento && (
                <div className="py-2 border-b border-border/30">
                  <p className="uppercase tracking-wider text-accent-subtle mb-0.5" style={{ fontSize: 10 }}>Data do evento</p>
                  <p className="font-bold text-white capitalize leading-snug" style={{ fontSize: 13 }}>
                    {dataCompleta(evento.data_evento)}
                  </p>
                </div>
              )}

              {/* Linha 4 — Hora início | Hora fim em 2 colunas */}
              {(evento.hora_inicio || evento.hora_fim) && (
                <div className="py-2 border-b border-border/30 grid grid-cols-2 gap-2">
                  <div>
                    <p className="uppercase tracking-wider text-accent-subtle mb-0.5" style={{ fontSize: 10 }}>Hora de início</p>
                    <span className="font-black text-white tabular-nums" style={{ fontSize: 14 }}>{hhmm(evento.hora_inicio) || '—'}</span>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-accent-subtle mb-0.5" style={{ fontSize: 10 }}>Hora de fim</p>
                    <span className="font-black text-white tabular-nums" style={{ fontSize: 14 }}>{hhmm(evento.hora_fim) || '—'}</span>
                  </div>
                </div>
              )}

              {/* Grid 2 colunas para os restantes campos */}
              <div className="grid grid-cols-2 gap-x-4">
                {/* Linha 5 — Nome do evento (14px, largura total) */}
                <Campo rotulo="Nome do evento" valor={evento.evento} full size={14} />

                {/* Tipo | Status */}
                <Campo rotulo="Tipo"   valor={evento.tipo} />
                <Campo rotulo="Status" valor={labelEstado(evento.status) || evento.status} />

                {/* LOCAL | Contacto */}
                <Campo rotulo="Local"    valor={cliente} />
                <Campo rotulo="Contacto" valor={evento.contacto_pelo_evento} />

                {/* Morada — coluna única */}
                <Campo rotulo="Morada" valor={evento.morada} isLink full />
              </div>
            </div>

          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div>
                <p className="flex items-center gap-1.5 uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>
                  <StickyNote size={12} /> Notas do evento
                </p>
                <div className={clsx('whitespace-pre-wrap rounded-xl px-3 py-2.5 border',
                  evento.notas_operacionais ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}
                  style={{ fontSize: 13 }}>
                  {evento.notas_operacionais || 'Sem notas de evento.'}
                </div>
              </div>
              <div>
                <p className="flex items-center gap-1.5 uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>
                  <Boxes size={12} /> Equipamentos
                </p>
                <div className={clsx('whitespace-pre-wrap rounded-xl px-3 py-2.5 border',
                  evento.Equipamentos ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}
                  style={{ fontSize: 13 }}>
                  {evento.Equipamentos || 'Sem equipamentos definidos.'}
                </div>
              </div>
              <div>
                <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>As minhas notas</p>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4}
                  placeholder="Adiciona notas antes ou depois do evento…"
                  style={{ fontSize: 13 }}
                  className="w-full bg-surface-2 border border-white/30 rounded-xl px-3 py-2 text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/60 resize-none" />
                {erro && <p className="text-xs text-status-cancelado mt-1">{erro}</p>}
                <div className="flex justify-end mt-2">
                  <button onClick={guardar} disabled={guardando}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-white/90 disabled:opacity-40 transition-colors"
                    style={{ fontSize: 12 }}>
                    <Save size={13} />
                    {guardando ? 'A guardar…' : guardado ? 'Guardado ✓' : 'Guardar notas'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
