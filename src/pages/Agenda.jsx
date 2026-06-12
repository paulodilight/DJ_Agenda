import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Printer, Trophy, Shuffle, SlidersHorizontal, Loader2, Save, History, RotateCcw, Trash2 } from 'lucide-react'
import { startOfWeek, addDays, addWeeks, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, endOfWeek, format } from 'date-fns'
import { pt } from 'date-fns/locale'
import {
  DndContext, DragOverlay,
  MouseSensor, TouchSensor,
  useSensors, useSensor,
} from '@dnd-kit/core'
import { Alerta } from '@/components/ui/Alerta'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { CalendarioSemana, SlotChipOverlay } from '@/components/agenda/CalendarioSemana'
import { FormSlot } from '@/components/agenda/FormSlot'
import { FormEvento } from '@/components/agenda/FormEvento'
import { DocumentoAgendaMes } from '@/components/agenda/DocumentoAgendaMes'
import { useAgenda } from '@/hooks/useAgenda'
import { useEspacos } from '@/hooks/useEspacos'
import { useBloqueios } from '@/hooks/useBloqueios'
import { useConflitos } from '@/hooks/useConflitos'
import { useSupaEventos } from '@/hooks/useSupaEventos'
import { useMesStore } from '@/store'
import { agendaApi, disponibilidadesApi, turnoValoresDiaApi } from '@/lib/api'
import { correrDistribuicao, calcularPreAlocacoes } from '@/lib/distribuicao'
import { gravarSnapshot, listarSnapshots, restaurarSnapshot, apagarSnapshot } from '@/lib/snapshots'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Modal } from '@/components/ui/Modal'
import { formatarEuro } from '@/utils/formatacao'
import { isoData } from '@/utils/datas'
import { clsx } from 'clsx'

const VISTAS = ['Dia', 'Semana', 'Mês']

