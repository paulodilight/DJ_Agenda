import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { SlotChip } from './SlotChip'
import { ModalSugestoes } from './ModalSugestoes'
import { isoData, nomeDiaSemana, formatarDataCurta } from '@/utils/datas'
import { isToday, isPast, format } from 'date-fns'
import { pt } from 'date-fns/locale'

const fds = (d) => d.getDay() === 5 || d.getDay() === 6  // Sexta ou Sábado

// ── Helpers para matching de turno por hora ──────────────────────────────────
function horaParaMins(hhmm) {
  const [h = 0, m = 0] = (hhmm ?? '00:00').split(':').map(Number)
  return h * 60 + m
}

/**
 * Para slots sem turno_id, devolve o índice do turno cujo hora_inicio
 * está mais próximo (por baixo) do hora_inicio do slot.
 * Suporta turnos nocturnos (00h-06h tratados como 24h-30h).
 */
function indiceTurnoPorHora(horaSlot, turnos) {
  if (!horaSlot || turnos.length <= 1) return 0
  const sm = horaParaMins(horaSlot)
  // Normaliza horas de madrugada (00-06) para continuidade nocturna
  const norm = (m) => (m < 360 ? m + 1440 : m)  // 360 = 6h
  const sn = norm(sm)
  let bestIdx = 0
  let bestDiff = Infinity
  turnos.forEach((t, i) => {
    if (!t.hora_inicio) return
    const tn = norm(horaParaMins(t.hora_inicio))
    const diff = sn - tn
    if (diff >= 0 && diff < bestDiff) { bestDiff = diff; bestIdx = i }
  })
  return bestIdx
}

// ── Chip de evento da supa_eventos ───────────────────────────────────────────
function EventoChip({ evento, onClick }) {
  const corStatus = {
    confirmado: 'border-blue-400/40 bg-blue-400/10 text-blue-300',
    proposta:   'border-yellow-400/40 bg-yellow-400/10 text-yellow-300',
    realizado:  'border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado',
    cancelado:  'border-status-cancelado/40 bg-status-cancelado/10 text-status-cancelado',
  }
  const cor = corStatus[evento.status?.toLowerCase()] ?? corStatus.proposta

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-2 py-1 rounded border text-[10px] leading-tight transition-colors hover:brightness-110',
        cor
      )}
    >
      <div className="font-semibold truncate">{evento.evento}</div>
      <div className="flex items-center gap-1 mt-0.5 text-[9px] opacity-70">
        {evento.hora_inicio && <span>{evento.hora_inicio.slice(0,5)}</span>}
        {evento.hora_instalacao && <span>· inst. {evento.hora_instalacao.slice(0,5)}</span>}
      </div>
    </button>
  )
}

// ── Célula de destino (droppable) ────────────────────────────────────────────
function DroppableTd({ dropId, children, className }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId })
  return (
    <td
      ref={setNodeRef}
      className={clsx(
        className,
        isOver && 'bg-status-confirmado/10 ring-1 ring-inset ring-status-confirmado/40',
      )}
    >
      {children}
    </td>
  )
}

// ── Chip flutuante no DragOverlay (exportado para uso em Agenda.jsx) ──────────
export function SlotChipOverlay({ slot }) {
  if (!slot) return null
  const temDJ       = !!slot.dj_nome
  const isManual    = temDJ && !slot.dj_id
  const isProposta  = temDJ && slot.estado === 'proposta'
  const isSemEfeito = slot.estado === 'sem_efeito'
  const isAPedido   = slot.estado === 'a_pedido'
  return (
    <div className={clsx(
      'px-3 py-1.5 rounded border text-xs font-semibold shadow-2xl cursor-grabbing opacity-90 rotate-1',
      isSemEfeito
        ? 'border-white/10 border-dashed bg-surface-2 text-accent-subtle/50'
        : isAPedido
          ? 'border-violet-400/35 bg-violet-400/20 text-violet-300'
          : isProposta
            ? 'border-status-proposta/40  bg-status-proposta/30  text-status-proposta'
            : isManual
              ? 'border-yellow-400/35      bg-yellow-400/20        text-yellow-300'
              : temDJ
                ? 'border-status-confirmado/35 bg-status-confirmado/20 text-status-confirmado'
                : 'border-surface-4            bg-surface-3            text-accent-subtle',
    )}>
      {isSemEfeito
        ? (temDJ ? <s>{slot.dj_nome}</s> : 'Sem Efeito')
        : (temDJ ? slot.dj_nome : 'Sem DJ')
      }
    </div>
  )
}

/**
 * @param {{
 *   dias: Date[],
 *   espacos: object[],
 *   agenda: object[],
 *   bloqueios: object[],
 *   onClickSlot: (slot: object) => void,
 *   onClickVazio: (data: string, espacoId: string, turnoId: string|null) => void,
 *   semanaLabel?: string,
 *   ocultarCabecalho?: boolean,
 * }} props
 */
