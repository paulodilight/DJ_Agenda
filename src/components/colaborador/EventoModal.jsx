import { useState, useEffect, useRef } from 'react'
import { X, StickyNote, Boxes, Save, MapPin, Check, Loader2, AlertCircle, PenLine, ListChecks } from 'lucide-react'
import { useAssinaturaDia } from '@/hooks/useAssinaturaDia'
import { clsx } from 'clsx'
import { Badge } from '@/components/ui/Badge'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { supabase } from '@/lib/supabase'
import { usePresenca, podeAssinar, presencaAtrasada, TOLERANCIA_MIN } from '@/hooks/usePresenca'
import { useColaboradorStore } from '@/store'
import { labelEstado } from '@/utils/formatacao'
import { corTecnico } from '@/utils/tecnicoColor'
import { hhmm, dataLonga, dataCompleta } from './format'

const STATUS_KNOWN = ['proposta','aceitação','validação','pré-confirmado','confirmado','trocado','cancelado','a_pedido']
const statusVar = (s) => {
  if (!s) return 'default'
  if (STATUS_KNOWN.includes(s)) return s
  return { realizado: 'confirmado', 'em curso': 'proposta' }[s.toLowerCase()] ?? 'default'
}

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

function Campo({ rotulo, valor, negrito, isLink, full, size = 14 }) {
  if (!valor) return null
  return (
    <div className={clsx('flex flex-col gap-0.5 py-2 border-b border-border/30', full ? 'col-span-2' : '')}>
      <p className="font-semibold uppercase tracking-wider text-accent-subtle" style={{ fontSize: 10 }}>{rotulo}</p>
      {isLink
        ? <a href={mapaUrl(valor)} target="_blank" rel="noopener noreferrer"
            className="text-amber-400 underline underline-offset-2 hover:text-amber-400/80 break-words"
            style={{ fontSize: size }}>{valor}</a>
        : <p className={clsx('break-words', negrito ? 'text-accent font-bold' : 'text-accent-muted')}
            style={{ fontSize: size }}>{valor}</p>
      }
    </div>
  )
}