export function Agenda() {
  const { anoMes, setAnoMes } = useMesStore()

  const [vista, setVista] = useState('Semana')
  // Inicializar referência a partir do mês global
  const [referencia, setReferencia] = useState(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    return new Date(ano, mes - 1, 1)
  })
  const [modalAberto, setModalAberto] = useState(false)
  const [slotActual, setSlotActual] = useState(null)
  const [filtroEspaco, setFiltroEspaco] = useState('')
  const [activeSlot, setActiveSlot] = useState(null)
  const [confirmPendente, setConfirmPendente] = useState(null) // { avisos, executar }
  const [rankingAberto, setRankingAberto] = useState(false)
  const [eventoModal, setEventoModal] = useState(null)
  const [eventoModalAberto, setEventoModalAberto] = useState(false)
  const [distribuindo, setDistribuindo] = useState(false)

  // Quando o mês global muda (pelo header), actualizar a referência da agenda
  useEffect(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    if (format(referencia, 'yyyy-MM') !== anoMes) {
      setReferencia(new Date(ano, mes - 1, 1))
    }
  }, [anoMes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Calcular intervalo consoante a vista
  const { inicio, fim, dias } = useMemo(() => {
    if (vista === 'Dia') {
      return { inicio: referencia, fim: referencia, dias: [referencia] }
    }
    if (vista === 'Semana') {
      const inicio = startOfWeek(referencia, { weekStartsOn: 1 })
      const fim = endOfWeek(referencia, { weekStartsOn: 1 })
      return { inicio, fim, dias: eachDayOfInterval({ start: inicio, end: fim }) }
    }
    // Mês
    const inicio = startOfMonth(referencia)
    const fim = endOfMonth(referencia)
    const inicioGrelha = startOfWeek(inicio, { weekStartsOn: 1 })
    const fimGrelha = endOfWeek(fim, { weekStartsOn: 1 })
    return { inicio, fim, dias: eachDayOfInterval({ start: inicioGrelha, end: fimGrelha }) }
  }, [vista, referencia])

  const { agenda, loading, erro, recarregar, recarregarSilencioso } = useAgenda({
    dataInicio: isoData(inicio),
    dataFim: isoData(fim),
    espacoId: filtroEspaco || undefined,
  })

  // Dados do mês completo para o documento de impressão e ranking
  const mesInicio = isoData(startOfMonth(referencia))
  const mesFim = isoData(endOfMonth(referencia))
  const { agenda: agendaMes, recarregar: recarregarMes } = useAgenda({ dataInicio: mesInicio, dataFim: mesFim })

  // ── Ranking de DJs do mês (mês completo, Cliente seleccionado) ────────────
  const rankingDJs = useMemo(() => {
    const fonte = (filtroEspaco
      ? agendaMes.filter(s => s.espaco_id === filtroEspaco)
      : agendaMes
    ).filter(s => s.estado !== 'cancelado' && s.estado !== 'sem_efeito')

    const map = {}
    fonte.forEach(slot => {
      const key  = slot.dj_id ?? '__sem_dj__'
      const nome = slot.dj_nome ?? null
      if (!map[key]) map[key] = { dj_id: slot.dj_id ?? null, nome, nDatas: 0, valor: 0 }
      map[key].nDatas++
      map[key].valor += slot.valor ?? 0
    })

    const todos  = Object.values(map)
    const comDJ  = todos
      .filter(d => d.dj_id || d.nome)
      .sort((a, b) => b.nDatas - a.nDatas || (a.nome ?? '').localeCompare(b.nome ?? ''))
    const semDJ  = todos.filter(d => !d.dj_id && !d.nome)
    return [...comDJ, ...semDJ]
  }, [agendaMes, filtroEspaco])

  const { eventos: supaEventos, recarregar: recarregarEventos } = useSupaEventos({
    dataInicio: isoData(inicio),
    dataFim: isoData(fim),
  })

  const { espacos } = useEspacos({ anoMes })
  const { bloqueios } = useBloqueios()
  // Usa agendaMes (sem filtro de Cliente) para detectar choques cross-Cliente
  const { conflictsIdx, conflictsMap } = useConflitos({ agenda: agendaMes, dataInicio: mesInicio, dataFim: mesFim })

  const espacosFiltrados = filtroEspaco
    ? espacos.filter((e) => e.id === filtroEspaco)
    : espacos

  const nomeEspacoFiltro = filtroEspaco
    ? (espacos.find(e => e.id === filtroEspaco)?.nome?.trim() ?? 'Cliente')
    : 'TODOS'

  // Indicador de preenchimento — só quando um Cliente está seleccionado
  // Máximo teórico de datas no mês = soma, por turno, dos dias do mês cujo
  // dia-da-semana está em turno.dias_semana (ex.: Golf d'Água só Sex+Sáb → 9 em Julho)
  const espacoSel = filtroEspaco ? espacos.find(e => e.id === filtroEspaco) : null
  const esperadosMes = useMemo(() => {
    if (!espacoSel) return 0
    const dias = eachDayOfInterval({ start: startOfMonth(referencia), end: endOfMonth(referencia) })
    return (espacoSel.turnos_espaco ?? []).reduce((tot, t) => {
      if (!t.dias_semana?.length) return tot
      return tot + dias.filter(d => t.dias_semana.includes(d.getDay())).length
    }, 0)
  }, [espacoSel, referencia])

  // Datas do mês deste Cliente que já têm DJ atribuído
  const comDJMes      = filtroEspaco
    ? agendaMes.filter(s => s.espaco_id === filtroEspaco && (s.dj_id || s.dj_nome)).length
    : 0
  const faltamPreencher = Math.max(0, esperadosMes - comDJMes)
  const datasOk         = filtroEspaco && esperadosMes > 0 && faltamPreencher === 0

  // ── Distribuição: scope segue o tab seleccionado (Todos = global; Cliente = só esse) ──
  const anoMesAlvo = format(referencia, 'yyyy-MM')
  // Já houve distribuição neste mês/scope? (existe ≥1 slot automático)
  const jaDistribuido = filtroEspaco
    ? agendaMes.some(s => s.espaco_id === filtroEspaco && s.origem === 'automatico')
    : agendaMes.some(s => s.origem === 'automatico')
  // Em modo ajustes só há trabalho se existirem slots em estado 'alterar'
  const temAlterar = filtroEspaco
    ? agendaMes.some(s => s.espaco_id === filtroEspaco && s.estado === 'alterar')
    : agendaMes.some(s => s.estado === 'alterar')
  const modoDistribuir = jaDistribuido ? 'ajustes' : 'completo'

  const distribuir = async () => {
    if (espacos.length === 0 || distribuindo) return
    if (modoDistribuir === 'completo') {
      const alvo = filtroEspaco ? nomeEspacoFiltro : 'TODOS os clientes'
      if (!window.confirm(
        `Distribuir ${alvo} para ${anoMesAlvo}?\n\nOs slots automáticos não protegidos serão recriados em estado Proposta. ` +
        `Slots em Validação, A pedido, e DJs Convidado EXT / Premium são preservados.`
      )) return
    }
    setDistribuindo(true)
    try {
      const preAlocacoes = await calcularPreAlocacoes(anoMesAlvo)

      // Ordenar Clientes (só relevante em modo global)
      let alvos = filtroEspaco ? espacos.filter(e => e.id === filtroEspaco) : [...espacos]
      if (!filtroEspaco) {
        const [prefsRes, turnosRes, djsComRegRes] = await Promise.all([
          supabase.from('espaco_dj_preferencias').select('espaco_id, dj_id').eq('tipo', 'preferido'),
          supabase.from('turnos_espaco').select('espaco_id, dias_semana'),
          supabase.from('disponibilidades').select('dj_id').gte('data', mesInicio).lte('data', mesFim),
        ])
        const djsActivos = new Set((djsComRegRes.data ?? []).map(r => r.dj_id))
        const prefCount = {}
        ;(prefsRes.data ?? []).forEach(p => {
          if (djsActivos.has(p.dj_id)) prefCount[p.espaco_id] = (prefCount[p.espaco_id] ?? 0) + 1
        })
        const opDias = {}
        ;(turnosRes.data ?? []).forEach(t => {
          if (!opDias[t.espaco_id]) opDias[t.espaco_id] = new Set()
          ;(t.dias_semana ?? []).forEach(d => opDias[t.espaco_id].add(d))
        })
        alvos.sort((a, b) => {
          const aO = a.ordem_distribuicao ?? Infinity, bO = b.ordem_distribuicao ?? Infinity
          if (aO !== bO) return aO - bO
          const dd = (opDias[a.id]?.size ?? 7) - (opDias[b.id]?.size ?? 7)
          if (dd !== 0) return dd
          return (prefCount[b.id] ?? 0) - (prefCount[a.id] ?? 0)
        })
      }

      let total = 0
      for (const espaco of alvos) {
        const { inseridos } = await correrDistribuicao({
          anoMes: anoMesAlvo, espacoId: espaco.id, preAlocacoes, modo: modoDistribuir,
        })
        total += inseridos
      }
      await Promise.all([recarregar(), recarregarMes()])
      console.info(`Distribuição (${modoDistribuir}) concluída: ${total} slots em ${alvos.length} Cliente(s).`)
    } catch (e) {
      alert('Erro na distribuição: ' + e.message)
    } finally {
      setDistribuindo(false)
    }
  }

  // ── Checkpoints (Gravar / Restaurar estado do mês) ───────────────────────────
  const [checkpointsAberto, setCheckpointsAberto] = useState(false)
  const [snaps, setSnaps]           = useState([])
  const [snapLabel, setSnapLabel]   = useState('')
  const [snapBusy, setSnapBusy]     = useState(false)
  const [snapMsg, setSnapMsg]       = useState(null)

  const carregarSnaps = async () => {
    try { setSnaps(await listarSnapshots(anoMesAlvo)) }
    catch (e) { setSnapMsg('Erro a carregar: ' + e.message) }
  }

  const abrirCheckpoints = async () => {
    setSnapMsg(null); setSnapLabel(''); setCheckpointsAberto(true)
    await carregarSnaps()
  }

  const gravarCheckpoint = async () => {
    setSnapBusy(true); setSnapMsg(null)
    try {
      await gravarSnapshot({ anoMes: anoMesAlvo, label: snapLabel.trim() || null, tipo: 'manual' })
      setSnapLabel('')
      await carregarSnaps()
      setSnapMsg('Checkpoint gravado ✓')
    } catch (e) { setSnapMsg('Erro ao gravar: ' + e.message) }
    finally { setSnapBusy(false) }
  }

  const restaurarCheckpoint = async (snap) => {
    const quando = new Date(snap.criado_em).toLocaleString('pt-PT')
    if (!window.confirm(
      `Restaurar o checkpoint de ${quando}?\n\nA agenda e disponibilidades de ${anoMesAlvo} ` +
      `voltam exactamente a esse momento. As alterações posteriores serão perdidas.`
    )) return
    setSnapBusy(true); setSnapMsg(null)
    try {
      await restaurarSnapshot(snap.id)
      await Promise.all([recarregar(), recarregarMes()])
      setSnapMsg('Estado restaurado ✓')
    } catch (e) { setSnapMsg('Erro ao restaurar: ' + e.message) }
    finally { setSnapBusy(false) }
  }

  const apagarCheckpoint = async (snap) => {
    if (!window.confirm('Apagar este checkpoint?')) return
    setSnapBusy(true)
    try { await apagarSnapshot(snap.id); await carregarSnaps() }
    catch (e) { setSnapMsg('Erro ao apagar: ' + e.message) }
    finally { setSnapBusy(false) }
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // Executa o movimento/troca na BD e refresca
  const executarMover = async ({ draggedSlot, targetData, targetEspacoId, targetTurnoId, targetSlot }) => {
    try {
      if (targetSlot) {
        await Promise.all([
          agendaApi.moverSlot(draggedSlot.id, {
            data: targetData, turno_id: targetTurnoId, espaco_id: targetEspacoId,
          }),
          agendaApi.moverSlot(targetSlot.id, {
            data: draggedSlot.data, turno_id: draggedSlot.turno_id ?? null, espaco_id: draggedSlot.espaco_id,
          }),
        ])
      } else {
        await agendaApi.moverSlot(draggedSlot.id, {
          data: targetData, turno_id: targetTurnoId, espaco_id: targetEspacoId,
        })
      }
      recarregarSilencioso()
    } catch (e) {
      alert('Erro ao mover atuação: ' + e.message)
    }
  }

  // drop ID: "${dataStr}|${espacoId}|${turnoId ?? '_'}"
  const handleDragEnd = async ({ active, over }) => {
    setActiveSlot(null)
    if (!over) return
    const draggedSlot = active.data.current?.slot
    if (!draggedSlot) return

    const [targetData, targetEspacoId, targetTurnoRaw] = over.id.split('|')
    const targetTurnoId = targetTurnoRaw === '_' ? null : targetTurnoRaw

    // Sem movimento
    if (
      draggedSlot.data      === targetData &&
      draggedSlot.espaco_id === targetEspacoId &&
      String(draggedSlot.turno_id ?? '_') === String(targetTurnoId ?? '_')
    ) return

    // Slot que já existe na célula alvo (para troca)
    const targetSlot = agenda.find((s) =>
      s.data      === targetData &&
      s.espaco_id === targetEspacoId &&
      String(s.turno_id ?? '_') === String(targetTurnoId ?? '_') &&
      s.id !== draggedSlot.id
    ) ?? null

    const params = { draggedSlot, targetData, targetEspacoId, targetTurnoId, targetSlot }

    // ── Verificar indisponibilidades ────────────────────────────────────────
    const [indispA, indispB] = await Promise.all([
      draggedSlot.dj_id
        ? disponibilidadesApi.verificarIndisponivel(draggedSlot.dj_id, targetData)
        : Promise.resolve(null),
      targetSlot?.dj_id && targetData !== draggedSlot.data
        ? disponibilidadesApi.verificarIndisponivel(targetSlot.dj_id, draggedSlot.data)
        : Promise.resolve(null),
    ])

    const avisos = []
    if (indispA) {
      const nota = indispA.notas ? ` — "${indispA.notas}"` : ''
      avisos.push(`${draggedSlot.dj_nome} está indisponível em ${targetData}${nota}`)
    }
    if (indispB) {
      const nota = indispB.notas ? ` — "${indispB.notas}"` : ''
      avisos.push(`${targetSlot.dj_nome} está indisponível em ${draggedSlot.data}${nota}`)
    }

    if (avisos.length > 0) {
      // Mostra modal de confirmação; a execução fica em espera
      setConfirmPendente({ avisos, executar: () => executarMover(params) })
      return
    }

    await executarMover(params)
  }

  const navegar = (novaRef) => {
    setReferencia(novaRef)
    setAnoMes(format(novaRef, 'yyyy-MM'))
  }
  const navAnterior = () => {
    if (vista === 'Dia')    return navegar(addDays(referencia, -1))
    if (vista === 'Semana') return navegar(addWeeks(referencia, -1))
    return navegar(addMonths(referencia, -1))
  }
  const navProxima = () => {
    if (vista === 'Dia')    return navegar(addDays(referencia, 1))
    if (vista === 'Semana') return navegar(addWeeks(referencia, 1))
    return navegar(addMonths(referencia, 1))
  }

  const tituloMesImpressao = format(referencia, "MMMM yyyy", { locale: pt })
    .replace(/^\w/, (c) => c.toUpperCase())

  const tituloPeriodo = vista === 'Dia'
    ? format(referencia, "EEEE, d 'de' MMMM yyyy", { locale: pt })
    : vista === 'Semana'
      ? `${format(inicio, 'd MMM', { locale: pt })} – ${format(fim, 'd MMM yyyy', { locale: pt })}`
      : format(referencia, 'MMMM yyyy', { locale: pt })

  const abrirNovoSlot = async (data = '', espacoId = '', turnoId = null) => {
    // Preencher horário a partir da configuração do turno (se existir)
    const turno = turnoId
      ? espacos.flatMap(e => e.turnos_espaco ?? []).find(t => t.id === turnoId)
      : null

    let horaInicio = turno?.hora_inicio?.slice(0, 5) ?? null
    let horaFim    = turno?.hora_fim?.slice(0, 5)    ?? null
    let valor      = turno?.valor ?? null

    // Se o turno não tem hora base, consultar turno_valores_dia para o dia da semana
    if (turnoId && data && (!horaInicio || !horaFim)) {
      try {
        const diaSem = new Date(data).getDay()
        const cfg = await turnoValoresDiaApi.buscarConfigDia(turnoId, diaSem)
        if (cfg) {
          horaInicio = cfg.hora_inicio?.slice(0, 5) ?? horaInicio
          horaFim    = cfg.hora_fim?.slice(0, 5)    ?? horaFim
          valor      = cfg.valor ?? valor
        }
      } catch { /* ignora erros — usa defaults */ }
    }

    setSlotActual({
      data,
      espaco_id: espacoId,
      ...(turnoId    ? { turno_id:    turnoId    } : {}),
      ...(horaInicio ? { hora_inicio: horaInicio } : {}),
      ...(horaFim    ? { hora_fim:    horaFim    } : {}),
      ...(valor != null ? { valor }               : {}),
    })
    setModalAberto(true)
  }

  const abrirEditarSlot = (slot) => {
    setSlotActual(slot)
    setModalAberto(true)
  }

  const fecharModal = () => { setModalAberto(false); setSlotActual(null) }

  // Toggle marketing_destaque: activa este slot e desactiva os outros do mesmo dia/espaço
  const toggleDestaque = async (slot) => {
    const novoValor = !slot.marketing_destaque
    try {
      if (novoValor) {
        // Desactivar todos os outros slots do mesmo dia/espaço
        await supabase.from('agenda')
          .update({ marketing_destaque: false })
          .eq('espaco_id', slot.espaco_id)
          .eq('data', slot.data)
        // Activar este
        await supabase.from('agenda')
          .update({ marketing_destaque: true })
          .eq('id', slot.id)
      } else {
        await supabase.from('agenda')
          .update({ marketing_destaque: false })
          .eq('id', slot.id)
      }
      recarregarSilencioso?.()
    } catch (e) {
      console.error('Erro ao definir destaque:', e.message)
    }
  }

  // Vista mês — tabela de semanas
  const semanasDoMes = useMemo(() => {
    if (vista !== 'Mês') return []
    const semanas = []
    for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7))
    return semanas
  }, [vista, dias])

  return (
    <><div id="agenda-app" className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-border/50 bg-surface-0/60 shrink-0">
        <div className="flex items-center gap-3 flex-1">

          {/* Navegação (todas as vistas) */}
          <div className="flex items-center gap-0.5">
            <button onClick={navAnterior} className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors">
              <ChevronLeft size={13} />
            </button>
            <span className={clsx(
              'px-1 text-xs font-medium text-accent-muted capitalize text-center',
              vista === 'Dia' ? 'min-w-[190px]' : 'min-w-[130px]'
            )}>
              {tituloPeriodo}
            </span>
            <button onClick={navProxima} className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Toggle Dia / Semana / Mês */}
          <div className="flex bg-surface-2 border border-border rounded p-0.5">
            {VISTAS.map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={clsx(
                  'px-3 py-1 rounded text-xs transition-colors',
                  vista === v ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Indicador de preenchimento — centro (máximo teórico = turnos × dias do mês) */}
        <div className="flex-1 flex justify-center">
          {filtroEspaco && esperadosMes > 0 && (
            datasOk ? (
              <span className="text-sm font-bold tracking-widest uppercase text-status-confirmado">
                ✓ Datas Completas · {comDJMes} / {esperadosMes}
              </span>
            ) : (
              <span className="text-sm font-bold tracking-widest uppercase text-orange-400">
                Faltam {faltamPreencher} {faltamPreencher === 1 ? 'DJ' : 'DJs'} · {comDJMes} / {esperadosMes}
              </span>
            )
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end flex-1">

          {/* Ir para data */}
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-accent-subtle whitespace-nowrap">Ir para</label>
            <input
              type="date"
              onChange={(e) => {
                if (!e.target.value) return
                const [y, m, d] = e.target.value.split('-').map(Number)
                navegar(new Date(y, m - 1, d))
              }}
              className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-accent-muted focus:outline-none focus:ring-1 focus:ring-accent/40 cursor-pointer"
            />
          </div>

          {/* Top DJs */}
          <button
            onClick={() => setRankingAberto(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
            title="Top DJs do mês"
          >
            <Trophy size={13} />
            Top DJs
          </button>

          {/* Imprimir */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
            title="Imprimir programa do mês"
          >
            <Printer size={13} />
            Imprimir
          </button>

          {/* Gravar / Checkpoints */}
          <button
            onClick={abrirCheckpoints}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
            title="Gravar / restaurar estado do mês"
          >
            <Save size={13} />
            Gravar
          </button>

          {/* Distribuir / Ajustes */}
          <button
            onClick={distribuir}
            disabled={distribuindo || espacos.length === 0 || (modoDistribuir === 'ajustes' && !temAlterar)}
            title={
              modoDistribuir === 'completo'
                ? `Distribuir ${filtroEspaco ? nomeEspacoFiltro : 'todos os clientes'} para ${anoMesAlvo}`
                : temAlterar
                  ? `Reajustar apenas as datas em estado Alterar${filtroEspaco ? ` em ${nomeEspacoFiltro}` : ''}`
                  : 'Sem datas em estado Alterar para reajustar'
            }
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold tracking-wide uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              modoDistribuir === 'completo'
                ? 'bg-accent text-black border-accent hover:bg-accent/80'
                : 'bg-surface-2 text-accent border-white/20 hover:border-white/40'
            )}
          >
            {distribuindo
              ? <Loader2 size={13} className="animate-spin" />
              : modoDistribuir === 'completo' ? <Shuffle size={13} /> : <SlidersHorizontal size={13} />}
            {distribuindo ? 'A processar…' : modoDistribuir === 'completo' ? 'Distribuir' : 'Ajustes'}
          </button>

        </div>
      </div>

      {/* Tabs de Cliente */}
      <div className="flex items-center gap-1 px-5 py-2 border-b border-border/50 bg-surface-0/40 shrink-0 flex-wrap">
        <button
          onClick={() => setFiltroEspaco('')}
          className={clsx(
            'px-3 py-1.5 rounded text-xs transition-colors border',
            filtroEspaco === ''
              ? 'bg-surface-3 text-accent border-white/20 font-medium'
              : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
          )}
        >
          Todos
        </button>
        {espacos.map((e) => (
          <button
            key={e.id}
            onClick={() => { setFiltroEspaco(e.id); setVista('Mês') }}
            className={clsx(
              'px-3 py-1.5 rounded text-xs transition-colors border',
              filtroEspaco === e.id
                ? 'bg-surface-3 text-accent border-white/20 font-medium'
                : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
            )}
          >
            {e.nome.trim()}
          </button>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-border shrink-0">
        {[
          { cor: 'bg-status-confirmado/70', label: 'Confirmado' },
          { cor: 'bg-status-proposta/70', label: 'Proposta' },
          { cor: 'bg-status-cancelado/60', label: 'Cancelado' },
          { cor: 'bg-status-lock/70', label: 'LOCK' },
          { cor: 'bg-yellow-400/20 border border-yellow-400/30', label: 'Externo' },
          { cor: 'bg-violet-400/[0.13] border border-violet-400/35', label: 'A pedido' },
          { cor: 'bg-surface-1/50 border border-dashed border-white/10', label: 'Sem Efeito' },
          { cor: 'bg-surface-3 border border-dashed border-border', label: 'Vazio' },
        ].map(({ cor, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={clsx('w-2.5 h-2.5 rounded-sm', cor)} />
            <span className="text-xs text-accent-subtle">{label}</span>
          </div>
        ))}
      </div>

      {/* Conteúdo — DndContext envolve tudo para permitir drag entre semanas */}
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setActiveSlot(active.data.current?.slot ?? null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveSlot(null)}
      >
        <div className="flex-1 overflow-auto">
          {loading && <LoadingPage />}
          {erro && <Alerta tipo="erro" mensagem={erro} className="m-6" />}

          {!loading && !erro && (vista === 'Dia' || vista === 'Semana') && (
            <CalendarioSemana
              dias={dias}
              espacos={espacosFiltrados}
              agenda={agenda}
              bloqueios={bloqueios}
              onClickSlot={abrirEditarSlot}
              onClickVazio={abrirNovoSlot}
              onToggleDestaque={toggleDestaque}
              conflictsIdx={conflictsIdx}
              conflictsMap={conflictsMap}
              onSugestaoAplicada={() => { recarregar(); recarregarMes() }}
              supaEventos={supaEventos}
              onClickEvento={(ev) => { setEventoModal(ev); setEventoModalAberto(true) }}
              onClickEventoVazio={(data, espacoId) => { setEventoModal({ data_evento: data, espaco_id: espacoId }); setEventoModalAberto(true) }}
            />
          )}

          {!loading && !erro && vista === 'Mês' && (
            <div className="p-4">
              {semanasDoMes.map((semana, si) => (
                <div key={si}>
                  <CalendarioSemana
                    dias={semana}
                    espacos={espacosFiltrados}
                    agenda={agenda}
                    bloqueios={bloqueios}
                    onClickSlot={abrirEditarSlot}
                    onClickVazio={abrirNovoSlot}
                    onToggleDestaque={toggleDestaque}
                    semanaLabel={si + 1}
                    ocultarCabecalho={si > 0}
                    nomeEspaco={nomeEspacoFiltro}
                    conflictsIdx={conflictsIdx}
                    conflictsMap={conflictsMap}
                    onSugestaoAplicada={() => { recarregar(); recarregarMes() }}
                    supaEventos={supaEventos}
                    onClickEvento={(ev) => { setEventoModal(ev); setEventoModalAberto(true) }}
                    onClickEventoVazio={(data, espacoId) => { setEventoModal({ data_evento: data, espaco_id: espacoId }); setEventoModalAberto(true) }}
                  />
                  {si < semanasDoMes.length - 1 && <div className="h-1" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeSlot ? <SlotChipOverlay slot={activeSlot} /> : null}
        </DragOverlay>
      </DndContext>

      <FormSlot
        aberto={modalAberto}
        slot={slotActual}
        onFechar={fecharModal}
        onGuardado={() => { recarregar(); recarregarMes() }}
        simplificado
        conflito={slotActual ? conflictsIdx.has(slotActual.id) : false}
      />

      {/* ── Modal Checkpoints ── */}
      <Modal aberto={checkpointsAberto} onFechar={() => setCheckpointsAberto(false)} largura="max-w-md">
        <div className="px-6 pt-5 pb-3 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-400/10 flex items-center justify-center shrink-0">
            <History size={15} className="text-sky-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-accent">Checkpoints — {anoMesAlvo}</p>
            <p className="text-[11px] text-accent-subtle mt-0.5">Agenda + disponibilidades deste mês</p>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Gravar novo */}
          <div className="flex gap-2">
            <input
              type="text" value={snapLabel} onChange={e => setSnapLabel(e.target.value)}
              placeholder="Nome do checkpoint (opcional)…"
              className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/20"
            />
            <button onClick={gravarCheckpoint} disabled={snapBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-accent text-black text-xs font-semibold hover:bg-accent/80 disabled:opacity-40 transition-colors">
              {snapBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Gravar agora
            </button>
          </div>

          {snapMsg && <p className="text-xs text-accent-muted">{snapMsg}</p>}

          {/* Lista */}
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {snaps.length === 0 ? (
              <p className="text-xs text-accent-subtle/50 text-center py-6">Sem checkpoints para este mês.</p>
            ) : snaps.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded border border-border/50 bg-surface-1">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-accent truncate">
                    {s.label || 'Checkpoint'}
                    {s.tipo === 'auto' && <span className="ml-1.5 text-[9px] text-accent-subtle uppercase">auto</span>}
                  </p>
                  <p className="text-[10px] text-accent-subtle">{new Date(s.criado_em).toLocaleString('pt-PT')}</p>
                </div>
                <button onClick={() => restaurarCheckpoint(s)} disabled={snapBusy}
                  title="Restaurar este momento"
                  className="flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] text-accent-muted hover:text-accent hover:border-white/20 disabled:opacity-40 transition-colors">
                  <RotateCcw size={12} /> Restaurar
                </button>
                <button onClick={() => apagarCheckpoint(s)} disabled={snapBusy}
                  title="Apagar checkpoint"
                  className="p-1 rounded text-accent-subtle hover:text-status-cancelado transition-colors disabled:opacity-40">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* ── Modal Top DJs ── */}
      <Modal
        aberto={rankingAberto}
        onFechar={() => setRankingAberto(false)}
        largura="max-w-md"
      >
        {/* Cabeçalho personalizado */}
        <div className="px-6 pt-5 pb-3 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-yellow-400/10 flex items-center justify-center shrink-0">
            <Trophy size={15} className="text-yellow-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-accent">Top DJs — {tituloMesImpressao}</p>
            <p className="text-[11px] text-accent-subtle mt-0.5">
              {filtroEspaco
                ? espacos.find(e => e.id === filtroEspaco)?.nome?.trim() ?? 'Cliente seleccionado'
                : 'Todos os Clientes'
              }
              {' · '}{rankingDJs.filter(d => d.dj_id || d.nome).length} DJs
            </p>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-y-auto max-h-[60vh]">
          {rankingDJs.length === 0 ? (
            <p className="text-xs text-accent-subtle/60 text-center py-8">
              Sem atuações registadas no mês.
            </p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="text-left px-4 py-2 text-[11px] font-medium text-accent-subtle w-8">#</th>
                  <th className="text-left px-3 py-2 text-[11px] font-medium text-accent-subtle">DJ</th>
                  <th className="text-right px-3 py-2 text-[11px] font-medium text-accent-subtle">Datas</th>
                  <th className="text-right px-4 py-2 text-[11px] font-medium text-accent-subtle">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rankingDJs.map((dj, i) => {
                  const isSemDJ = !dj.dj_id && !dj.nome
                  const pos = isSemDJ ? null : i + 1
                  return (
                    <tr
                      key={dj.dj_id ?? '__sem_dj__'}
                      className={clsx(
                        'border-b border-border/30',
                        i % 2 !== 0 && 'bg-surface-0/40',
                        pos === 1 && 'bg-yellow-400/[0.04]',
                      )}
                    >
                      {/* Posição */}
                      <td className="px-4 py-2.5 text-center">
                        {pos === 1 && <span className="text-yellow-400 font-bold">1</span>}
                        {pos === 2 && <span className="text-slate-300 font-bold">2</span>}
                        {pos === 3 && <span className="text-amber-600 font-bold">3</span>}
                        {pos > 3   && <span className="text-accent-subtle/50 tabular-nums">{pos}</span>}
                        {!pos      && <span className="text-accent-subtle/30">—</span>}
                      </td>

                      {/* Nome */}
                      <td className="px-3 py-2.5">
                        {isSemDJ ? (
                          <span className="italic text-accent-subtle/50">Sem DJ</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className={clsx(
                              'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                              pos === 1 ? 'bg-yellow-400/20 text-yellow-400'  :
                              pos === 2 ? 'bg-slate-400/20  text-slate-300'   :
                              pos === 3 ? 'bg-amber-600/20  text-amber-600'   :
                                          'bg-surface-3      text-accent-muted'
                            )}>
                              {(dj.nome ?? '?').charAt(0).toUpperCase()}
                            </div>
                            <span className={clsx(
                              'font-medium truncate max-w-[160px]',
                              pos === 1 ? 'text-yellow-300' : 'text-accent'
                            )} title={dj.nome}>
                              {dj.nome ?? '—'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Nº Datas */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={clsx(
                          'font-semibold',
                          isSemDJ ? 'text-accent-subtle/60' : 'text-status-confirmado'
                        )}>
                          {dj.nDatas}
                        </span>
                      </td>

                      {/* Valor */}
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={clsx(
                          'font-semibold',
                          isSemDJ ? 'text-accent-subtle/60' : 'text-blue-400'
                        )}>
                          {dj.valor > 0 ? formatarEuro(dj.valor) : <span className="text-accent-subtle/40 font-normal">—</span>}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

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

    </div>

    <FormEvento
      aberto={eventoModalAberto}
      evento={eventoModal}
      onFechar={() => { setEventoModalAberto(false); setEventoModal(null) }}
      onGuardado={recarregarEventos}
    />

    {/* Documento de impressão — FORA do #agenda-app para não ser afectado pelo display:none */}
    <DocumentoAgendaMes
      agenda={agendaMes}
      espacos={espacos}
      tituloMes={tituloMesImpressao}
      filtroEspaco={filtroEspaco}
    />
  </>
  )
}
