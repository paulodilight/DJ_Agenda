import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSwipeNav } from '@/hooks/useSwipeNav'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Printer, Trophy, Shuffle, SlidersHorizontal, Loader2, Save, History, RotateCcw, Trash2, Send, UserCheck, MessageSquare, RefreshCw, Download, Lock, Unlock } from 'lucide-react'
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
import { useMesStore, useAppStore } from '@/store'
import { agendaApi, disponibilidadesApi, turnoValoresDiaApi } from '@/lib/api'
import { correrDistribuicao, calcularPreAlocacoes } from '@/lib/distribuicao'
import { gravarSnapshot, listarSnapshots, restaurarSnapshot, apagarSnapshot } from '@/lib/snapshots'
import { useUndo } from '@/contexts/UndoContext'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Modal } from '@/components/ui/Modal'
import { NotasGeraisAdminModal } from '@/components/agenda/NotasGeraisAdminModal'
import { useNotasNaoLidasAdmin } from '@/hooks/useNotasGeraisAdmin'
import { formatarEuro } from '@/utils/formatacao'
import { isoData } from '@/utils/datas'
import { clsx } from 'clsx'

const VISTAS = ['Dia', 'Semana', 'Mês']

export function Agenda() {
  const { anoMes, setAnoMes } = useMesStore()
  const config = useAppStore((s) => s.config)

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
  const [redistribuindo, setRedistribuindo] = useState(false)
  const { pushUndo, executarUndo, podeDesfazer, executando: undoExec } = useUndo()

  // ── disponibilidades abertas (contagem global) ──
  const [dispInfo, setDispInfo] = useState({ total: 0, abertas: 0 })
  const [togglingDisp, setTogglingDisp] = useState(false)

  useEffect(() => {
    supabase.from('djs').select('id, disponibilidades_abertas').eq('estado', 'activo')
      .then(({ data }) => {
        if (!data) return
        const total = data.length
        const abertas = data.filter(d => d.disponibilidades_abertas !== false).length
        setDispInfo({ total, abertas })
      })
      .catch(() => {})
  }, [])

  const toggleDispGlobal = async () => {
    setTogglingDisp(true)
    const fechar = dispInfo.abertas > 0
    try {
      const { error } = await supabase.from('djs')
        .update({ disponibilidades_abertas: !fechar })
        .eq('estado', 'activo')
      if (error) throw error
      setDispInfo(prev => ({ ...prev, abertas: fechar ? 0 : prev.total }))
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingDisp(false)
    }
  }

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
  const { eventos: supaEventosMes } = useSupaEventos({ dataInicio: mesInicio, dataFim: mesFim })
  const nEventosMes = useMemo(() => {
    const fonte = filtroEspaco
      ? supaEventosMes.filter(e => e.espaco_id === filtroEspaco)
      : supaEventosMes
    return fonte.length
  }, [supaEventosMes, filtroEspaco])

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

  // ── Contadores para botões de envio em bulk ──────────────────────────────────
  const { nProposta, nAceitacao, nAceite, nAlterar, nPreConf, nAddAgenda, nConfirmado, nValidacao, nPresente, nTrocado, nAPedido, nSemDJ, nTotal, nAPagamento, nPago } = useMemo(() => {
    const fonte = filtroEspaco
      ? agendaMes.filter(s => s.espaco_id === filtroEspaco)
      : agendaMes
    const activos = fonte.filter(s => s.estado !== 'cancelado' && s.estado !== 'sem_efeito')
    return {
      nProposta:   fonte.filter(s => s.estado === 'proposta').length,
      nAceitacao:  fonte.filter(s => s.estado === 'aceitação' || s.estado === 'aceite').length,
      nAceite:     fonte.filter(s => s.estado === 'aceite').length,
      nAlterar:    fonte.filter(s => s.estado === 'alterar').length,
      nValidacao:  fonte.filter(s => s.estado === 'validação').length,
      nPreConf:    fonte.filter(s => s.estado === 'pré-confirmado').length,
      nAddAgenda:  fonte.filter(s => s.estado === 'add_agenda').length,
      nAPagamento: fonte.filter(s => s.estado_pagamento === 'a_pagamento').length,
      nPago:       fonte.filter(s => s.estado_pagamento === 'pago').length,
      nConfirmado: fonte.filter(s => s.estado === 'confirmado').length,
      nPresente:   fonte.filter(s => s.estado === 'presente').length,
      nTrocado:    fonte.filter(s => s.estado === 'trocado').length,
      nAPedido:    fonte.filter(s => s.estado === 'a_pedido').length,
      nSemDJ:      activos.filter(s => !s.dj_id && !s.dj_nome).length,
      nTotal:      activos.length,
    }
  }, [agendaMes, filtroEspaco])

  const [enviandoDatas, setEnviandoDatas] = useState(false)
  const [enviandoManager, setEnviandoManager] = useState(false)
  const [enviandoConfirmados, setEnviandoConfirmados] = useState(false)
  const [notasModalAberto, setNotasModalAberto] = useState(false)

  const lsKeyConfirmados = `confirmados_env_${anoMesAlvo}_${filtroEspaco || 'todos'}`
  const confirmadosEnviadosCount = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(lsKeyConfirmados) ?? 'null')?.count ?? 0 }
    catch { return 0 }
  }, [lsKeyConfirmados])
  const mostrarBotaoConfirmados = nConfirmado > confirmadosEnviadosCount

  const { naoLidasPorEspaco, totalNaoLidas } = useNotasNaoLidasAdmin(anoMesAlvo)
  const badgeNotas = filtroEspaco ? (naoLidasPorEspaco[filtroEspaco] ?? 0) : totalNaoLidas

  const enviarDatas = async () => {
    setEnviandoDatas(true)
    try {
      let q = supabase.from('agenda').update({ estado: 'aceitação' })
        .in('estado', ['proposta', 'alterar'])
        .gte('data', mesInicio).lte('data', mesFim)
      if (filtroEspaco) q = q.eq('espaco_id', filtroEspaco)
      const { error } = await q
      if (error) throw error
      await Promise.all([recarregar(), recarregarMes()])
      // Notificação N8N
      fetch('https://i4dj.app.n8n.cloud/webhook/dj-enviar-datas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: anoMesAlvo, espaco_id: filtroEspaco || null }),
      }).catch(() => {})
    } catch (e) { alert('Erro ao enviar datas: ' + e.message) }
    finally { setEnviandoDatas(false) }
  }

  const enviarManager = async () => {
    setEnviandoManager(true)
    try {
      // Buscar slots em 'aceite'
      let qAceite = supabase.from('agenda').select('id')
        .eq('estado', 'aceite')
        .gte('data', mesInicio).lte('data', mesFim)
      if (filtroEspaco) qAceite = qAceite.eq('espaco_id', filtroEspaco)
      const { data: idsAceite, error: eAceite } = await qAceite
      if (eAceite) throw eAceite

      if (idsAceite?.length) {
        const agendaIds = idsAceite.map(r => r.id)
        await supabase.from('validacoes_datas').delete().in('agenda_id', agendaIds)
        const { error } = await supabase.from('agenda').update({ estado: 'validação' }).in('id', agendaIds)
        if (error) throw error
      }

      await Promise.all([recarregar(), recarregarMes()])
      fetch('https://i4dj.app.n8n.cloud/webhook/dj-enviar-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: anoMesAlvo, espaco_id: filtroEspaco || null }),
      }).catch(() => {})
    } catch (e) { alert('Erro ao enviar ao manager: ' + e.message) }
    finally { setEnviandoManager(false) }
  }

  const [enviandoPreConf, setEnviandoPreConf] = useState(false)
  const enviarPreConfirmado = async () => {
    setEnviandoPreConf(true)
    try {
      let q = supabase.from('agenda').select('id')
        .eq('estado', 'pré-confirmado')
        .gte('data', mesInicio).lte('data', mesFim)
      if (filtroEspaco) q = q.eq('espaco_id', filtroEspaco)
      const { data: ids, error: eIds } = await q
      if (eIds) throw eIds

      if (ids?.length) {
        const { error } = await supabase.from('agenda').update({ estado: 'add_agenda' }).in('id', ids.map(r => r.id))
        if (error) throw error
      }

      await Promise.all([recarregar(), recarregarMes()])
    } catch (e) { alert('Erro ao enviar pré-confirmado: ' + e.message) }
    finally { setEnviandoPreConf(false) }
  }

  const enviarConfirmados = async () => {
    setEnviandoConfirmados(true)
    try {
      // Apenas notificação — sem mudança de estado
      fetch('https://i4dj.app.n8n.cloud/webhook/dj-enviar-confirmados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: anoMesAlvo, espaco_id: filtroEspaco || null }),
      }).catch(() => {})
      localStorage.setItem(lsKeyConfirmados, JSON.stringify({ count: nConfirmado }))
    } catch (e) { alert('Erro ao enviar confirmados: ' + e.message) }
    finally { setEnviandoConfirmados(false) }
  }

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
      // Checkpoint automático antes de distribuir → permite Undo desta operação
      let snapAuto = null
      try {
        snapAuto = await gravarSnapshot({
          anoMes: anoMesAlvo,
          label: `Antes de ${modoDistribuir === 'completo' ? 'distribuir' : 'ajustar'}`,
          tipo: 'auto',
        })
      } catch { /* se falhar o snapshot, prossegue na mesma */ }

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

      if (snapAuto) {
        pushUndo({
          label: modoDistribuir === 'completo' ? 'Distribuição' : 'Ajustes',
          undo: async () => {
            await restaurarSnapshot(snapAuto.id)
            await Promise.all([recarregar(), recarregarMes()])
            await apagarSnapshot(snapAuto.id).catch(() => {})
          },
        })
      }
    } catch (e) {
      alert('Erro na distribuição: ' + e.message)
    } finally {
      setDistribuindo(false)
    }
  }

  const redistribuir = async () => {
    if (espacos.length === 0 || redistribuindo) return
    if (!window.confirm(
      `Re-distribuir TODOS os clientes para ${anoMesAlvo}?\n\nTodos os slots automáticos serão apagados e recriados com as disponibilidades actuais. Slots em Validação, A pedido e DJs Convidado EXT / Premium são preservados.`
    )) return
    setRedistribuindo(true)
    try {
      let snapAuto = null
      try {
        snapAuto = await gravarSnapshot({ anoMes: anoMesAlvo, label: 'Antes de re-distribuir', tipo: 'auto' })
      } catch { /* prossegue mesmo sem snapshot */ }

      const preAlocacoes = await calcularPreAlocacoes(anoMesAlvo)

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
      const alvos = [...espacos].sort((a, b) => {
        const aO = a.ordem_distribuicao ?? Infinity, bO = b.ordem_distribuicao ?? Infinity
        if (aO !== bO) return aO - bO
        const dd = (opDias[a.id]?.size ?? 7) - (opDias[b.id]?.size ?? 7)
        if (dd !== 0) return dd
        return (prefCount[b.id] ?? 0) - (prefCount[a.id] ?? 0)
      })

      let total = 0
      for (const espaco of alvos) {
        const { inseridos } = await correrDistribuicao({
          anoMes: anoMesAlvo, espacoId: espaco.id, preAlocacoes, modo: 'completo',
        })
        total += inseridos
      }
      await Promise.all([recarregar(), recarregarMes()])
      console.info(`Re-distribuição concluída: ${total} slots em ${alvos.length} Cliente(s).`)

      if (snapAuto) {
        pushUndo({
          label: 'Re-distribuição',
          undo: async () => {
            await restaurarSnapshot(snapAuto.id)
            await Promise.all([recarregar(), recarregarMes()])
            await apagarSnapshot(snapAuto.id).catch(() => {})
          },
        })
      }
    } catch (e) {
      alert('Erro na re-distribuição: ' + e.message)
    } finally {
      setRedistribuindo(false)
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

  const descarregarCheckpoint = async (snap) => {
    setSnapBusy(true)
    try {
      const { data, error } = await supabase.from('snapshots').select('*').eq('id', snap.id).single()
      if (error) throw error
      const blob = new Blob([JSON.stringify(data.dados, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `checkpoint_${data.ano_mes}_${(data.label || 'auto').replace(/\s+/g, '_')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setSnapMsg('Erro ao descarregar: ' + e.message) }
    finally { setSnapBusy(false) }
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // Executa o movimento/troca na BD e refresca
  const executarMover = async ({ draggedSlot, targetData, targetEspacoId, targetTurnoId, targetSlot }) => {
    // Posições originais (para o inverso/undo)
    const origDrag   = { data: draggedSlot.data, turno_id: draggedSlot.turno_id ?? null, espaco_id: draggedSlot.espaco_id }
    const origTarget = targetSlot ? { data: targetSlot.data, turno_id: targetSlot.turno_id ?? null, espaco_id: targetSlot.espaco_id } : null
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
      pushUndo({
        label: 'Atuação movida',
        undo: async () => {
          if (origTarget) {
            await Promise.all([
              agendaApi.moverSlot(draggedSlot.id, origDrag),
              agendaApi.moverSlot(targetSlot.id, origTarget),
            ])
          } else {
            await agendaApi.moverSlot(draggedSlot.id, origDrag)
          }
          recarregarSilencioso()
        },
      })
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
  const navAnterior = useCallback(() => {
    if (vista === 'Dia')    return navegar(addDays(referencia, -1))
    if (vista === 'Semana') return navegar(addWeeks(referencia, -1))
    return navegar(addMonths(referencia, -1))
  }, [vista, referencia])

  const navProxima = useCallback(() => {
    if (vista === 'Dia')    return navegar(addDays(referencia, 1))
    if (vista === 'Semana') return navegar(addWeeks(referencia, 1))
    return navegar(addMonths(referencia, 1))
  }, [vista, referencia])

  const swipe = useSwipeNav(navAnterior, navProxima)

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

    let horaInicio  = turno?.hora_inicio?.slice(0, 5) ?? null
    let horaFim     = turno?.hora_fim?.slice(0, 5)    ?? null
    let valor       = turno?.valor ?? null
    let subtipoKey  = null

    // Consultar sempre turno_valores_dia para o dia da semana (horas + valor + subtipo)
    if (turnoId && data) {
      try {
        const diaSem = new Date(data + 'T12:00:00').getDay()
        const cfg = await turnoValoresDiaApi.buscarConfigDia(turnoId, diaSem)
        if (cfg) {
          horaInicio = cfg.hora_inicio?.slice(0, 5) ?? horaInicio
          horaFim    = cfg.hora_fim?.slice(0, 5)    ?? horaFim
          valor      = cfg.valor ?? valor
          subtipoKey = cfg.subtipo_key ?? null
        }
        // Auto-detectar subtipo pelo valor + dia quando não está configurado em turno_valores_dia
        if (!subtipoKey && valor != null) {
          try {
            const subs = JSON.parse(config?.contas_subtipos ?? '[]')
            // 1. Tentar inferir o tipo do mesmo turno (noutros dias já configurados)
            const { data: outrosDias } = await supabase
              .from('turno_valores_dia')
              .select('subtipo_key')
              .eq('turno_id', turnoId)
              .not('subtipo_key', 'is', null)
              .limit(1)
            const tipoReferencia = outrosDias?.length
              ? subs.find(s => s.key === outrosDias[0].subtipo_key)?.tipo
              : null
            // 2. Encontrar o subtipo que corresponde: tipo inferred + valor + dia + variante 1
            const match = subs.find(s =>
              s.custo === Number(valor) &&
              (s.dias ?? []).includes(diaSem) &&
              s.variante === 1 &&
              (!tipoReferencia || s.tipo === tipoReferencia)
            )
            if (match) subtipoKey = match.key
          } catch { /* ignora */ }
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
      ...(subtipoKey    ? { subtipo_key: subtipoKey } : {}),
    })
    setModalAberto(true)
  }

  const abrirEditarSlot = (slot) => {
    setSlotActual(slot)
    setModalAberto(true)
  }

  const fecharModal = () => { setModalAberto(false); setSlotActual(null) }

  const confirmarSlotRapido = async (slot) => {
    if (!['proposta', 'aceite', 'pré-confirmado'].includes(slot.estado)) return
    const novoEstado = 'confirmado'
    try {
      await agendaApi.mudarEstado(slot.id, novoEstado)
      await supabase.from('agenda_historico').insert({
        agenda_id: slot.id, tipo: 'estado',
        descricao: `${slot.estado} → ${novoEstado}`,
      })
      recarregarSilencioso?.()
    } catch (e) {
      console.error('Erro ao confirmar slot:', e.message)
    }
  }

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
    <><div id="agenda-app" className="flex flex-col h-full" {...swipe}>
      {/* Toolbar — 3 linhas explícitas */}
      <div className="flex flex-col border-b border-border/50 bg-surface-0/60 shrink-0">

        {/* Linha 1: Ir para (esq) · nav + vista (centro) · Top DJs + Imprimir (dir) */}
        <div className="flex items-center justify-between px-5 py-2 gap-4">
          {/* Esquerda: Ir para data */}
          <div className="flex items-center gap-1.5">
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

          {/* Centro: navegação + toggle vista */}
          <div className="flex items-center gap-3">
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

          {/* Direita: Top DJs + Imprimir + Undo + Gravar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRankingAberto(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
              title="Top DJs do mês"
            >
              <Trophy size={13} />
              Top DJs
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
              title="Imprimir programa do mês"
            >
              <Printer size={13} />
              Imprimir
            </button>
            <button
              onClick={async () => { await executarUndo(); recarregar(); recarregarMes() }}
              disabled={!podeDesfazer || undoExec}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Desfazer a última ação"
            >
              <RotateCcw size={13} />
              {undoExec ? 'A desfazer…' : 'Undo'}
            </button>
            <button
              onClick={abrirCheckpoints}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
              title="Gravar / restaurar estado do mês"
            >
              <Save size={13} />
              Gravar
            </button>
            <button
              onClick={toggleDispGlobal}
              disabled={togglingDisp}
              title={dispInfo.abertas > 0 ? `Fechar disponibilidades (${dispInfo.abertas} DJs com acesso)` : 'Abrir disponibilidades para todos os DJs'}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors disabled:opacity-50',
                dispInfo.abertas > 0
                  ? 'border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado hover:bg-status-confirmado/20'
                  : 'border-status-cancelado/40 bg-status-cancelado/10 text-status-cancelado hover:bg-status-cancelado/20'
              )}
            >
              {dispInfo.abertas > 0 ? <Unlock size={13} /> : <Lock size={13} />}
              {dispInfo.abertas > 0 ? `Disp. (${dispInfo.abertas}/${dispInfo.total})` : 'Disp. fechadas'}
            </button>
          </div>
        </div>

        {/* Linha 2: indicador preenchimento — só aparece com filtro de cliente */}
        {filtroEspaco && esperadosMes > 0 && (
          <div className="flex items-center px-5 py-1.5 border-t border-border/30">
            {datasOk ? (
              <span className="text-sm font-bold tracking-widest uppercase text-status-confirmado">
                ✓ Datas Completas · {comDJMes} / {esperadosMes}
              </span>
            ) : (
              <span className="text-sm font-bold tracking-widest uppercase text-orange-400">
                Faltam {faltamPreencher} {faltamPreencher === 1 ? 'DJ' : 'DJs'} · {comDJMes} / {esperadosMes}
              </span>
            )}
          </div>
        )}

        {/* Linha 3: botões dinâmicos (só aparece se houver algum) */}
        {((nProposta > 0 || nAlterar > 0) || nPreConf > 0 || mostrarBotaoConfirmados || true) && (
          <div className="flex items-center justify-end gap-2 px-5 py-1.5 border-t border-border/30 flex-wrap">

            {(nProposta > 0 || nAlterar > 0) && (
              <button
                onClick={enviarDatas}
                disabled={enviandoDatas}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold transition-colors disabled:opacity-40 border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                title={nAlterar > 0 && nProposta === 0 ? 'Reenviar slots em Alterar para Aceitação' : 'Mover todos os slots em Proposta para Aceitação'}
              >
                {enviandoDatas ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {nAlterar > 0 && nProposta === 0 ? 'Re-enviar ajustes' : 'Enviar datas'}
                <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-[10px] font-bold">
                  {nProposta + nAlterar}
                </span>
              </button>
            )}

            {nAceite > 0 && (
              <button
                onClick={() => {
                  const pendentes = nProposta + nAlterar
                  if (pendentes > 0 && !window.confirm(
                    `Ainda há ${pendentes} DJ${pendentes > 1 ? 's' : ''} sem resposta (proposta/alterar).\n\nEnviar ao manager na mesma?`
                  )) return
                  enviarManager()
                }}
                disabled={enviandoManager}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20"
                title="Mover aceites para Validação (manager aprova)"
              >
                {enviandoManager ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                Enviar ao manager
                <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold">{nAceite}</span>
              </button>
            )}

            {nPreConf > 0 && (
              <button
                onClick={enviarPreConfirmado}
                disabled={enviandoPreConf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-indigo-500/40 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20"
                title="Enviar pré-confirmados ao DJ para confirmação final"
              >
                {enviandoPreConf ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Enviar pré-confirmado
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">{nPreConf}</span>
              </button>
            )}

            {mostrarBotaoConfirmados && (
              <button
                onClick={enviarConfirmados}
                disabled={enviandoConfirmados}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold transition-colors disabled:opacity-40 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                title="Enviar notificação aos DJs com agenda confirmada"
              >
                {enviandoConfirmados ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Enviar confirmados
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">{nConfirmado}</span>
              </button>
            )}

            <button
              onClick={distribuir}
              disabled={distribuindo || redistribuindo || espacos.length === 0 || (modoDistribuir === 'ajustes' && !temAlterar)}
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
              {distribuindo ? <Loader2 size={13} className="animate-spin" /> : modoDistribuir === 'completo' ? <Shuffle size={13} /> : <SlidersHorizontal size={13} />}
              {distribuindo ? 'A processar…' : modoDistribuir === 'completo' ? 'Distribuir' : 'Ajustes'}
            </button>

            {jaDistribuido && (
              <button
                onClick={redistribuir}
                disabled={redistribuindo || distribuindo || espacos.length === 0}
                title={`Re-distribuir todos os clientes para ${anoMesAlvo} (apaga e recria slots automáticos com disponibilidades actuais)`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold tracking-wide uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap bg-surface-2 text-orange-400 border-orange-500/30 hover:border-orange-400/60"
              >
                {redistribuindo ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {redistribuindo ? 'A processar…' : 'Re-distribuir Total'}
              </button>
            )}

          </div>
        )}
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

        {filtroEspaco && (
          <button
            onClick={() => setNotasModalAberto(true)}
            title="Notas gerais do mês"
            className={clsx(
              'relative ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors border',
              badgeNotas > 0
                ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
            )}
          >
            <MessageSquare size={12} />
            Notas
            {badgeNotas > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {badgeNotas}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Barra de estado — oculta quando tudo confirmado/presente ou total = 0 */}
      {nTotal > 0 && (nProposta + nAceitacao + nAlterar + nValidacao + nPreConf + nTrocado + nAPedido + nSemDJ) > 0 && (
        <div className="flex items-center gap-3 px-6 py-1.5 border-b border-border/40 bg-surface-0/30 shrink-0 flex-wrap">
          <span className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Total {nTotal}</span>
          <span className="text-border/40">·</span>
          {[
            { n: nProposta,   label: 'Proposta',    cor: 'text-yellow-400' },
            { n: nAceitacao,  label: 'Aceitação',   cor: 'text-orange-400' },
            { n: nAlterar,    label: 'Alterar',     cor: 'text-rose-400' },
            { n: nValidacao,  label: 'Validação',   cor: 'text-amber-400' },
            { n: nPreConf,    label: 'Pré-conf',    cor: 'text-sky-400' },
            { n: nConfirmado, label: 'Confirmado',  cor: 'text-emerald-400' },
            { n: nPresente,   label: 'Presente',    cor: 'text-emerald-300' },
            { n: nTrocado,    label: 'Trocado',     cor: 'text-pink-400' },
            { n: nAPedido,    label: 'A pedido',    cor: 'text-violet-400' },
            { n: nSemDJ,      label: 'Sem DJ',      cor: 'text-teal-400' },
            { n: nAPagamento, label: 'A Pagar',     cor: 'text-amber-400' },
            { n: nPago,       label: 'Pago',        cor: 'text-green-400' },
          ].filter(({ n }) => n > 0).map(({ n, label, cor }, i, arr) => (
            <span key={label} className="flex items-center gap-2">
              <span className="text-[11px] text-accent-subtle/60">{label} <span className={clsx('font-bold', cor)}>{n}</span></span>
              {i < arr.length - 1 && <span className="text-border/40">·</span>}
            </span>
          ))}
          {nEventosMes > 0 && (
            <>
              <span className="text-border/40">·</span>
              <span className="text-[11px] text-accent-subtle/60">Eventos <span className="font-bold text-yellow-300">{nEventosMes}</span></span>
            </>
          )}
        </div>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-border shrink-0">
        {[
          { cor: 'bg-yellow-400/70',   label: 'Proposta' },
          { cor: 'bg-orange-400/60',   label: 'Aceitação' },
          { cor: 'bg-rose-400/60',     label: 'Alteração' },
          { cor: 'bg-amber-400/60',    label: 'Validação' },
          { cor: 'bg-sky-400/60',      label: 'Pré-conf.' },
          { cor: 'bg-emerald-400/70',  label: 'Confirmado' },
          { cor: 'bg-status-cancelado/60',     label: 'Cancelado' },
          { cor: 'bg-status-lock/70',          label: 'LOCK' },
          { cor: 'bg-yellow-400/20 border border-yellow-400/30',        label: 'Externo' },
          { cor: 'bg-zinc-400/[0.13] border border-zinc-400/35',        label: 'A pedido' },
          { cor: 'bg-surface-1/50 border border-dashed border-white/10', label: 'Sem Efeito' },
          { cor: 'bg-surface-3 border border-dashed border-border',      label: 'Vazio' },
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
              onConfirmarSlot={confirmarSlotRapido}
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
                <button onClick={() => descarregarCheckpoint(s)} disabled={snapBusy}
                  title="Descarregar como ficheiro JSON"
                  className="p-1 rounded text-accent-subtle hover:text-sky-400 transition-colors disabled:opacity-40">
                  <Download size={13} />
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

      <NotasGeraisAdminModal
        aberto={notasModalAberto}
        onFechar={() => setNotasModalAberto(false)}
        espacos={espacos}
        defaultEspacoId={filtroEspaco}
        anoMes={anoMesAlvo}
        naoLidasPorEspaco={naoLidasPorEspaco}
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
