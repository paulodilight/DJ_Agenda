import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek,
} from 'date-fns'
import { pt } from 'date-fns/locale'
import { useAgenda } from '@/hooks/useAgenda'
import { useEspacos } from '@/hooks/useEspacos'
import { useSupaEventos } from '@/hooks/useSupaEventos'
import { espacosApi, turnoValoresDiaApi, agendaApi, disponibilidadesApi } from '@/lib/api'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { FormSlot } from '@/components/agenda/FormSlot'
import { FormEvento } from '@/components/eventos/FormEvento'
import { FormDisponibilidade } from '@/components/disponibilidades/FormDisponibilidade'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { formatarHora, formatarData } from '@/utils/datas'
import { formatarEuro } from '@/utils/formatacao'
import { useMesStore } from '@/store'
import { clsx } from 'clsx'
import { CalendarCheck, Eye, Sparkles } from 'lucide-react'
import { ModalSugestoes } from '@/components/agenda/ModalSugestoes'
import {
  DndContext, DragOverlay,
  useDraggable, useDroppable,
  MouseSensor, TouchSensor,
  useSensors, useSensor,
} from '@dnd-kit/core'
import { correrDistribuicao, calcularPreAlocacoes } from '@/lib/distribuicao'
import { useConflitos } from '@/hooks/useConflitos'
import { supabase } from '@/lib/supabase'

const ORDINALS = ['1ª', '2ª', '3ª', '4ª', '5ª']
const HOJE = format(new Date(), 'yyyy-MM-dd')

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const isoData = (d) => format(d, 'yyyy-MM-dd')
const diaSemana = (d) => d.getDay() // 0=dom, 1=seg, ..., 4=qui, 5=sex, 6=sab

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
  const norm = (m) => (m < 360 ? m + 1440 : m)
  const sn = norm(horaParaMins(horaSlot))
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

function corLinha(d, eHoje) {
  if (eHoje) return 'bg-status-confirmado/10 border-l-2 border-l-status-confirmado'
  const dia = diaSemana(d)
  if (dia === 5 || dia === 6) return 'bg-blue-400/[0.05] border-l-2 border-l-blue-400/20'
  return ''
}

// Cor da linha na vista de distribuição:
//   - Hoje → verde
//   - Dia activo no turno, sem todos os dias configurados → corLinha normal (azul Sex/Sáb)
//   - Todos os dias activos → sem destaque (todas iguais)
//   - Dia não configurado no turno → fundo subtilmente diferente
function corLinhaDistrib(d, eHoje, operaNesteDia) {
  if (eHoje) return 'bg-status-confirmado/10 border-l-2 border-l-status-confirmado'
  const dia = diaSemana(d)
  if (dia === 5 || dia === 6) return 'bg-blue-400/[0.07]'
  if (!operaNesteDia) return 'bg-surface-0'
  return d.getDate() % 2 === 0 ? 'bg-surface-0' : 'bg-surface-1'
}

// td droppável — destaca quando um slot passa por cima
function DroppableTd({ dropId, children, className }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId })
  return (
    <td
      ref={setNodeRef}
      className={clsx(className, isOver && 'bg-status-confirmado/10 ring-1 ring-inset ring-status-confirmado/40')}
    >
      {children}
    </td>
  )
}

// Chip flutuante durante o arrasto (DragOverlay)
function SlotCellOverlay({ slot }) {
  const temDJ       = !!slot.dj_nome
  const isManual    = temDJ && !slot.dj_id
  const isProposta  = temDJ && slot.estado === 'proposta'
  const isSemEfeito = slot.estado === 'sem_efeito'
  const isAPedido   = slot.estado === 'a_pedido'
  return (
    <div className={clsx(
      'px-3 py-1.5 rounded border text-xs font-semibold shadow-2xl cursor-grabbing opacity-90 rotate-1',
      isSemEfeito ? 'border-white/10 border-dashed bg-surface-2 text-accent-subtle/50' :
      isAPedido   ? 'border-violet-400/35 bg-violet-400/20 text-violet-300'             :
      isProposta  ? 'border-status-proposta/40  bg-status-proposta/30  text-status-proposta'  :
      isManual    ? 'border-yellow-400/35        bg-yellow-400/20        text-yellow-300'       :
      temDJ       ? 'border-status-confirmado/35 bg-status-confirmado/20 text-status-confirmado' :
                    'border-surface-4            bg-surface-3            text-accent-subtle'
    )}>
      {isSemEfeito
        ? (temDJ ? <s>{slot.dj_nome}</s> : 'Sem Efeito')
        : (temDJ ? slot.dj_nome : 'Sem DJ')
      }
    </div>
  )
}