export function CalendarioSemana({
  dias, espacos, agenda, bloqueios,
  onClickSlot, onClickVazio,
  semanaLabel, ocultarCabecalho = false,
  conflictsIdx = new Set(),
  onSugestaoAplicada,
  supaEventos = [],
  onClickEvento,
  onClickEventoVazio,
}) {
  const [sugestaoCtx, setSugestaoCtx] = useState(null) // { slot, espaco, turno }

  // Índice por "data|espaco_id|turno_id" (slots com turno)
  // e por "data|espaco_id" (slots sem turno — legado)
  const slotsIdx = useMemo(() => {
    const comTurno = {}
    const semTurno = {}
    agenda.forEach((slot) => {
      const base = `${slot.data}|${slot.espaco_id}`
      if (slot.turno_id) {
        const k = `${base}|${slot.turno_id}`
        if (!comTurno[k]) comTurno[k] = []
        comTurno[k].push(slot)
      } else {
        if (!semTurno[base]) semTurno[base] = []
        semTurno[base].push(slot)
      }
    })
    return { comTurno, semTurno }
  }, [agenda])

  // Locks activos indexados por "data|espaco_id"
  const locks = useMemo(() => {
    const idx = {}
    bloqueios.filter((b) => b.tipo === 'LOCK' && b.activo).forEach((b) => {
      idx[`${b.data}|${b.espaco_id}`] = b.dj_id
    })
    return idx
  }, [bloqueios])

  // Índice de eventos supa_eventos por "data_evento|espaco_id_dj"
  const eventosIdx = useMemo(() => {
    const idx = {}
    supaEventos.forEach(ev => {
      if (!ev.espaco_id_dj) return
      const k = `${ev.data_evento}|${ev.espaco_id_dj}`
      if (!idx[k]) idx[k] = []
      idx[k].push(ev)
    })
    return idx
  }, [supaEventos])

  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-xs border-collapse" style={{ minWidth: 700 }}>
        <colgroup>
          <col style={{ width: 190 }} />
          {dias.map((d) => <col key={isoData(d)} style={{ minWidth: 110 }} />)}
        </colgroup>

        {/* ── Cabeçalho de dias ── */}
        {!ocultarCabecalho && (
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-accent-subtle font-medium border-b border-r border-border sticky left-0 bg-surface-1 z-10">
                Turno
              </th>
              {dias.map((dia) => {
                const hoje = isToday(dia)
                const passado = isPast(dia) && !hoje
                return (
                  <th
                    key={isoData(dia)}
                    className={clsx(
                      'px-2 py-2 text-center font-medium border-b border-r border-border min-w-[110px]',
                      fds(dia)
                        ? 'bg-blue-400/[0.09] text-blue-300/80'
                        : hoje ? 'text-accent' : passado ? 'text-accent-subtle' : 'text-accent-muted'
                    )}
                  >
                    <div className={clsx(
                      'inline-flex flex-col items-center gap-0.5',
                      hoje && 'bg-white text-black rounded px-2 py-0.5'
                    )}>
                      <span className="uppercase tracking-wider text-[10px]">{nomeDiaSemana(dia)}</span>
                      <span>{formatarDataCurta(dia)}</span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
        )}

        <tbody>
          {/* ── Separador de semana (vista Mês) ── */}
          {semanaLabel && (
            <tr className="bg-surface-2/60 border-b border-border">
              <td className="px-3 py-2 text-xs font-semibold text-accent-muted uppercase tracking-widest sticky left-0 bg-surface-2/60 z-10 whitespace-nowrap">
                {semanaLabel}
              </td>
              {dias.map((dia) => (
                <td key={isoData(dia)} className={clsx(
                  'px-2 py-2 text-xs font-semibold text-center border-l border-border/40',
                  isToday(dia) ? 'text-status-confirmado' : 'text-accent-muted'
                )}>
                  {format(dia, 'd MMM', { locale: pt })}
                </td>
              ))}
            </tr>
          )}

          {/* ── Por espaço → cabeçalho + linhas de turnos ── */}
          {espacos.map((espaco) => {
            const turnos = [...(espaco.turnos_espaco ?? [])]
              .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))

            // Se não houver turnos configurados, mostra uma linha genérica
            const turnoRows = turnos.length > 0
              ? turnos
              : [{ id: null, nome: '—' }]

            return [
              /* ── Cabeçalho do espaço ── */
              <tr key={`hdr-${espaco.id}`} className="border-t-2 border-border bg-surface-2">
                <td
                  colSpan={dias.length + 1}
                  className="px-4 py-1.5 font-bold text-accent text-[11px] uppercase tracking-widest"
                >
                  {espaco.nome}
                </td>
              </tr>,

              /* ── Uma linha por turno ── */
              ...turnoRows.map((turno, ti) => (
                <tr key={`${espaco.id}-${turno.id ?? ti}`} className={ti % 2 === 0 ? 'bg-surface-0' : 'bg-surface-1'}>
                  {/* Nome do turno */}
                  <td className="px-3 py-2 text-accent-muted border-r border-b border-border sticky left-0 bg-inherit z-10 whitespace-nowrap">
                    {espaco.nome} <span className="text-accent-subtle">({turno.nome})</span>
                  </td>

                  {/* Células por dia */}
                  {dias.map((dia) => {
                    const dataStr = isoData(dia)
                    const base    = `${dataStr}|${espaco.id}`
                    const isLock  = !!locks[base]
                    const dropId  = `${dataStr}|${espaco.id}|${turno.id ?? '_'}`

                    // Slots com turno_id específico + slots sem turno_id distribuídos por hora
                    const semTurnoBase = slotsIdx.semTurno[base] ?? []
                    const semTurnoAqui = turnoRows.length > 1
                      ? semTurnoBase.filter(s => indiceTurnoPorHora(s.hora_inicio, turnoRows) === ti)
                      : (ti === 0 ? semTurnoBase : [])
                    const slots = [
                      ...(turno.id ? (slotsIdx.comTurno[`${base}|${turno.id}`] ?? []) : []),
                      ...semTurnoAqui,
                    ]

                    // Dia operacional: turno sem dias_semana configurados = sempre activo
                    const operaNesteDia = !turno.dias_semana?.length || turno.dias_semana.includes(dia.getDay())

                    return (
                      <DroppableTd
                        key={dataStr}
                        dropId={dropId}
                        className={clsx(
                          'px-1.5 py-1.5 border-r border-b border-border align-top',
                          !operaNesteDia
                            ? 'bg-black/[0.28]'
                            : fds(dia) ? 'bg-blue-400/[0.06]' : ''
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          {slots.length > 0
                            ? slots.map((slot) => (
                                <SlotChip
                                  key={slot.id}
                                  slot={slot}
                                  isLock={isLock}
                                  onClick={() => onClickSlot(slot)}
                                  onSugerir={() => setSugestaoCtx({ slot, espaco, turno: turno.id ? turno : null })}
                                  dragId={`chip-${slot.id}`}
                                  dragData={{ slot }}
                                  conflito={conflictsIdx.has(slot.id)}
                                />
                              ))
                            : <SlotChip
                                dimmed={!operaNesteDia}
                                onClickVazio={() => onClickVazio(dataStr, espaco.id, turno.id)}
                              />
                          }
                        </div>
                      </DroppableTd>
                    )
                  })}
                </tr>
              )),

              /* ── Linha de Eventos — sempre visível ── */
              <tr key={`eventos-row-${espaco.id}`} className="bg-blue-950/20">
                <td className="px-3 py-1 text-accent-muted border-r border-b border-border sticky left-0 bg-inherit z-10 whitespace-nowrap">
                  <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Eventos</span>
                </td>
                {dias.map(dia => {
                  const dataStr = isoData(dia)
                  const evs = eventosIdx[`${dataStr}|${espaco.id}`] ?? []
                  return (
                    <td
                      key={dataStr}
                      className={clsx(
                        'px-1.5 py-1.5 border-r border-b border-border',
                        evs.length > 0 ? 'align-top' : 'align-middle',
                        fds(dia) ? 'bg-blue-400/[0.06]' : ''
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        {evs.map(ev => (
                          <EventoChip
                            key={ev.id}
                            evento={ev}
                            onClick={() => onClickEvento?.(ev)}
                          />
                        ))}
                        {onClickEventoVazio && (
                          <button
                            onClick={() => onClickEventoVazio(dataStr, espaco.id)}
                            className="w-full flex items-center justify-center py-1 rounded text-blue-400/30 hover:text-blue-400 hover:bg-blue-400/10 border border-dashed border-transparent hover:border-blue-400/30 transition-colors"
                            title="Adicionar evento"
                          >
                            <Plus size={10} />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>,
            ]
          })}

          {espacos.length === 0 && (
            <tr>
              <td colSpan={dias.length + 1} className="text-center py-8 text-accent-subtle">
                Nenhum espaço activo.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ModalSugestoes
        aberto={!!sugestaoCtx}
        slot={sugestaoCtx?.slot ?? null}
        espaco={sugestaoCtx?.espaco ?? null}
        turno={sugestaoCtx?.turno ?? null}
        onFechar={() => setSugestaoCtx(null)}
        onAplicado={() => { setSugestaoCtx(null); onSugestaoAplicada?.() }}
      />
    </div>
  )
}