export function EventoModal({ evento, mapaTecnicos = {}, onFechar }) {
  const [aba, setAba]             = useState('detalhes')
  const [dir, setDir]             = useState('right')
  const [notas, setNotas]         = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)
  const [erro, setErro]           = useState(null)
  const touchX = useRef(null)
  const [eventoListas, setEventoListas] = useState([]) // [{ clId, nome, itens:[{id,texto}] }]
  const [eventoChecks, setEventoChecks] = useState({}) // Set of checked itemIds

  // ── Identidade do colaborador logado ──
  const colaborador = useColaboradorStore(s => s.colaborador)

  // Só pode ver/editar as suas próprias notas se estiver atribuído ao evento
  const isAtribuido = colaborador && (
    (evento._tecnicosIds ?? []).includes(colaborador.id) ||
    evento.tecnico_id === colaborador.id
  )
  // Só o responsável principal pode assinar presença
  const isResponsavel = colaborador?.id === evento.tecnico_id

  // ── Assinatura de início/fim de evento ──
  const { proxima: proximaAssin, registar: registarAssin, loading: assinLoading } = useAssinaturaDia(colaborador?.id ?? null)
  const [assinandoEvento, setAssinandoEvento] = useState(false)
  const mostrarInicioEvento = !assinLoading && proximaAssin?.tipo === 'evento_entrada' && proximaAssin?.eventoId === evento.id

  const assinarEvento = async () => {
    setAssinandoEvento(true)
    await registarAssin('evento_entrada', { eventoId: evento.id })
    setAssinandoEvento(false)
  }

  // ── Assinatura de presença do técnico (GPS) ──
  const pres = usePresenca({ kind: 'tecnico', refId: evento.id, ownerId: colaborador?.id ?? null, signedBy: 'tecnico' })
  const [aConfirmarPres, setConfirmarPres] = useState(false)
  const presDisponivel = podeAssinar(evento.data_evento, evento.hora_inicio)
  const presAtrasada = presencaAtrasada(pres.presenca, evento.data_evento, evento.hora_inicio)

  useEffect(() => {
    if (!evento?.id || !colaborador?.id || !isAtribuido) { setNotas(''); return }
    let activo = true
    supabase.from('evento_tecnicos')
      .select('notas').eq('evento_id', evento.id).eq('tecnico_id', colaborador.id).maybeSingle()
      .then(({ data }) => { if (activo) setNotas(data?.notas ?? '') })
    return () => { activo = false }
  }, [evento?.id, colaborador?.id, isAtribuido])

  useEffect(() => {
    if (!evento?.id) return
    let activo = true
    Promise.all([
      supabase.from('evento_checklists')
        .select('checklist_id, checklists(id, nome, checklist_itens(id, texto, ordem))')
        .eq('evento_id', evento.id),
      colaborador?.id ? supabase.from('checklist_checks')
        .select('checklist_item_id')
        .eq('evento_id', evento.id)
        .eq('tecnico_id', colaborador.id) : Promise.resolve({ data: [] }),
    ]).then(([{ data: ecs }, { data: chks }]) => {
      if (!activo) return
      setEventoListas((ecs ?? []).map(ec => ({
        clId: ec.checklist_id, nome: ec.checklists?.nome ?? '?',
        itens: (ec.checklists?.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem),
      })))
      setEventoChecks(new Set((chks ?? []).map(c => c.checklist_item_id)))
    })
    return () => { activo = false }
  }, [evento?.id, colaborador?.id])

  const logo    = evento.espacos?.logo_url
  const cliente = evento.espacos?.nome || evento.cliente || null
  const tecNomeResp = mapaTecnicos[evento.tecnico_id] || evento.responsavel || null

  const outrosTecs = (evento._tecnicosIds ?? [])
    .filter(id => id !== evento.tecnico_id)
    .map(id => mapaTecnicos[id])
    .filter(Boolean)

  const guardar = async () => {
    if (!colaborador?.id) return
    setGuardando(true); setErro(null)
    try {
      await supabase.from('evento_tecnicos')
        .update({ notas })
        .eq('evento_id', evento.id)
        .eq('tecnico_id', colaborador.id)
      setGuardado(true); setTimeout(() => setGuardado(false), 2000)
    } catch (e) { setErro(e.message) }
    finally { setGuardando(false) }
  }

  const toggleCheck = async (itemId) => {
    if (!colaborador?.id) return
    const checked = eventoChecks.has(itemId)
    setEventoChecks(prev => { const s = new Set(prev); if (checked) s.delete(itemId); else s.add(itemId); return s })
    if (!checked) {
      await supabase.from('checklist_checks').upsert(
        { evento_id: evento.id, checklist_item_id: itemId, tecnico_id: colaborador.id },
        { onConflict: 'evento_id,checklist_item_id,tecnico_id' }
      )
    } else {
      await supabase.from('checklist_checks').delete()
        .eq('evento_id', evento.id).eq('checklist_item_id', itemId).eq('tecnico_id', colaborador.id)
    }
  }

  const goAba = (novaAba, direcao) => {
    if (novaAba === aba) return
    setDir(direcao)
    setAba(novaAba)
  }

  const ABAS_ORDER = ['detalhes', 'notas', 'checklist']
  const onTouchStart = (e) => { touchX.current = e.changedTouches[0].clientX }
  const onTouchEnd   = (e) => {
    if (touchX.current === null) return
    const d   = e.changedTouches[0].clientX - touchX.current
    const idx = ABAS_ORDER.indexOf(aba)
    if (d < -60 && idx < ABAS_ORDER.length - 1) goAba(ABAS_ORDER[idx + 1], 'right')
    if (d >  60 && idx > 0)                      goAba(ABAS_ORDER[idx - 1], 'left')
    touchX.current = null
  }

  const dataInstal = evento.dia_instalacao || evento.data_evento
  const horaInstal = hhmm(evento.hora_instalacao)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onFechar} />
      <div className="relative z-10 w-full max-w-lg bg-surface-1 border border-border rounded-2xl shadow-2xl flex flex-col"
        style={{ height: '82vh', maxHeight: '92vh' }}>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border shrink-0">
          <LogoCliente logo={logo} nome={cliente || evento.evento} />
          <div className="flex-1 min-w-0">
            <p className="font-black text-accent truncate leading-tight" style={{ fontSize: 16 }}>{evento.evento}</p>
            {cliente && <p className="font-medium text-accent-muted mt-0.5 truncate" style={{ fontSize: 14 }}>{cliente}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {evento.status && <Badge variante={statusVar(evento.status)}>{labelEstado(evento.status) || evento.status}</Badge>}
          </div>
        </div>

        {/* Abas */}
        <div className="flex border-b border-border px-5 shrink-0 items-center">
          {[
            { id: 'detalhes',  label: 'Detalhes',           d: 'left' },
            { id: 'notas',     label: 'Notas & Equip.',     d: 'right' },
            { id: 'checklist', label: 'Checklist',          d: 'right' },
          ].map(t => (
            <button key={t.id} onClick={() => goAba(t.id, t.d)}
              className={clsx(
                'px-3 py-2.5 font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
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
                <div className="my-2 rounded-lg bg-accent/[0.06] border border-accent/10 px-3 py-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-accent-subtle uppercase tracking-wider" style={{ fontSize: 10 }}>Instalação</p>
                    <p className="text-accent font-medium capitalize" style={{ fontSize: 14 }}>
                      {dataInstal ? dataLonga(dataInstal) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-accent-subtle uppercase tracking-wider" style={{ fontSize: 10 }}>Hora</p>
                    <p className="text-accent font-medium" style={{ fontSize: 14 }}>{horaInstal || '—'}</p>
                  </div>
                </div>
              )}

              {/* Linha 3 — Data do evento */}
              {evento.data_evento && (
                <div className="py-2 border-b border-border/30">
                  <p className="uppercase tracking-wider text-accent-subtle mb-0.5" style={{ fontSize: 10 }}>Data do evento</p>
                  <p className="font-bold text-accent capitalize leading-snug" style={{ fontSize: 13 }}>
                    {dataCompleta(evento.data_evento)}
                  </p>
                </div>
              )}

              {/* Linha 4 — Hora início | Hora fim em 2 colunas */}
              {(evento.hora_inicio || evento.hora_fim) && (
                <div className="py-2 border-b border-border/30 grid grid-cols-2 gap-2">
                  <div>
                    <p className="uppercase tracking-wider text-accent-subtle mb-0.5" style={{ fontSize: 10 }}>Hora de início</p>
                    <span className="font-black text-accent tabular-nums" style={{ fontSize: 14 }}>{hhmm(evento.hora_inicio) || '—'}</span>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-accent-subtle mb-0.5" style={{ fontSize: 10 }}>Hora de fim</p>
                    <span className="font-black text-accent tabular-nums" style={{ fontSize: 14 }}>{hhmm(evento.hora_fim) || '—'}</span>
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

          ) : aba === 'checklist' ? (
            <div className="flex flex-col gap-3 py-2">
              {eventoListas.length === 0 && (
                <p className="text-center italic py-6" style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Sem checklists neste evento.</p>
              )}
              {eventoListas.map(lista => (
                <div key={lista.clId} className="border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
                    <ListChecks size={12} className="text-amber-400 shrink-0" />
                    <p className="font-semibold text-amber-400" style={{ fontSize: 12 }}>{lista.nome}</p>
                  </div>
                  <div className="flex flex-col">
                    {lista.itens.map((item, idx) => {
                      const checked = eventoChecks.has(item.id)
                      return (
                        <button key={item.id}
                          onClick={() => toggleCheck(item.id)}
                          disabled={!isAtribuido}
                          className={clsx(
                            'flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0 text-left transition-colors',
                            checked ? 'bg-green-500/10' : 'hover:bg-white/5',
                            !isAtribuido ? 'cursor-default' : 'cursor-pointer'
                          )}>
                          <span className={clsx(
                            'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                            checked ? 'bg-green-500/30 border-green-500/60' : 'border-white/20'
                          )}>
                            {checked && <Check size={12} className="text-green-400" />}
                          </span>
                          <span className={clsx('flex-1', checked ? 'line-through opacity-50' : 'opacity-80')} style={{ fontSize: 13 }}>
                            {item.texto}
                          </span>
                        </button>
                      )
                    })}
                    {lista.itens.length === 0 && (
                      <p className="px-3 py-2 italic opacity-30" style={{ fontSize: 12 }}>Sem itens.</p>
                    )}
                  </div>
                </div>
              ))}
              {!isAtribuido && (
                <p className="text-center opacity-40 italic" style={{ fontSize: 12 }}>Só técnicos atribuídos podem marcar itens.</p>
              )}
            </div>

          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div>
                <p className="flex items-center gap-1.5 uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>
                  <StickyNote size={12} /> Notas do evento
                </p>
                <div className={clsx('whitespace-pre-wrap rounded-xl px-3 py-2.5 border',
                  evento.notas_operacionais ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}
                  style={{ fontSize: 14 }}>
                  {evento.notas_operacionais || 'Sem notas de evento.'}
                </div>
              </div>
              <div>
                <p className="flex items-center gap-1.5 uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>
                  <Boxes size={12} /> Equipamentos
                </p>
                <div className={clsx('whitespace-pre-wrap rounded-xl px-3 py-2.5 border',
                  evento.Equipamentos ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40')}
                  style={{ fontSize: 14 }}>
                  {evento.Equipamentos || 'Sem equipamentos definidos.'}
                </div>
              </div>
              {isAtribuido && (
                <div>
                  <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>As minhas notas</p>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4}
                    placeholder="Notas pessoais sobre este evento…"
                    style={{ fontSize: 14 }}
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
              )}
            </div>
          )}
        </div>

        {/* Rodapé — assinatura de início de evento + presença + fechar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {mostrarInicioEvento && (
              <button onClick={assinarEvento} disabled={assinandoEvento}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-400/30 bg-green-400/[0.07] text-green-400 text-xs font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity">
                <PenLine size={13} />
                {assinandoEvento ? 'A registar…' : 'In Evento'}
              </button>
            )}
            {isResponsavel && pres.status === 'signed' && pres.presenca ? (
              <span
                title={`Presente · ${new Date(pres.presenca.signed_at).toLocaleString('pt-PT')}${pres.presenca.latitude != null ? ` · ${Number(pres.presenca.latitude).toFixed(5)}, ${Number(pres.presenca.longitude).toFixed(5)}${pres.presenca.accuracy_m != null ? ` (±${pres.presenca.accuracy_m}m)` : ''}` : ' · sem GPS'}`}
                className={clsx('inline-flex items-center gap-1.5 text-sm font-medium', presAtrasada ? 'text-status-cancelado' : 'text-status-confirmado')}>
                <Check size={16} /> Presente · {new Date(pres.presenca.signed_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : isResponsavel && pres.status === 'loading' ? (
              <span className="inline-flex items-center gap-1.5 text-accent-subtle text-sm">
                <Loader2 size={15} className="animate-spin" /> A localizar…
              </span>
            ) : isResponsavel && pres.status === 'error' ? (
              <button onClick={() => pres.assinar()} title={pres.erro || ''}
                className="inline-flex items-center gap-1.5 text-status-cancelado text-sm hover:opacity-80">
                <AlertCircle size={15} /> Erro — repetir
              </button>
            ) : isResponsavel && aConfirmarPres ? (
              <span className="inline-flex items-center gap-2">
                <button onClick={() => { setConfirmarPres(false); pres.assinar() }}
                  className="px-3 py-1.5 rounded-lg bg-status-confirmado/15 border border-status-confirmado/40 text-status-confirmado text-xs font-medium hover:bg-status-confirmado/25 transition-colors">
                  Confirmar presença
                </button>
                <button onClick={() => setConfirmarPres(false)}
                  className="px-2 py-1.5 rounded-lg border border-border text-accent-subtle text-xs hover:text-accent transition-colors">
                  Cancelar
                </button>
              </span>
            ) : isResponsavel && presDisponivel ? (
              <button onClick={() => setConfirmarPres(true)} disabled={!colaborador}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-accent-muted text-xs font-medium hover:text-accent hover:border-white/25 transition-colors disabled:opacity-40">
                <MapPin size={14} /> Marcar presença
              </button>
            ) : isResponsavel ? (
              <span className="text-accent-subtle/60 text-xs">Disponível {TOLERANCIA_MIN} min antes do início</span>
            ) : null}
          </div>
          <button onClick={onFechar}
            className="w-11 h-11 rounded-full bg-surface-2 border border-border flex items-center justify-center text-accent-subtle hover:text-accent hover:bg-surface-3 active:scale-95 transition-all">
            <X size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}