// Célula de slot por turno — draggable quando tem DJ
function SlotCell({ slot, onEditar, onCriar, onSugerir, dimmed = false, dragId, conflito = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId ?? 'slot-empty',
    disabled: !slot,
    data: { slot },
  })

  if (!slot) {
    return (
      <button
        onClick={onCriar}
        className={clsx(
          'w-full px-2 py-1 rounded border border-dashed text-sm transition-colors min-h-[34px] flex items-center justify-center',
          dimmed
            ? 'border-surface-4/15 bg-black/[0.35] text-white/[0.07] hover:text-white/20 hover:border-surface-4/40'
            : 'border-surface-4 bg-surface-2 text-accent-subtle/40 hover:text-accent-subtle hover:border-border'
        )}
      >
        +
      </button>
    )
  }

  const temDJ       = !!slot.dj_nome
  const isManual    = temDJ && !slot.dj_id
  const isProposta  = temDJ && slot.estado === 'proposta'
  const isSemEfeito = slot.estado === 'sem_efeito'
  const isAPedido   = slot.estado === 'a_pedido'

  const btn = (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onEditar(slot)}
      className={clsx(
        'w-full text-center px-2 py-1 rounded border transition-colors min-h-[34px] flex items-center justify-center cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-30',
        onSugerir && !isSemEfeito && 'pr-5',
        conflito
          ? 'border-red-500/60 bg-red-500/15 hover:bg-red-500/25'
          : isSemEfeito
            ? 'border-white/[0.07] border-dashed bg-surface-1/50 hover:bg-surface-2'
            : isAPedido
              ? 'border-violet-400/35 bg-violet-400/[0.13] hover:bg-violet-400/20'
              : isProposta
                ? 'border-status-proposta/40 bg-status-proposta/[0.17] hover:bg-status-proposta/25'
                : isManual
                  ? 'border-yellow-400/35 bg-yellow-400/[0.11] hover:bg-yellow-400/20'
                  : temDJ
                    ? 'border-status-confirmado/35 bg-status-confirmado/[0.13] hover:bg-status-confirmado/20'
                    : 'border-surface-4 bg-surface-3 hover:bg-surface-4 hover:border-border'
      )}
    >
      {isSemEfeito ? (
        <span className="text-xs text-accent-subtle/40 italic">
          {temDJ ? <s>{slot.dj_nome}</s> : 'Sem Efeito'}
        </span>
      ) : (
        <span className={clsx(
          'text-xs truncate',
          conflito   ? 'font-semibold text-red-400'               :
          isAPedido  ? 'font-semibold text-violet-300'             :
          isProposta ? 'font-semibold text-status-proposta'        :
          isManual   ? 'font-semibold text-yellow-300'             :
          temDJ      ? 'font-semibold text-status-confirmado'      :
                       'italic text-accent-subtle'
        )}>
          {temDJ ? slot.dj_nome : 'Sem DJ'}
        </span>
      )}
    </button>
  )

  if (!onSugerir || isSemEfeito) return btn

  return (
    <div className="relative group/cell">
      {btn}
      <button
        onClick={(e) => { e.stopPropagation(); onSugerir() }}
        title="Sugerir DJ"
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center
          opacity-0 group-hover/cell:opacity-100 transition-opacity
          bg-black/30 hover:bg-black/60 text-accent-subtle hover:text-accent"
      >
        <Sparkles size={9} />
      </button>
    </div>
  )
}

// Célula de evento — fundo transparente (igual à linha), só texto
function EventoCell({ evento, onEditar, onCriar, extra = 0 }) {
  if (!evento) {
    return (
      <button
        onClick={onCriar}
        className="w-full px-2 py-1 rounded border border-dashed border-surface-4/50 bg-transparent text-accent-subtle/30 hover:text-accent-subtle hover:border-border transition-colors min-h-[34px] flex items-center justify-center text-sm"
      >
        +
      </button>
    )
  }
  const cancelado = evento.status === 'cancelado'
  return (
    <button
      onClick={() => onEditar(evento)}
      className={clsx(
        'w-full text-center px-2 py-1 rounded transition-colors min-h-[34px] flex items-center justify-center gap-1 bg-transparent hover:bg-surface-3/50',
        cancelado && 'opacity-40 line-through'
      )}
    >
      <span className="text-xs font-medium text-accent truncate">{evento.evento}</span>
      {extra > 0 && <span className="text-[10px] text-accent-subtle shrink-0">+{extra}</span>}
    </button>
  )
}

export function Distribuicao() {
  const { anoMes, navegar } = useMesStore()
  const [espacoId, setEspacoId] = useState(null)
  const [turnos, setTurnos] = useState([])
  const [configDiaMap, setConfigDiaMap] = useState({}) // { [turnoId]: { [diaSem]: { hora_inicio, hora_fim, valor } } }
  const [turnoActivoIdx, setTurnoActivoIdx] = useState(0)
  const [vistaAllDJs, setVistaAllDJs] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [slotActual, setSlotActual] = useState(null)
  const [distribuindo, setDistribuindo] = useState(false)
  const [dispModalAberto, setDispModalAberto]     = useState(false)
  const [eventoModalAberto, setEventoModalAberto] = useState(false)
  const [eventoActual, setEventoActual]           = useState(null)
  const [eventoDataInicial, setEventoDataInicial] = useState('')
  const [notasEventoAberto, setNotasEventoAberto] = useState(null)
  const [mostrarEvDetalhes, setMostrarEvDetalhes] = useState(false)
  const [activeSlot, setActiveSlot] = useState(null)
  const [confirmPendente, setConfirmPendente] = useState(null) // { avisos, executar }
  const [sugestaoCtx, setSugestaoCtx] = useState(null) // { slot, espaco, turno }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const handleDragEnd = async ({ active, over }) => {
    setActiveSlot(null)
    if (!over) return
    const draggedSlot = active.data.current?.slot
    if (!draggedSlot) return

    const [targetIso, targetTurnoRaw] = over.id.split('|')
    const targetTurnoId = targetTurnoRaw === '_' ? null : (targetTurnoRaw ?? null)

    // Mesma posição — nada a fazer
    if (draggedSlot.data === targetIso &&
        String(draggedSlot.turno_id ?? '_') === String(targetTurnoId ?? '_')) return

    const targetSlots = slotsMap[targetIso] ?? []
    const targetSlot  = targetSlots.find(s =>
      String(s.turno_id ?? '_') === String(targetTurnoId ?? '_') && s.id !== draggedSlot.id
    ) ?? null

    const params = { draggedSlot, targetIso, targetTurnoId, targetSlot }

    // ── Verificar indisponibilidades ────────────────────────────────────────
    const [indispA, indispB] = await Promise.all([
      draggedSlot.dj_id
        ? disponibilidadesApi.verificarIndisponivel(draggedSlot.dj_id, targetIso)
        : Promise.resolve(null),
      targetSlot?.dj_id && targetIso !== draggedSlot.data
        ? disponibilidadesApi.verificarIndisponivel(targetSlot.dj_id, draggedSlot.data)
        : Promise.resolve(null),
    ])

    const avisos = []
    if (indispA) {
      const nota = indispA.notas ? ` — "${indispA.notas}"` : ''
      avisos.push(`${draggedSlot.dj_nome} está indisponível em ${targetIso}${nota}`)
    }
    if (indispB) {
      const nota = indispB.notas ? ` — "${indispB.notas}"` : ''
      avisos.push(`${targetSlot.dj_nome} está indisponível em ${draggedSlot.data}${nota}`)
    }

    if (avisos.length > 0) {
      setConfirmPendente({ avisos, executar: () => executarMoverDistrib(params) })
      return
    }

    await executarMoverDistrib(params)
  }

  const executarMoverDistrib = async ({ draggedSlot, targetIso, targetTurnoId, targetSlot }) => {
    try {
      if (targetSlot) {
        await Promise.all([
          agendaApi.moverSlot(draggedSlot.id, { data: targetIso,        turno_id: targetTurnoId }),
          agendaApi.moverSlot(targetSlot.id,  { data: draggedSlot.data, turno_id: draggedSlot.turno_id ?? null }),
        ])
      } else {
        await agendaApi.moverSlot(draggedSlot.id, { data: targetIso, turno_id: targetTurnoId })
      }
      recarregarSilencioso()
    } catch (e) {
      alert('Erro ao mover atuação: ' + e.message)
    }
  }

  const distribuir = async () => {
    if (espacos.length === 0) return
    setDistribuindo(true)
    try {
      // Ordenar espaços para distribuição justa:
      //   1º critério: nº de dias de operação (ASC) — espaços mais restritos correm antes dos mais flexíveis
      //   2º critério: nº de DJs "preferidos" COM registos este mês (DESC) — desempate por preferências
      //   Exemplo: Delibar (Sex/Sáb=2 dias) → Frou Frou (Ter-Sáb=5 dias) → Avenida (todos=7 dias)
      //   Isto garante que Frou Frou não fica bloqueado pela Avenida (que opera todos os dias)

      const [prefsRes, turnosRes, djsComRegRes, preAlocacoes] = await Promise.all([
        supabase.from('espaco_dj_preferencias').select('espaco_id, dj_id').eq('tipo', 'preferido'),
        supabase.from('turnos_espaco').select('espaco_id, dias_semana'),
        supabase.from('disponibilidades')
          .select('dj_id')
          .gte('data', dataInicio)
          .lte('data', dataFim),
        calcularPreAlocacoes(anoMes),
      ])

      // DJs com registos este mês
      const djsActivos = new Set((djsComRegRes.data ?? []).map(r => r.dj_id))

      // Preferidos filtrados a DJs activos este mês
      const prefCount = {}
      ;(prefsRes.data ?? []).forEach(p => {
        if (djsActivos.has(p.dj_id)) {
          prefCount[p.espaco_id] = (prefCount[p.espaco_id] ?? 0) + 1
        }
      })

      // Dias de operação únicos por espaço
      const opDias = {}
      ;(turnosRes.data ?? []).forEach(t => {
        if (!opDias[t.espaco_id]) opDias[t.espaco_id] = new Set()
        ;(t.dias_semana ?? []).forEach(d => opDias[t.espaco_id].add(d))
      })

      const espacosOrdenados = [...espacos].sort((a, b) => {
        // 1º: ordem_distribuicao manual (valores definidos primeiro, em ASC)
        //     Espaços sem valor ficam no fim e usam os critérios automáticos
        const aOrdem = a.ordem_distribuicao ?? Infinity
        const bOrdem = b.ordem_distribuicao ?? Infinity
        if (aOrdem !== bOrdem) return aOrdem - bOrdem
        // 2º: menos dias de operação primeiro (mais restritos = mais prioritários)
        const dd = (opDias[a.id]?.size ?? 7) - (opDias[b.id]?.size ?? 7)
        if (dd !== 0) return dd
        // 3º: empate em dias → mais preferidos entre DJs activos primeiro
        return (prefCount[b.id] ?? 0) - (prefCount[a.id] ?? 0)
      })

      let totalInseridos = 0
      // Corre para cada espaço em sequência — assim cada espaço vê
      // os slots já inseridos nos espaços anteriores (conflitos cross-espaço corretos)
      for (const espaco of espacosOrdenados) {
        const { inseridos } = await correrDistribuicao({
          anoMes,
          espacoId: espaco.id,
          preAlocacoes,
        })
        totalInseridos += inseridos
      }
      await recarregar()
      console.info(`Distribuição concluída: ${totalInseridos} slots inseridos em ${espacos.length} espaços.`)
    } catch (e) {
      alert('Erro na distribuição: ' + e.message)
    } finally {
      setDistribuindo(false)
    }
  }

  const { espacos, loading: loadingEspacos } = useEspacos({ anoMes })
  const espacoSeleccionado = espacoId ?? espacos[0]?.id ?? null
  const espacoNome = espacos.find((e) => e.id === espacoSeleccionado)?.nome?.trim() ?? ''

  // Carregar turnos do espaço seleccionado; reset ao turno 0
  useEffect(() => {
    if (!espacoSeleccionado) return
    setTurnoActivoIdx(0)
    setVistaAllDJs(true)
    espacosApi.buscarCompleto(espacoSeleccionado)
      .then(async (e) => {
        const turnosCarregados = e.turnos ?? []
        setTurnos(turnosCarregados)
        // Carregar config por dia (hora + valor)
        if (turnosCarregados.length > 0) {
          try {
            const valoresData = await turnoValoresDiaApi.listarPorEspaco(espacoSeleccionado)
            const mapa = {}
            valoresData.forEach(({ turno_id, dia_semana, valor, hora_inicio, hora_fim }) => {
              if (!mapa[turno_id]) mapa[turno_id] = {}
              mapa[turno_id][dia_semana] = {
                valor,
                hora_inicio: hora_inicio ? hora_inicio.slice(0, 5) : null,
                hora_fim:    hora_fim    ? hora_fim.slice(0, 5)    : null,
              }
            })
            setConfigDiaMap(mapa)
          } catch { /* silencioso */ }
        }
      })
      .catch(() => { setTurnos([]); setConfigDiaMap({}) })
  }, [espacoSeleccionado])

  // Turno genérico se não houver turnos configurados
  const turnosEffectivos = turnos.length > 0
    ? turnos
    : [{ id: '_1', nome: '1º Turno', hora_inicio: '20:00', hora_fim: '02:00', dias_semana: [] }]

  const { dataInicio, dataFim, diasDoMes, titulo } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    const start = startOfMonth(ref)
    const end = endOfMonth(ref)
    return {
      dataInicio: format(start, 'yyyy-MM-dd'),
      dataFim: format(end, 'yyyy-MM-dd'),
      diasDoMes: eachDayOfInterval({ start, end }),
      titulo: cap(format(ref, 'MMMM yyyy', { locale: pt })),
    }
  }, [anoMes])

  const { agenda, loading, recarregar, recarregarSilencioso } = useAgenda({
    dataInicio,
    dataFim,
    espacoId: espacoSeleccionado,
  })

  // Agenda sem filtro de espaço — necessária para detectar duplicados cross-espaço
  const { agenda: agendaGeral, recarregar: recarregarGeral } = useAgenda({ dataInicio, dataFim })
  const { conflictsIdx } = useConflitos({ agenda: agendaGeral, dataInicio, dataFim })

  const { eventos, recarregar: recarregarEventos } = useSupaEventos({ dataInicio, dataFim })

  // eventosMap[iso] = [evento, ...] — filtrado pelo espaço seleccionado (ou sem espaço)
  const eventosMap = useMemo(() => {
    const map = {}
    eventos
      .filter(e => !e.espaco_id_dj || e.espaco_id_dj === espacoSeleccionado)
      .forEach((e) => {
        const key = e.data_evento
        if (!key) return
        if (!map[key]) map[key] = []
        map[key].push(e)
      })
    return map
  }, [eventos, espacoSeleccionado])

  const abrirCriarEvento = useCallback((iso) => {
    setEventoActual(null)
    setEventoDataInicial(iso)
    setEventoModalAberto(true)
  }, [])

  const abrirEditarEvento = useCallback((ev) => {
    setEventoActual(ev)
    setEventoDataInicial('')
    setEventoModalAberto(true)
  }, [])

  const fecharEventoModal = () => { setEventoModalAberto(false); setEventoActual(null) }

  // slotsMap[iso] = [slot ordenado por hora_inicio]
  const slotsMap = useMemo(() => {
    const map = {}
    agenda.forEach((s) => {
      if (!map[s.data]) map[s.data] = []
      map[s.data].push(s)
    })
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))
    )
    return map
  }, [agenda])

  // Agrupa dias por semana (Seg–Dom)
  const semanas = useMemo(() => {
    const grupos = []
    let semanaActual = null
    diasDoMes.forEach((d) => {
      const ws = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      if (ws !== semanaActual) { semanaActual = ws; grupos.push({ ws, dias: [] }) }
      grupos[grupos.length - 1].dias.push(d)
    })
    return grupos
  }, [diasDoMes])

  const abrirEditar = useCallback((slot) => {
    const evsDia = eventosMap[slot.data] ?? []
    setSlotActual({
      ...slot,
      // se o slot ainda não tem evento preenchido, sugere o evento do dia
      evento: slot.evento || evsDia[0]?.evento || '',
    })
    setModalAberto(true)
  }, [eventosMap])

  const abrirCriar = useCallback((iso, turno) => {
    // Calcular dia da semana para o iso (0=dom, 1=seg, ..., 6=sáb)
    const [y, m, d] = iso.split('-').map(Number)
    const diaSem = new Date(y, m - 1, d).getDay()
    const cfg = configDiaMap[turno.id]?.[diaSem]
    const evsDia = eventosMap[iso] ?? []
    setSlotActual({
      espaco_id:   espacoSeleccionado,
      turno_id:    turno.id,
      data:        iso,
      hora_inicio: cfg?.hora_inicio ?? turno.hora_inicio ?? '20:00',
      hora_fim:    cfg?.hora_fim    ?? turno.hora_fim    ?? '02:00',
      valor:       cfg?.valor       ?? turno.valor       ?? null,
      evento:      evsDia[0]?.evento ?? '',
    })
    setModalAberto(true)
  }, [espacoSeleccionado, configDiaMap, eventosMap])

  const fecharModal = () => { setModalAberto(false); setSlotActual(null) }

  // Turno activo (um de cada vez, protegido contra índice fora dos limites)
  const turnoActivo = turnosEffectivos[Math.min(turnoActivoIdx, turnosEffectivos.length - 1)] ?? turnosEffectivos[0]

  // Larguras fixas — adapta conforme mostrarEvDetalhes
  // Expandido: 5 colunas de evento (Nome | Horário | Instalação | Técnico | Notas)
  // Colapsado: 1 coluna (só Nome) — esquerda ganha espaço
  const colW = mostrarEvDetalhes
    ? { dia: '7%', data: '6%', dj: '12%', hr: '8%', val: '7%', evNome: '18%', evHr: '10%', evInst: '12%', evTec: '12%', evNotas: '8%' }
    : { dia: '10%', data: '8%', dj: '24%', hr: '15%', val: '13%', evNome: '30%' }

  // Indicador de preenchimento do mês
  // Quando num turno específico → só esse turno; em All DJs → todos os turnos
  const indicador = useMemo(() => {
    const turnos = vistaAllDJs ? turnosEffectivos : [turnoActivo]

    const esperados = turnos.reduce((total, turno) => {
      if (!turno.dias_semana?.length) return total
      return total + diasDoMes.filter(d => turno.dias_semana.includes(diaSemana(d))).length
    }, 0)

    const turnoIds = new Set(turnos.map(t => t.id))
    const agendaTurno = vistaAllDJs ? agenda : agenda.filter(s => turnoIds.has(s.turno_id))

    const comDJ  = agendaTurno.filter(s => s.dj_id || s.dj_nome).length
    const semDJ  = agendaTurno.length - comDJ
    const faltam = Math.max(0, (esperados - agendaTurno.length) + semDJ)

    return { esperados, comDJ, faltam, ok: esperados > 0 && faltam === 0 }
  }, [vistaAllDJs, turnoActivo, turnosEffectivos, diasDoMes, agenda])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-semibold text-accent uppercase tracking-wide">
              Programa {titulo}
            </h1>
            {espacoNome && <p className="text-xs text-accent-muted mt-0.5">{espacoNome}</p>}
          </div>

          {/* Indicador de preenchimento — centro */}
          {indicador.esperados > 0 && (
            indicador.ok ? (
              <span className="text-sm font-bold tracking-widest uppercase text-status-confirmado">
                ✓ Datas Completas · {indicador.comDJ} / {indicador.esperados}
              </span>
            ) : (
              <span className="text-sm font-bold tracking-widest uppercase text-orange-400">
                Faltam {indicador.faltam} {indicador.faltam === 1 ? 'data' : 'datas'} · {indicador.comDJ} / {indicador.esperados}
              </span>
            )
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDispModalAberto(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-accent-muted hover:text-accent hover:border-white/20 transition-colors text-xs font-medium"
            >
              <CalendarCheck size={12} />
              Disponibilidade DJs
            </button>
            <button
              onClick={distribuir}
              disabled={distribuindo || espacos.length === 0}
              className="px-4 py-1.5 rounded border font-semibold text-xs tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-accent text-black border-accent hover:bg-accent/80"
            >
              {distribuindo ? '⏳ A distribuir…' : '▶ DISTRIBUI'}
            </button>
          </div>
        </div>

        {/* Tabs espaços */}
        {!loadingEspacos && (
          <div className="flex gap-1 mt-3 flex-wrap">
            {espacos.map((e) => (
              <button
                key={e.id}
                onClick={() => setEspacoId(e.id)}
                className={clsx(
                  'px-3 py-1.5 rounded text-xs transition-colors border',
                  espacoSeleccionado === e.id
                    ? 'bg-surface-3 text-accent border-white/20 font-medium'
                    : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
                )}
              >
                {e.nome.trim()}
              </button>
            ))}
          </div>
        )}

        {/* Tabs turnos + All DJs */}
        {turnosEffectivos.length > 1 && (
          <div className="flex items-center gap-1 mt-2">
            {/* All DJs — primeiro */}
            <button
              onClick={() => setVistaAllDJs(true)}
              className={clsx(
                'px-3 py-1 rounded text-xs transition-colors border font-medium',
                vistaAllDJs
                  ? 'bg-surface-3 text-accent border-white/20'
                  : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
              )}
            >
              All DJs
            </button>
            {/* Separador */}
            <span className="text-border/50 text-xs px-1">|</span>
            {turnosEffectivos.map((t, i) => (
              <button
                key={t.id ?? i}
                onClick={() => { setTurnoActivoIdx(i); setVistaAllDJs(false) }}
                className={clsx(
                  'px-3 py-1 rounded text-xs transition-colors border',
                  !vistaAllDJs && turnoActivoIdx === i
                    ? 'bg-accent/15 text-accent border-accent/40 font-medium'
                    : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
                )}
              >
                {t.nome}
                {t.hora_inicio && (
                  <span className={clsx('ml-1.5 font-normal', !vistaAllDJs && turnoActivoIdx === i ? 'text-accent/60' : 'text-accent-subtle')}>
                    {formatarHora(t.hora_inicio)}–{formatarHora(t.hora_fim)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabela */}
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveSlot(active.data.current?.slot ?? null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveSlot(null)}
      >
      <div className="flex-1 overflow-auto border border-white/10 rounded-b">
        {loading ? <LoadingPage /> : (vistaAllDJs && turnosEffectivos.length > 1) ? (

          /* ── Vista All DJs: Dia | Data | [turno: DJ | Horário] × N | Evento ── */
          (() => {
            const n   = turnosEffectivos.length
            const tp  = 68 / n   // deixa 32% para colunas de evento
            const wDJ = `${(tp * 0.65).toFixed(1)}%`
            const wHr = `${(tp * 0.35).toFixed(1)}%`
            const totalCols = 2 + n * 2 + (mostrarEvDetalhes ? 5 : 1)
            return (
              <table className="text-xs border-collapse table-fixed w-full">
                <thead className="sticky top-0 z-10 bg-surface-1 border-b-2 border-border">
                  {/* Linha 1: turno headers + grupo evento */}
                  <tr className="border-b border-border/50">
                    <th style={{ width: '8%' }}  className="text-center px-3 py-2 font-medium text-accent-muted" rowSpan={2}>Dia</th>
                    <th style={{ width: '6%' }}  className="text-center px-3 py-2 font-medium text-accent-muted" rowSpan={2}>Data</th>
                    {turnosEffectivos.map((t, i) => (
                      <th key={t.id ?? i} colSpan={2}
                        className="text-center px-3 py-2 font-semibold text-accent border-l-2 border-l-white/15 bg-surface-2/50">
                        {t.nome}
                        {t.hora_inicio && (
                          <span className="ml-1.5 text-[11px] font-normal text-accent-muted">
                            {formatarHora(t.hora_inicio)}–{formatarHora(t.hora_fim)}
                          </span>
                        )}
                      </th>
                    ))}
                    <th colSpan={mostrarEvDetalhes ? 5 : 1} className="px-3 py-1.5 border-l-2 border-l-white/10 bg-surface-2/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-accent text-[11px] tracking-widest uppercase">Evento</span>
                        <button
                          onClick={() => setMostrarEvDetalhes(v => !v)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors whitespace-nowrap"
                          title={mostrarEvDetalhes ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                        >
                          {mostrarEvDetalhes ? '◀ ocultar' : '▶ detalhe'}
                        </button>
                      </div>
                    </th>
                  </tr>
                  {/* Linha 2: DJ + Horário por turno + sub-colunas evento */}
                  <tr className="border-b border-border">
                    {turnosEffectivos.map((t, i) => (
                      <>
                        <th key={`${t.id}-dj`} style={{ width: wDJ }} className="text-center px-3 py-2 font-medium text-accent-muted border-l-2 border-l-white/15">DJ</th>
                        <th key={`${t.id}-hr`} style={{ width: wHr }} className="text-center px-3 py-2 font-medium text-accent-muted whitespace-nowrap">Horário</th>
                      </>
                    ))}
                    <th style={{ width: '11%' }} className="text-center px-3 py-2 font-medium text-accent-subtle border-l-2 border-l-white/10">Nome</th>
                    {mostrarEvDetalhes && <>
                      <th style={{ width: '7%' }}  className="text-center px-3 py-2 font-medium text-accent-subtle whitespace-nowrap">Horário</th>
                      <th style={{ width: '9%' }}  className="text-center px-3 py-2 font-medium text-accent-subtle whitespace-nowrap">Instalação</th>
                      <th style={{ width: '8%' }}  className="text-center px-3 py-2 font-medium text-accent-subtle">Técnico</th>
                      <th style={{ width: '6%' }}  className="text-center px-3 py-2 font-medium text-accent-subtle">Notas</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {semanas.flatMap(({ ws, dias }, semanaIdx) => [
                    <tr key={`sep-${ws}`} className="border-t border-white/10 bg-white/5">
                      <td colSpan={totalCols} className="px-3 py-1.5 text-[11px] font-semibold text-accent-subtle/60 uppercase tracking-widest">
                        {ORDINALS[semanaIdx]} Semana
                      </td>
                    </tr>,
                    ...dias.map((d) => {
                      const iso   = isoData(d)
                      const eHoje = iso === HOJE
                      const slots = slotsMap[iso] ?? []
                      const algumTurnoActivo = turnosEffectivos.some(t =>
                        !t.dias_semana || (t.dias_semana.length > 0 && t.dias_semana.includes(diaSemana(d)))
                      )
                      const evsHoje = eventosMap[iso] ?? []
                      const ev      = evsHoje[0] ?? null
                      const evExtra = evsHoje.length - 1
                      const tecnico = ev?.responsavel ?? null
                      // dia "off" mas com evento → trata como dia activo
                      const diaActivo = algumTurnoActivo || evsHoje.length > 0
                      return (
                        <tr key={iso} className={clsx(
                          'border-b border-border/20 transition-colors',
                          corLinhaDistrib(d, eHoje, diaActivo)
                        )}>
                          <td className={clsx('px-3 py-2 text-center whitespace-nowrap', eHoje ? 'text-status-confirmado' : diaActivo ? 'text-accent-muted' : 'text-accent-subtle/50')}>
                            {cap(format(d, 'EEE', { locale: pt }))}
                            {eHoje && <span className="ml-1 text-[9px] uppercase tracking-wider block">hoje</span>}
                          </td>
                          <td className={clsx('px-3 py-2 text-center tabular-nums whitespace-nowrap', eHoje ? 'text-status-confirmado' : diaActivo ? 'text-accent-muted' : 'text-accent-subtle/50')}>
                            {formatarData(iso)}
                          </td>
                          {turnosEffectivos.map((turno, ti) => {
                            const slotsSemTurno = slots.filter(s => !s.turno_id)
                            const slot = slots.find(s => s.turno_id === turno.id)
                              ?? (turnosEffectivos.length > 1
                                ? slotsSemTurno.find(s => indiceTurnoPorHora(s.hora_inicio, turnosEffectivos) === ti)
                                : (ti === 0 ? slotsSemTurno[0] : null))
                              ?? null
                            const turnoOpera = !turno.dias_semana?.length || turno.dias_semana.includes(diaSemana(d))
                            return (
                              <>
                                <DroppableTd key={`${iso}-${ti}-dj`} dropId={`${iso}|${turno.id ?? '_'}`} className="px-2 py-1.5 border-l-2 border-l-white/15">
                                  <SlotCell
                                    slot={slot}
                                    onEditar={abrirEditar}
                                    onCriar={() => abrirCriar(iso, turno)}
                                    onSugerir={slot ? () => setSugestaoCtx({ slot, espaco: espacos.find(e => e.id === espacoSeleccionado) ?? null, turno: turno.id && turno.id !== '_1' ? turno : null }) : undefined}
                                    dimmed={!turnoOpera && !slot && evsHoje.length === 0}
                                    dragId={slot ? `slot-${slot.id}` : undefined}
                                    conflito={slot ? conflictsIdx.has(slot.id) : false}
                                  />
                                </DroppableTd>
                                <td key={`${iso}-${ti}-hr`} className="px-3 py-2 text-center text-accent-muted tabular-nums whitespace-nowrap">
                                  {slot
                                    ? `${formatarHora(slot.hora_inicio)}–${formatarHora(slot.hora_fim)}`
                                    : turno.hora_inicio
                                      ? <span className="text-border/60">{formatarHora(turno.hora_inicio)}–{formatarHora(turno.hora_fim)}</span>
                                      : '—'
                                  }
                                </td>
                              </>
                            )
                          })}
                          {/* Colunas de evento — partilhadas entre todos os turnos */}
                          <td className="px-2 py-1.5 border-l-2 border-l-white/10">
                            <EventoCell evento={ev} extra={evExtra} onEditar={abrirEditarEvento} onCriar={() => abrirCriarEvento(iso)} />
                          </td>
                          {/* Horário Evento — editável */}
                          {mostrarEvDetalhes && (
                            <td className="px-1 py-1">
                              {ev ? (
                                <button onClick={() => abrirEditarEvento(ev)}
                                  className="w-full text-center tabular-nums whitespace-nowrap text-[11px] text-accent-muted hover:text-accent hover:bg-surface-3/60 rounded px-2 py-1 transition-colors">
                                  {ev.hora_inicio
                                    ? `${ev.hora_inicio.slice(0,5)}${ev.hora_fim ? `–${ev.hora_fim.slice(0,5)}` : ''}`
                                    : <span className="text-border/40 italic text-[10px]">+ hora</span>}
                                </button>
                              ) : <span className="block text-center text-border/40 text-[10px]">—</span>}
                            </td>
                          )}
                          {/* Horário Instalação */}
                          {mostrarEvDetalhes && (
                            <td className="px-1 py-1">
                              {ev ? (
                                <button onClick={() => abrirEditarEvento(ev)}
                                  className="w-full text-center text-[11px] text-accent-muted hover:text-accent hover:bg-surface-3/60 rounded px-2 py-1 transition-colors whitespace-nowrap">
                                  {ev.dia_instalacao
                                    ? `${format(new Date(ev.dia_instalacao + 'T00:00:00'), 'd MMM', { locale: pt })}${ev.hora_instalacao ? ` ${ev.hora_instalacao.slice(0,5)}` : ''}`
                                    : <span className="text-border/40 italic text-[10px]">+ inst.</span>}
                                </button>
                              ) : <span className="block text-center text-border/40 text-[10px]">—</span>}
                            </td>
                          )}
                          {/* Técnico — editável */}
                          {mostrarEvDetalhes && (
                            <td className="px-1 py-1">
                              {ev ? (
                                <button onClick={() => abrirEditarEvento(ev)}
                                  className="w-full text-center text-[11px] text-accent-muted hover:text-accent hover:bg-surface-3/60 rounded px-2 py-1 transition-colors truncate">
                                  {tecnico ?? <span className="text-border/40 italic text-[10px]">+ técnico</span>}
                                </button>
                              ) : <span className="block text-center text-border/40 text-[10px]">—</span>}
                            </td>
                          )}
                          {/* Notas — olho abre mini-modal */}
                          {mostrarEvDetalhes && (
                            <td className="px-2 py-1 text-center">
                              {ev && (ev.notas_operacionais || ev.Equipamentos) ? (
                                <button onClick={() => setNotasEventoAberto(ev)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors mx-auto"
                                  title="Ver notas">
                                  <Eye size={11} />
                                </button>
                              ) : ev ? (
                                <button onClick={() => abrirEditarEvento(ev)}
                                  className="text-[10px] text-border/40 hover:text-accent-subtle transition-colors"
                                  title="Adicionar notas">+</button>
                              ) : <span className="text-border/40 text-[10px]">—</span>}
                            </td>
                          )}
                        </tr>
                      )
                    }),
                  ])}
                </tbody>
              </table>
            )
          })()

        ) : (

          /* ── Vista normal: um turno de cada vez ── */
          <table className="text-xs border-collapse table-fixed w-full">
            <thead className="sticky top-0 z-10 bg-surface-1 border-b-2 border-border">
              <tr className="border-b border-border/50">
                <th style={{ width: colW.dia }}  className="text-center px-3 py-2 font-medium text-accent-muted" rowSpan={2}>Dia</th>
                <th style={{ width: colW.data }} className="text-center px-3 py-2 font-medium text-accent-muted" rowSpan={2}>Data</th>
                <th style={{ width: colW.dj }}   className="text-center px-3 py-2 font-medium text-accent-muted" rowSpan={2}>DJ</th>
                <th style={{ width: colW.hr }}   className="text-center px-3 py-2 font-medium text-accent-muted whitespace-nowrap" rowSpan={2}>Horário</th>
                <th style={{ width: colW.val }}  className="text-center px-3 py-2 font-medium text-accent-muted" rowSpan={2}>Valor</th>
                <th colSpan={mostrarEvDetalhes ? 5 : 1} className="px-3 py-1.5 border-l-2 border-l-white/10 bg-surface-2/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-accent text-[11px] tracking-widest uppercase">Evento</span>
                    <button
                      onClick={() => setMostrarEvDetalhes(v => !v)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors whitespace-nowrap"
                      title={mostrarEvDetalhes ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                    >
                      {mostrarEvDetalhes ? '◀ ocultar' : '▶ detalhe'}
                    </button>
                  </div>
                </th>
              </tr>
              <tr className="border-b border-border">
                <th style={{ width: colW.evNome }} className="text-center px-3 py-2 font-medium text-accent-subtle border-l-2 border-l-white/10">Nome</th>
                {mostrarEvDetalhes && <>
                  <th style={{ width: colW.evHr }}   className="text-center px-3 py-2 font-medium text-accent-subtle whitespace-nowrap">Horário</th>
                  <th style={{ width: colW.evInst }}  className="text-center px-3 py-2 font-medium text-accent-subtle whitespace-nowrap">Instalação</th>
                  <th style={{ width: colW.evTec }}   className="text-center px-3 py-2 font-medium text-accent-subtle">Técnico</th>
                  <th style={{ width: colW.evNotas }} className="text-center px-3 py-2 font-medium text-accent-subtle">Notas</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {semanas.flatMap(({ ws, dias }, semanaIdx) => [
                <tr key={`sep-${ws}`} className="border-t border-white/10 bg-white/5">
                  <td colSpan={mostrarEvDetalhes ? 10 : 6} className="px-3 py-1.5 text-[11px] font-semibold text-accent-subtle/60 uppercase tracking-widest">
                    {ORDINALS[semanaIdx]} Semana
                  </td>
                </tr>,
                ...dias.map((d) => {
                  const iso           = isoData(d)
                  const eHoje         = iso === HOJE
                  const operaNesteDia = !turnoActivo.dias_semana || (turnoActivo.dias_semana.length > 0 && turnoActivo.dias_semana.includes(diaSemana(d)))
                  const slots         = slotsMap[iso] ?? []
                  const slot          = slots.find(s => s.turno_id === turnoActivo.id)
                    ?? slots.find(s => !s.turno_id && indiceTurnoPorHora(s.hora_inicio, turnosEffectivos) === turnoActivoIdx)
                    ?? null
                  const evsHoje      = eventosMap[iso] ?? []
                  const ev           = evsHoje[0] ?? null
                  const evExtra      = evsHoje.length - 1
                  const tecnico      = ev?.responsavel ?? null
                  // dia "off" mas com evento → trata como dia activo
                  const diaActivo    = operaNesteDia || evsHoje.length > 0
                  return (
                    <tr key={iso} className={clsx('border-b border-border/20 transition-colors', corLinhaDistrib(d, eHoje, diaActivo))}>
                      {/* Dia */}
                      <td className={clsx('px-3 py-2 text-center whitespace-nowrap', eHoje ? 'text-status-confirmado' : diaActivo ? 'text-accent-muted' : 'text-accent-subtle/50')}>
                        {cap(format(d, 'EEE', { locale: pt }))}
                        {eHoje && <span className="ml-1 text-[9px] uppercase tracking-wider block">hoje</span>}
                      </td>
                      {/* Data */}
                      <td className={clsx('px-3 py-2 text-center tabular-nums whitespace-nowrap', eHoje ? 'text-status-confirmado' : diaActivo ? 'text-accent-muted' : 'text-accent-subtle/50')}>
                        {formatarData(iso)}
                      </td>
                      {/* DJ */}
                      <DroppableTd dropId={`${iso}|${turnoActivo.id ?? '_'}`} className="px-2 py-1.5">
                        <SlotCell
                          slot={slot}
                          onEditar={abrirEditar}
                          onCriar={() => abrirCriar(iso, turnoActivo)}
                          onSugerir={slot ? () => setSugestaoCtx({ slot, espaco: espacos.find(e => e.id === espacoSeleccionado) ?? null, turno: turnoActivo.id && turnoActivo.id !== '_1' ? turnoActivo : null }) : undefined}
                          dimmed={!diaActivo && !slot}
                          dragId={slot ? `slot-${slot.id}` : undefined}
                          conflito={slot ? conflictsIdx.has(slot.id) : false}
                        />
                      </DroppableTd>
                      {/* Horário DJ */}
                      <td className="px-3 py-2 text-center text-accent-muted tabular-nums whitespace-nowrap">
                        {slot
                          ? `${formatarHora(slot.hora_inicio)}–${formatarHora(slot.hora_fim)}`
                          : turnoActivo.hora_inicio
                            ? <span className="text-border/60">{formatarHora(turnoActivo.hora_inicio)}–{formatarHora(turnoActivo.hora_fim)}</span>
                            : '—'
                        }
                      </td>
                      {/* Valor DJ */}
                      <td className="px-3 py-2 text-center text-accent-muted tabular-nums whitespace-nowrap">
                        {slot?.valor != null ? formatarEuro(slot.valor) : '—'}
                      </td>
                      {/* Nome Evento */}
                      <td className="px-2 py-1.5 border-l-2 border-l-white/10">
                        <EventoCell
                          evento={ev}
                          extra={evExtra}
                          onEditar={abrirEditarEvento}
                          onCriar={() => abrirCriarEvento(iso)}
                        />
                      </td>
                      {/* Horário Evento — editável */}
                      {mostrarEvDetalhes && (
                        <td className="px-1 py-1">
                          {ev ? (
                            <button
                              onClick={() => abrirEditarEvento(ev)}
                              className="w-full text-center tabular-nums whitespace-nowrap text-[11px] text-accent-muted hover:text-accent hover:bg-surface-3/60 rounded px-2 py-1 transition-colors"
                            >
                              {ev.hora_inicio
                                ? `${ev.hora_inicio.slice(0,5)}${ev.hora_fim ? `–${ev.hora_fim.slice(0,5)}` : ''}`
                                : <span className="text-border/40 italic text-[10px]">+ hora</span>
                              }
                            </button>
                          ) : <span className="block text-center text-border/40 text-[10px]">—</span>}
                        </td>
                      )}
                      {/* Horário Instalação */}
                      {mostrarEvDetalhes && (
                        <td className="px-1 py-1">
                          {ev ? (
                            <button
                              onClick={() => abrirEditarEvento(ev)}
                              className="w-full text-center text-[11px] text-accent-muted hover:text-accent hover:bg-surface-3/60 rounded px-2 py-1 transition-colors whitespace-nowrap"
                            >
                              {ev.dia_instalacao
                                ? `${format(new Date(ev.dia_instalacao + 'T00:00:00'), 'd MMM', { locale: pt })}${ev.hora_instalacao ? ` ${ev.hora_instalacao.slice(0,5)}` : ''}`
                                : <span className="text-border/40 italic text-[10px]">+ inst.</span>
                              }
                            </button>
                          ) : <span className="block text-center text-border/40 text-[10px]">—</span>}
                        </td>
                      )}
                      {/* Técnico — editável */}
                      {mostrarEvDetalhes && (
                        <td className="px-1 py-1">
                          {ev ? (
                            <button
                              onClick={() => abrirEditarEvento(ev)}
                              className="w-full text-center text-[11px] text-accent-muted hover:text-accent hover:bg-surface-3/60 rounded px-2 py-1 transition-colors truncate"
                            >
                              {tecnico ?? <span className="text-border/40 italic text-[10px]">+ técnico</span>}
                            </button>
                          ) : <span className="block text-center text-border/40 text-[10px]">—</span>}
                        </td>
                      )}
                      {/* Notas — olho abre mini-modal */}
                      {mostrarEvDetalhes && (
                        <td className="px-2 py-1 text-center">
                          {ev && (ev.notas_operacionais || ev.Equipamentos) ? (
                            <button
                              onClick={() => setNotasEventoAberto(ev)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors mx-auto"
                              title="Ver notas"
                            >
                              <Eye size={11} />
                            </button>
                          ) : ev ? (
                            <button
                              onClick={() => abrirEditarEvento(ev)}
                              className="text-[10px] text-border/40 hover:text-accent-subtle transition-colors"
                              title="Adicionar notas"
                            >
                              +
                            </button>
                          ) : <span className="text-border/40 text-[10px]">—</span>}
                        </td>
                      )}
                    </tr>
                  )
                }),
              ])}
            </tbody>
          </table>

        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeSlot ? <SlotCellOverlay slot={activeSlot} /> : null}
      </DragOverlay>
      </DndContext>

      <FormSlot
        aberto={modalAberto}
        slot={slotActual}
        onFechar={fecharModal}
        onGuardado={recarregar}
        simplificado
        conflito={slotActual ? conflictsIdx.has(slotActual.id) : false}
      />

      <FormDisponibilidade
        aberto={dispModalAberto}
        onFechar={() => setDispModalAberto(false)}
      />

      <ConfirmModal
        aberto={!!confirmPendente}
        titulo="Conflito de disponibilidade"
        avisos={confirmPendente?.avisos ?? []}
        labelConfirmar="Mover mesmo assim"
        onConfirmar={() => {
          const fn = confirmPendente?.executar
          setConfirmPendente(null)
          fn?.()
        }}
        onCancelar={() => setConfirmPendente(null)}
      />

      <FormEvento
        aberto={eventoModalAberto}
        evento={eventoActual}
        dataInicial={eventoDataInicial}
        onFechar={fecharEventoModal}
        onGuardado={() => { recarregarEventos() }}
      />

      <ModalSugestoes
        aberto={!!sugestaoCtx}
        slot={sugestaoCtx?.slot ?? null}
        espaco={sugestaoCtx?.espaco ?? null}
        turno={sugestaoCtx?.turno ?? null}
        onFechar={() => setSugestaoCtx(null)}
        onAplicado={() => { setSugestaoCtx(null); recarregar(); recarregarGeral() }}
      />

      {/* Mini-modal de notas do evento */}
      {notasEventoAberto && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setNotasEventoAberto(null)}>
          <div className="bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-accent">{notasEventoAberto.evento}</p>
                <p className="text-[11px] text-accent-subtle mt-0.5">Notas técnicas e operacionais</p>
              </div>
              <button onClick={() => setNotasEventoAberto(null)} className="text-accent-subtle hover:text-accent text-lg leading-none">×</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4 max-h-80 overflow-y-auto">
              {notasEventoAberto.notas_operacionais && (
                <div>
                  <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">Notas operacionais</p>
                  <p className="text-xs text-accent-muted whitespace-pre-wrap">{notasEventoAberto.notas_operacionais}</p>
                </div>
              )}
              {notasEventoAberto.Equipamentos && (
                <div>
                  <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">Equipamentos</p>
                  <p className="text-xs text-accent-muted whitespace-pre-wrap">{notasEventoAberto.Equipamentos}</p>
                </div>
              )}
              {notasEventoAberto.responsavel && (
                <div>
                  <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">Responsável</p>
                  <p className="text-xs text-accent-muted">{notasEventoAberto.responsavel}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => { setNotasEventoAberto(null); abrirEditarEvento(notasEventoAberto) }}
                className="text-xs text-accent-subtle hover:text-accent transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => setNotasEventoAberto(null)}
                className="px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
