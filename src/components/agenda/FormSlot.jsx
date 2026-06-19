import { useState, useEffect, useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { Badge } from '@/components/ui/Badge'
import { agendaApi, agendaHorasExtraApi, turnoValoresDiaApi } from '@/lib/api'
import { useUndo } from '@/contexts/UndoContext'
import { supabase } from '@/lib/supabase'
import { useDJs } from '@/hooks/useDJs'
import { useEspacos } from '@/hooks/useEspacos'
import { validarSlot } from '@/lib/regras'
import { useAppStore } from '@/store'
import { useBloqueios } from '@/hooks/useBloqueios'
import { useAgenda } from '@/hooks/useAgenda'
import { formatarEuro } from '@/utils/formatacao'
import { formatarData, formatarHora } from '@/utils/datas'
import { FormEvento } from '@/components/eventos/FormEvento'
import { DJCombobox, NovoDJLink } from './DJCombobox'
import { supaEventosApi } from '@/lib/supaEventosApi'
import { trocarDJ, trocarDJDireto, registarHistorico } from '@/lib/trocas'
import { clsx } from 'clsx'
import { CalendarPlus, Link2, Star, ArrowLeftRight, RotateCcw, Plus, Trash2, Clock } from 'lucide-react'

const ESTADO_OPCOES = [
  { value: 'proposta',        label: 'Proposta' },
  { value: 'aceitação',       label: 'Aceitação DJ' },
  { value: 'aceite',          label: 'Aguarda confirmação' },
  { value: 'validação',       label: 'Validação' },
  { value: 'pré-confirmado',  label: 'Pré-confirmado' },
  { value: 'confirmado',      label: 'Confirmado' },
  { value: 'alterar',         label: 'Alterar' },
  { value: 'trocado',         label: 'Trocado' },
  { value: 'a_pedido',        label: 'A pedido' },
  { value: 'presente',        label: 'Presente' },
  { value: 'faltou',          label: 'Faltou' },
  { value: 'cancelado',       label: 'Cancelado' },
  { value: 'sem_efeito',      label: 'Sem Efeito' },
]

const TIPO_SLOT_OPCOES = [
  { value: 'residente anl', label: 'Residente ANL' },
  { value: 'residente',     label: 'Residente' },
  { value: 'residente st',  label: 'Residente ST' },
  { value: 'convidado int', label: 'Convidado INT' },
  { value: 'convidado ext', label: 'Convidado EXT' },
  { value: 'premium',       label: 'Premium' },
]

const KEY_TIPO_MAP = {
  'residente_anl': 'residente anl',
  'residente_st':  'residente st',
  'residente':     'residente',
  'convidado_int': 'convidado int',
  'convidado_ext': 'convidado ext',
  'premium':       'premium',
}

const safeParse = (s, fb) => { try { return s ? JSON.parse(s) : fb } catch { return fb } }

const vazio = {
  dj_id: '', dj_externo: '', espaco_id: '', data: '', hora_inicio: '22:00', hora_fim: '02:00',
  valor: '', margem: '', estado: 'proposta', evento: '', notas: '', tipo_slot: '', subtipo_key: '',
  transporte: '', extras: '', notas_contas: '', estado_pagamento: 'pendente', forma_pagamento: '',
}

const ESTADO_PAG_OPCOES = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'parcial',  label: 'Parcial' },
  { value: 'pago',     label: 'Pago' },
]
const FORMA_PAG_OPCOES = [
  { value: 'transferencia', label: 'Transferência' },
  { value: 'dinheiro',      label: 'Dinheiro' },
  { value: 'mbway',         label: 'MBWay' },
  { value: 'outro',         label: 'Outro' },
]

export function FormSlot({ aberto, slot, onFechar, onGuardado, simplificado = false, conflito = false }) {
  const [form, setForm] = useState(vazio)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const [conflitos, setConflitos] = useState([])
  const [eventoFormAberto, setEventoFormAberto] = useState(false)
  const { pushUndo } = useUndo()
  const [conflitoCrossEspaco, setConflitoCrossEspaco] = useState(null)
  const [avisoMeta, setAvisoMeta] = useState(null)
  const [bloqueioIndisponivel, setBloqueioIndisponivel] = useState(null)
  const [avisoOptIn, setAvisoOptIn] = useState(null)
  const [verificacaoFeita, setVerificacaoFeita] = useState(false)
  const [overrideRegras, setOverrideRegras] = useState(false)
  const [novoDJCriado, setNovoDJCriado] = useState(null)
  const [djConvidadoQuery, setDjConvidadoQuery] = useState('')
  const [eventoAutoLink, setEventoAutoLink] = useState(false)
  const [aba, setAba] = useState(0)
  const [avaliacao, setAvaliacao] = useState(null)

  // ── Horas Extra ──
  const [horasExtras, setHorasExtras]               = useState([])
  const [horasExtraLoading, setHorasExtraLoading]   = useState(false)
  const [novaHora, setNovaHora]                     = useState({ descricao: '', horas: '', valor_hora: '' })
  const [novaHoraAberta, setNovaHoraAberta]         = useState(false)
  const [novaHoraLoading, setNovaHoraLoading]       = useState(false)

  // ── Troca de DJ ──
  const [trocaAberta, setTrocaAberta]       = useState(false)
  const [trocaDjId, setTrocaDjId]           = useState('')
  const [trocaMotivo, setTrocaMotivo]       = useState('')
  const [trocaLoading, setTrocaLoading]     = useState(false)
  const [trocaErro, setTrocaErro]           = useState(null)
  const [tipoTroca, setTipoTroca]           = useState('substituir')
  const [trocaDataId, setTrocaDataId]       = useState('')
  const [trocaSlots, setTrocaSlots]         = useState([])
  const [trocaSlotsLoading, setTrocaSlotsLoading] = useState(false)

  // ── Histórico ──
  const [historico, setHistorico] = useState([])

  const { djs } = useDJs()
  const { espacos } = useEspacos()
  const { bloqueios } = useBloqueios()
  const { agenda } = useAgenda()
  const config = useAppStore((s) => s.config)

  useEffect(() => {
    if (aberto && slot) {
      const initialForm = {
        ...vazio,
        ...slot,
        valor: slot.valor ?? '',
        hora_inicio: slot.hora_inicio?.slice(0, 5) ?? '22:00',
        hora_fim: slot.hora_fim?.slice(0, 5) ?? '02:00',
        evento: slot.evento ?? '',
        notas: slot.notas ?? '',
        estado: slot.estado ?? 'confirmado',
        dj_externo: !slot.dj_id && slot.dj_nome ? slot.dj_nome : '',
        margem: slot.margem ?? '',
        transporte: slot.transporte ?? '',
        extras: slot.extras ?? '',
        notas_contas: slot.notas_contas ?? '',
        estado_pagamento: slot.estado_pagamento ?? 'pendente',
        forma_pagamento: slot.forma_pagamento ?? '',
      }
      // Se vem com subtipo_key mas sem tipo_slot, derivar tipo_slot do subtipo
      if (slot.subtipo_key && !slot.tipo_slot) {
        const sub = subtiposDisp.find(s => s.key === slot.subtipo_key)
        if (sub) initialForm.tipo_slot = KEY_TIPO_MAP[sub.tipo] ?? sub.tipo
      }
      setForm(initialForm)
      setLoading(false)
      setErro(null)
      setConflitos([])
      setConflitoCrossEspaco(null)
      setAvisoMeta(null)
      setBloqueioIndisponivel(null)
      setAvisoOptIn(null)
      setVerificacaoFeita(false)
      setOverrideRegras(false)
      setNovoDJCriado(null)
      setDjConvidadoQuery('')
      setEventoAutoLink(false)
      setAba(0)
      setHorasExtras([])
      setNovaHoraAberta(false)
      setNovaHora({ descricao: '', horas: '', valor_hora: '' })
    }
    if (aberto && !slot) {
      setForm((f) => ({ ...vazio, ...f, estado: 'proposta' }))
      setNovoDJCriado(null)
      setEventoAutoLink(false)
      setAba(0)
    }
  }, [aberto, slot, simplificado])

  // Carrega horas extras quando entra no separador Contas (aba 2)
  useEffect(() => {
    if (!aberto || !slot?.id || aba !== 2) return
    setHorasExtraLoading(true)
    agendaHorasExtraApi.listar(slot.id)
      .then(data => setHorasExtras(data))
      .catch(() => {})
      .finally(() => setHorasExtraLoading(false))
  }, [aberto, slot?.id, aba])

  // Carregar avaliação do gestor quando o modal abre com um slot existente
  useEffect(() => {
    if (!aberto || !slot?.id) { setAvaliacao(null); return }
    supabase
      .from('avaliacoes_djs')
      .select('*')
      .eq('agenda_id', slot.id)
      .maybeSingle()
      .then(({ data }) => setAvaliacao(data ?? null))
  }, [aberto, slot?.id])

  // Carrega histórico quando o slot abre
  useEffect(() => {
    if (!aberto || !slot?.id) { setHistorico([]); return }
    supabase
      .from('agenda_historico')
      .select('*')
      .eq('agenda_id', slot.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHistorico(data ?? []))
  }, [aberto, slot?.id])

  // Carrega slots futuros do novo DJ quando "troca direta" está activa
  useEffect(() => {
    if (!trocaDjId || tipoTroca !== 'troca_direta') { setTrocaSlots([]); return }
    setTrocaSlotsLoading(true)
    const hoje = new Date().toISOString().slice(0, 10)
    supabase
      .from('agenda')
      .select('id, data, hora_inicio, espacos!agenda_espaco_id_fkey(nome)')
      .eq('dj_id', trocaDjId)
      .gte('data', hoje)
      .not('estado', 'in', '("cancelado","faltou","sem_efeito")')
      .neq('id', slot?.id ?? '')
      .order('data', { ascending: true })
      .limit(30)
      .then(({ data }) => { setTrocaSlots(data ?? []); setTrocaSlotsLoading(false) })
      .catch(() => setTrocaSlotsLoading(false))
  }, [trocaDjId, tipoTroca, slot?.id])

  // Auto-fill valor + subtipo quando abre slot com turno_id e sem valor definido
  useEffect(() => {
    if (!aberto || !slot?.turno_id || !slot?.data || slot?.valor) return
    const diaSemana = new Date(slot.data + 'T12:00:00').getDay()
    turnoValoresDiaApi.buscarConfigDia(slot.turno_id, diaSemana).then(cfg => {
      if (!cfg) return
      setForm(f => {
        if (f.valor !== '' && f.subtipo_key) return f
        const sub = cfg.subtipo_key ? subtiposDisp.find(s => s.key === cfg.subtipo_key) : null
        return {
          ...f,
          valor:       f.valor === '' && cfg.valor != null ? String(cfg.valor) : f.valor,
          subtipo_key: !f.subtipo_key && cfg.subtipo_key ? cfg.subtipo_key : f.subtipo_key,
          tipo_slot:   !f.tipo_slot && sub ? (KEY_TIPO_MAP[sub.tipo] ?? sub.tipo) : f.tipo_slot,
        }
      })
    }).catch(() => {})
  }, [aberto, slot?.turno_id, slot?.data, slot?.valor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill evento quando data + espaco_id mudam
  useEffect(() => {
    if (!form.data || !form.espaco_id || form.evento) return
    supaEventosApi.listar({ dataInicio: form.data, dataFim: form.data })
      .then((eventos) => {
        const match = eventos.find((e) => e.espaco_id === form.espaco_id)
        if (match?.evento) {
          setForm((f) => ({ ...f, evento: match.evento }))
          setEventoAutoLink(true)
        }
      })
      .catch(() => {})
  }, [form.data, form.espaco_id])

  const subtiposDisp = useMemo(() => {
    const transps = safeParse(config.contas_transportes, [])
    const transpDefault = transps[0]?.valor ?? 0
    const subs = safeParse(config.contas_subtipos, [])
    return subs.map(s => ({
      ...s,
      total: (s.custo ?? 0) + (s.margem ?? 0) + (s.semTransporte ? 0 : transpDefault),
    }))
  }, [config])

  const setSubtipoKey = (key) => {
    const sub = subtiposDisp.find(s => s.key === key)
    setForm(f => ({
      ...f,
      subtipo_key: key,
      tipo_slot: sub ? (KEY_TIPO_MAP[sub.tipo] ?? sub.tipo) : f.tipo_slot,
      valor: sub?.custo > 0 ? String(sub.custo) : f.valor,
    }))
  }

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  // DJ da base e DJ externo são mutuamente exclusivos
  const setDjId = (e) => setForm((f) => ({ ...f, dj_id: e.target.value, dj_externo: e.target.value ? '' : f.dj_externo }))
  const setDjExterno = (e) => setForm((f) => ({ ...f, dj_externo: e.target.value, dj_id: e.target.value.trim() ? '' : f.dj_id }))

  useEffect(() => {
    if (simplificado) { setConflitos([]); return }
    if (!form.dj_id || !form.espaco_id || !form.data) { setConflitos([]); return }
    const dj = djs.find((d) => d.id === form.dj_id)
    const espaco = espacos.find((e) => e.id === form.espaco_id)
    if (!dj || !espaco) return
    const agendaSemActual = agenda.filter((a) => a.id !== slot?.id)
    const c = validarSlot({
      djId: form.dj_id, espacoId: form.espaco_id, data: form.data,
      valorDJ: dj.valor_sessao,
      bloqueios, agenda: agendaSemActual, espaco, config, espacos,
    })
    setConflitos(c)
  }, [form.dj_id, form.espaco_id, form.data, djs, espacos, bloqueios, agenda, config, slot?.id, simplificado])

  // Validações live: conflito cross-Cliente (bloqueia) + meta mensal (avisa)
  useEffect(() => {
    if (!form.dj_id || !form.data) {
      setConflitoCrossEspaco(null)
      setAvisoMeta(null)
      setBloqueioIndisponivel(null)
      setAvisoOptIn(null)
      setVerificacaoFeita(true)  // sem dj_id — nada a verificar, banner genérico mantém-se
      return  // DJ externo (sem dj_id) ou data vazia — sem validações de base
    }
    const espacoIdActual = form.espaco_id || slot?.espaco_id || ''

    const verificar = async () => {
      // ── 1. Conflito cross-Cliente ─────────────────────────────────────────
      // Bloqueia se o DJ já tiver slot noutro Cliente nesta data
      let qCross = supabase
        .from('agenda')
        .select('id, espaco_id, espacos!agenda_espaco_id_fkey(nome)')
        .eq('dj_id', form.dj_id)
        .eq('data', form.data)
        .neq('estado', 'cancelado')
      if (slot?.id) qCross = qCross.neq('id', slot.id)

      const { data: slotsNaData } = await qCross
      const conflito = (slotsNaData ?? []).find(s => s.espaco_id !== espacoIdActual)
      setConflitoCrossEspaco(
        conflito
          ? `🔴 DJ no mesmo dia noutro Cliente · já está em "${conflito.espacos?.nome ?? 'outro Cliente'}" — não é possível guardar`
          : null
      )

      // ── 2. Meta mensal ───────────────────────────────────────────────────
      // Avisa (não bloqueia) se meta_datas_mes estiver atingida
      const dj = djs.find(d => d.id === form.dj_id)
      if (dj?.meta_datas_mes > 0) {
        const mesAno = form.data.slice(0, 7)
        const [ano, mes] = mesAno.split('-').map(Number)
        const ultimoDia = new Date(ano, mes, 0).getDate()
        const mesInicio = `${mesAno}-01`
        const mesFim    = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`

        let qMeta = supabase
          .from('agenda')
          .select('id', { count: 'exact', head: true })
          .eq('dj_id', form.dj_id)
          .gte('data', mesInicio)
          .lte('data', mesFim)
          .neq('estado', 'cancelado')
        if (slot?.id) qMeta = qMeta.neq('id', slot.id)

        const { count } = await qMeta
        const total = count ?? 0
        setAvisoMeta(
          total >= dj.meta_datas_mes
            ? `Meta mensal atingida: ${total}/${dj.meta_datas_mes} atuações em ${mesAno.replace('-', '/')} — podes guardar na mesma`
            : null
        )
      } else {
        setAvisoMeta(null)
      }

      // ── 3. Disponibilidade do DJ nesta data ──────────────────────────────
      // Bloqueia se disponivel=false; avisa se DJ tem opt-in no mês mas esta data não consta
      const mesAno = form.data.slice(0, 7)
      const [anoD, mesD] = mesAno.split('-').map(Number)
      const ultimoDiaD = new Date(anoD, mesD, 0).getDate()
      const mesInicioD = `${mesAno}-01`
      const mesFimD    = `${mesAno}-${String(ultimoDiaD).padStart(2, '0')}`

      const { data: dispMes } = await supabase
        .from('disponibilidades')
        .select('data, disponivel')
        .eq('dj_id', form.dj_id)
        .gte('data', mesInicioD)
        .lte('data', mesFimD)

      const registos = dispMes ?? []
      const indisponivel = registos.find(r => r.data === form.data && r.disponivel === false)
      const optIns = registos.filter(r => r.disponivel === true)

      if (indisponivel) {
        const dj = djs.find(d => d.id === form.dj_id)
        const nomeDJ = dj?.nome_artistico || dj?.nome || 'DJ'
        setBloqueioIndisponivel(`🚫 Indisponível · ${nomeDJ} marcou esta data como indisponível — não é possível agendar`)
        setAvisoOptIn(null)
      } else {
        setBloqueioIndisponivel(null)
        if (optIns.length > 0 && !optIns.find(r => r.data === form.data)) {
          const dj = djs.find(d => d.id === form.dj_id)
          const nomeDJ = dj?.nome_artistico || dj?.nome || 'DJ'
          setAvisoOptIn(`📅 Sem disponibilidade · ${nomeDJ} não indicou esta data (tem opt-in noutros dias do mês)`)
        } else {
          setAvisoOptIn(null)
        }
      }
      setVerificacaoFeita(true)
    }

    verificar()
  }, [form.dj_id, form.data, form.espaco_id, slot?.id, slot?.espaco_id, djs])

  const guardar = async (e) => {
    e.preventDefault()
    console.log('guardar:', { overrideRegras, conflitoCrossEspaco, bloqueioIndisponivel, conflito, conflitos })
    if (!overrideRegras && (conflitoCrossEspaco || bloqueioIndisponivel || conflito || conflitos.length > 0)) return
    setErro(null)
    setLoading(true)
    try {
      // Auto-criar DJ convidado se digitou nome mas não selecionou da lista
      let djIdFinal = form.dj_id || null
      if (!djIdFinal && djConvidadoQuery.trim().length >= 2) {
        const nome = djConvidadoQuery.trim()
        const existente = djsActivos.find(d =>
          (d.nome_artistico || d.nome || '').toLowerCase() === nome.toLowerCase()
        )
        if (existente) {
          djIdFinal = existente.id
        } else {
          const { data: novoDJ, error: erroCriar } = await supabase
            .from('djs')
            .insert({ nome, nome_artistico: nome, estado: 'activo', app_abas: ['agenda','dados','club'],
              qualidade_artistica: 0, assiduidade: 0, profissionalismo: 0, adaptacao_espaco: 0,
              prioridade_admin: 0, excluido_admin: false })
            .select().single()
          if (erroCriar) throw erroCriar
          await supabase.from('dj_categorias').insert({ dj_id: novoDJ.id, categoria_id: 4 })
          djIdFinal = novoDJ.id
          setNovoDJCriado(novoDJ)
        }
      }
      const isConvidado = !djIdFinal && !!form.dj_externo?.trim()
      const { subtipo_key: _sk, ...formData } = form
      const payload = {
        ...formData,
        dj_id:            djIdFinal,
        dj_nome:          isConvidado ? form.dj_externo.trim() : null,
        espaco_id:        form.espaco_id || null,
        valor:            form.valor  === '' ? null : Number(form.valor),
        margem:           form.margem === '' ? null : Number(form.margem),
        transporte:       form.transporte === '' ? null : Number(form.transporte),
        extras:           form.extras     === '' ? null : Number(form.extras),
        notas_contas:     form.notas_contas?.trim() || null,
        estado_pagamento: form.estado_pagamento || null,
        forma_pagamento:  form.forma_pagamento  || null,
        tipo_slot: isConvidado ? 'convidado' : (form.tipo_slot || 'residente'),
        evento:    form.evento.trim() || null,
        notas:     form.notas.trim() || null,
        origem:    'manual',
      }
      if (slot?.id) {
        await agendaApi.actualizar(slot.id, payload)
        // Histórico — não-bloqueante
        try {
          if (slot.estado !== form.estado)
            await registarHistorico(slot.id, 'estado', `${slot.estado} → ${form.estado}`)
          if (slot.dj_id !== djIdFinal) {
            const velho = djs.find(d => d.id === slot.dj_id)
            const novo  = djs.find(d => d.id === djIdFinal)
            const nomeV = velho?.nome_artistico || velho?.nome || slot.dj_nome || 'Sem DJ'
            const nomeN = novo?.nome_artistico  || novo?.nome  || form.dj_externo || djConvidadoQuery || 'Sem DJ'
            await registarHistorico(slot.id, 'dj', `DJ: ${nomeV} → ${nomeN}`)
          }
        } catch {}
      } else {
        await agendaApi.criar(payload)
      }
      onGuardado()
      onFechar()
    } catch (e) {
      console.error('FormSlot guardar erro:', e)
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const apagar = async () => {
    if (!confirm('Apagar esta atuação?')) return
    setLoading(true)
    try {
      const backup = { ...slot }
      await agendaApi.apagar(slot.id)
      pushUndo({
        label: `Atuação apagada (${backup.data ?? ''})`,
        undo: async () => { await agendaApi.criar(backup); onGuardado() },
      })
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const confirmar = async () => {
    setLoading(true)
    try {
      await agendaApi.mudarEstado(slot.id, 'confirmado')
      await registarHistorico(slot.id, 'estado', `${form.estado} → confirmado`)
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
      setLoading(false)
    }
  }

  const confirmarAceite = async () => {
    setLoading(true)
    try {
      await agendaApi.mudarEstado(slot.id, 'pré-confirmado')
      await registarHistorico(slot.id, 'estado', `${form.estado} → pré-confirmado`)
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
      setLoading(false)
    }
  }

  const toggleSemEfeito = async () => {
    setLoading(true)
    try {
      const novoEstado = form.estado === 'sem_efeito' ? 'confirmado' : 'sem_efeito'
      await agendaApi.mudarEstado(slot.id, novoEstado)
      await registarHistorico(slot.id, 'estado', `${form.estado} → ${novoEstado}`)
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
      setLoading(false)
    }
  }

  const resetar = async () => {
    const djAntes = djs.find(d => d.id === form.dj_id)
    const nomeAntes = djAntes?.nome_artistico || djAntes?.nome || form.dj_externo || 'Sem DJ'
    if (!confirm(`Limpar este slot? O DJ (${nomeAntes}), estado e valores serão removidos — a posição fica disponível para nova atribuição.`)) return
    setLoading(true)
    try {
      await agendaApi.actualizar(slot.id, {
        dj_id: null, dj_nome: null, estado: null,
        valor: null, margem: null, tipo_slot: null,
        evento: null, notas: null,
      })
      try { await registarHistorico(slot.id, 'estado', `Reset: slot limpo (era ${nomeAntes})`) } catch {}
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const abrirTroca = () => {
    setTrocaDjId(''); setTrocaMotivo(''); setTrocaErro(null)
    setTipoTroca('substituir'); setTrocaDataId(''); setTrocaSlots([])
    setTrocaAberta(true)
  }

  const executarTroca = async () => {
    if (!trocaDjId) { setTrocaErro('Escolhe o novo DJ.'); return }
    if (tipoTroca === 'troca_direta' && !trocaDataId) { setTrocaErro('Escolhe a data para trocar.'); return }
    setTrocaLoading(true); setTrocaErro(null)
    try {
      const djEntra = djs.find(d => d.id === trocaDjId)
      const djSai   = djs.find(d => d.id === form.dj_id) ?? null
      const espacoNome = slot.espaco_nome
        ?? espacos.find(e => e.id === slot.espaco_id)?.nome?.trim()
        ?? ''
      const djAntes     = slot.dj_id ?? null
      const estadoAntes = slot.estado ?? null

      if (tipoTroca === 'troca_direta') {
        const slotB = trocaSlots.find(s => s.id === trocaDataId)
        if (!slotB) { setTrocaErro('Data inválida.'); setTrocaLoading(false); return }
        await trocarDJDireto({
          slotA: slot, slotB,
          djA: djSai, djB: djEntra,
          espacoNome, motivo: trocaMotivo.trim() || null,
        })
        pushUndo({
          label: 'Troca direta de DJ',
          undo: async () => {
            await agendaApi.atribuirDJ(slot.id, djAntes)
            if (estadoAntes) await agendaApi.mudarEstado(slot.id, estadoAntes)
            await agendaApi.atribuirDJ(slotB.id, djEntra?.id ?? null)
            onGuardado()
          },
        })
      } else {
        await trocarDJ({
          slot, espacoNome, djSai, djEntra,
          motivo: trocaMotivo.trim() || null, origem: 'admin',
        })
        pushUndo({
          label: 'Troca de DJ',
          undo: async () => {
            await agendaApi.atribuirDJ(slot.id, djAntes)
            if (estadoAntes) await agendaApi.mudarEstado(slot.id, estadoAntes)
            onGuardado()
          },
        })
      }
      setTrocaAberta(false)
      onGuardado()
      onFechar()
    } catch (e) {
      setTrocaErro(e.message)
    } finally {
      setTrocaLoading(false)
    }
  }

  // Candidatos à troca: DJs activos, excluindo o actual
  const candidatosTroca = djs
    .filter(d => ['activo', 'activo_ext'].includes(d.estado) && d.id !== form.dj_id)
    .sort((a, b) => (a.nome_artistico || a.nome || '').localeCompare(b.nome_artistico || b.nome || ''))

  const djActual = djs.find((d) => d.id === form.dj_id)
  const espacoActual = espacos.find((e) => e.id === form.espaco_id)
  const djsActivos = djs.filter((d) => d.estado !== 'banido')

  return (
    <>
    <Modal aberto={aberto} onFechar={onFechar} titulo={slot?.id ? 'Atuação' : 'Nova Atuação'} largura={simplificado ? 'max-w-2xl' : 'max-w-6xl'}>
      <form onSubmit={guardar} noValidate>
        <div className="px-6 py-5 flex flex-col gap-4">
          {erro && <Alerta tipo="erro" mensagem={erro} />}
          {conflitoCrossEspaco && (
            <Alerta tipo={overrideRegras ? 'aviso' : 'erro'} mensagem={`${overrideRegras ? '⚠️' : '🚫'} ${conflitoCrossEspaco}`} />
          )}
          {bloqueioIndisponivel && (
            <Alerta tipo={overrideRegras ? 'aviso' : 'erro'} mensagem={`${overrideRegras ? '⚠️' : '🚫'} ${bloqueioIndisponivel}`} />
          )}
          {conflito && verificacaoFeita && !bloqueioIndisponivel && !conflitoCrossEspaco && !avisoOptIn && conflitos.length === 0 && (
            <Alerta tipo={overrideRegras ? 'aviso' : 'erro'} mensagem={`${overrideRegras ? '⚠️' : '🚫'} Conflito detectado nesta data`} />
          )}
          {conflitos.length > 0 && (
            <div className="flex flex-col gap-1">
              {conflitos.map((c, i) => <Alerta key={i} tipo={overrideRegras ? 'aviso' : 'erro'} mensagem={`${overrideRegras ? '⚠️' : '🚫'} ${c}`} />)}
            </div>
          )}
          {(conflitoCrossEspaco || bloqueioIndisponivel || conflito || conflitos.length > 0) && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overrideRegras}
                onChange={e => setOverrideRegras(e.target.checked)}
                className="w-3.5 h-3.5 accent-amber-400 cursor-pointer"
              />
              <span className="text-xs text-amber-400/70">Ignorar validações (registo manual)</span>
            </label>
          )}
          {avisoOptIn && (
            <Alerta tipo="aviso" mensagem={`⚠️ ${avisoOptIn}`} />
          )}
          {avisoMeta && (
            <Alerta tipo="aviso" mensagem={`⚠️ ${avisoMeta}`} />
          )}

          {/* Cabeçalho de contexto — sempre visível */}
          {slot && (
            <div className="bg-surface-2 border border-border rounded-lg px-4 py-3 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-accent">
                  {djActual?.nome_artistico || djActual?.nome || form.dj_externo || <span className="italic text-accent-subtle">Sem DJ</span>}
                </p>
                <p className="text-xs text-accent-muted mt-0.5">
                  {espacoActual?.nome ?? '—'}
                  {' · '}
                  {form.data ? formatarData(form.data) : '—'}
                  {' · '}
                  {formatarHora(form.hora_inicio)}–{formatarHora(form.hora_fim)}
                </p>
                {!simplificado && form.valor !== '' && form.valor !== null && (
                  <p className="text-xs text-accent-muted mt-0.5">
                    {formatarEuro(Number(form.valor))}
                  </p>
                )}
              </div>
              <Badge
                variante={
                  form.estado === 'confirmado' ? 'confirmado' :
                  form.estado === 'cancelado'  ? 'cancelado'  :
                  form.estado === 'sem_efeito' ? 'default'    :
                  form.estado === 'a_pedido'   ? 'default'    :
                  'proposta'
                }
                className={form.estado === 'a_pedido' ? 'border-violet-400/40 bg-violet-400/15 text-violet-300' : ''}
              >
                {ESTADO_OPCOES.find((e) => e.value === form.estado)?.label ?? form.estado}
              </Badge>
            </div>
          )}

          {/* ── Abas — só quando existe slot ── */}
          {slot && (
            <div className="flex gap-0 border-b border-border -mx-6 px-6">
              {['Atuação', 'Notas & Avaliação', 'Contas', 'Histórico', ...(slot.estado_pagamento && slot.estado_pagamento !== 'pendente' ? ['Faturação'] : [])].map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAba(i)}
                  className={clsx(
                    'px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                    aba === i
                      ? 'border-white/60 text-accent'
                      : 'border-transparent text-accent-subtle hover:text-accent-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── Aba 1: Atuação (formulário existente) ── */}
          {(!slot || aba === 0) && (simplificado ? (
            /* ── MODO SIMPLIFICADO ── */
            <>
              {/* Horário */}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Início" value={form.hora_inicio} onChange={set('hora_inicio')} type="time" required />
                <Input label="Fim" value={form.hora_fim} onChange={set('hora_fim')} type="time" required />
              </div>

              {/* Subtipo DJ — auto-preenche Valor e Categoria */}
              {!form.dj_externo?.trim() && subtiposDisp.length > 0 && (
                <Select label="Subtipo DJ" value={form.subtipo_key} onChange={e => setSubtipoKey(e.target.value)}>
                  <option value="">— selecionar subtipo —</option>
                  {subtiposDisp.map(s => (
                    <option key={s.key} value={s.key}>{s.label}{s.total > 0 ? ` · ${s.total}€` : ''}</option>
                  ))}
                </Select>
              )}

              <div className="flex flex-col gap-1.5">
                <DJCombobox
                  label="DJ da base"
                  value={form.dj_id}
                  onChange={(id) => { setForm((f) => ({ ...f, dj_id: id, dj_externo: '' })); setNovoDJCriado(null) }}
                  djs={djsActivos}
                  onCriado={(dj) => setNovoDJCriado(dj)}
                  placeholder="Pesquisar DJ…"
                />
                {novoDJCriado && <NovoDJLink dj={novoDJCriado} onDismiss={() => setNovoDJCriado(null)} />}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[10px] text-accent-subtle uppercase tracking-wider">ou</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <DJCombobox
                  label="DJ convidado / externo"
                  value={form.dj_id}
                  onChange={(id) => { setForm((f) => ({ ...f, dj_id: id, dj_externo: '' })); setNovoDJCriado(null); setDjConvidadoQuery('') }}
                  djs={djsActivos.filter((d) => (d.categorias ?? []).some((c) => [3,4,5].includes(c)) || true)}
                  onCriado={(dj) => setNovoDJCriado(dj)}
                  onlyConvidados
                  onQueryChange={setDjConvidadoQuery}
                  placeholder="Pesquisar ou criar DJ convidado…"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {!form.dj_externo?.trim() && (
                  <Select label="Categoria DJ" value={form.tipo_slot} onChange={set('tipo_slot')}>
                    <option value="">—</option>
                    {TIPO_SLOT_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                )}
                <Select label="Estado" value={form.estado} onChange={set('estado')} className={form.dj_externo?.trim() ? 'col-span-2' : ''}>
                  {ESTADO_OPCOES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={eventoAutoLink ? 'Evento (preenchido automaticamente 🔗)' : 'Evento (opcional)'}
                    value={form.evento}
                    onChange={(e) => { setEventoAutoLink(false); set('evento')(e) }}
                    placeholder="Ex: Halloween Party, Aniversário do clube..."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEventoFormAberto(true)}
                  title="Criar evento associado"
                  className="shrink-0 mb-0.5 flex items-center gap-1 px-2.5 py-2 rounded border border-border bg-surface-2 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors text-[11px]"
                >
                  <CalendarPlus size={13} />
                </button>
              </div>

              <Textarea
                label="Observações"
                value={form.notas}
                onChange={set('notas')}
                placeholder="Notas sobre a atuação, rider, condições especiais..."
              />
            </>
          ) : (
            /* ── MODO COMPLETO ── */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <DJCombobox
                    label="DJ da base"
                    value={form.dj_id}
                    onChange={(id) => { setForm((f) => ({ ...f, dj_id: id, dj_externo: '' })); setNovoDJCriado(null) }}
                    djs={djsActivos}
                    onCriado={(dj) => setNovoDJCriado(dj)}
                    placeholder="Pesquisar DJ…"
                  />
                  {novoDJCriado && <NovoDJLink dj={novoDJCriado} onDismiss={() => setNovoDJCriado(null)} />}
                  <DJCombobox
                    label="ou DJ convidado"
                    value={form.dj_id}
                    onChange={(id) => { setForm((f) => ({ ...f, dj_id: id, dj_externo: '' })); setNovoDJCriado(null) }}
                    djs={djsActivos}
                    onCriado={(dj) => setNovoDJCriado(dj)}
                    onlyConvidados
                    placeholder="Pesquisar ou criar DJ convidado…"
                  />
                </div>
                <Select label="Cliente" value={form.espaco_id} onChange={set('espaco_id')}>
                  <option value="">—</option>
                  {espacos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input label="Data" value={form.data} onChange={set('data')} type="date" required className="col-span-1" />
                <Input label="Início" value={form.hora_inicio} onChange={set('hora_inicio')} type="time" required />
                <Input label="Fim" value={form.hora_fim} onChange={set('hora_fim')} type="time" required />
              </div>

              {/* Subtipo DJ — auto-preenche Valor e Categoria */}
              {!form.dj_externo?.trim() && subtiposDisp.length > 0 && (
                <Select label="Subtipo DJ" value={form.subtipo_key} onChange={e => setSubtipoKey(e.target.value)}>
                  <option value="">— selecionar subtipo —</option>
                  {subtiposDisp.map(s => (
                    <option key={s.key} value={s.key}>{s.label}{s.total > 0 ? ` · ${s.total}€` : ''}</option>
                  ))}
                </Select>
              )}

              {/* Margem — só visível para DJ convidado */}
              {form.dj_externo?.trim() && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2 rounded-lg border border-border/60">
                  <Input
                    label="Margem sobre DJ convidado (€)"
                    value={form.margem}
                    onChange={set('margem')}
                    type="number" min={0} step={0.01}
                    placeholder="0,00"
                  />
                  <div className="flex flex-col justify-end pb-1">
                    {form.valor !== '' && form.margem !== '' && (
                      <p className="text-xs text-accent-muted">
                        DJ recebe:{' '}
                        <span className="font-semibold text-accent">
                          {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
                            .format(Number(form.valor) - Number(form.margem))}
                        </span>
                        <span className="ml-2 text-accent-subtle">
                          (margem: {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(form.margem))})
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {!form.dj_externo?.trim() && (
                  <Select label="Categoria DJ" value={form.tipo_slot} onChange={set('tipo_slot')}>
                    <option value="">—</option>
                    {TIPO_SLOT_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                )}
                <Select label="Estado" value={form.estado} onChange={set('estado')} className={form.dj_externo?.trim() ? 'col-span-2' : ''}>
                  {ESTADO_OPCOES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Evento (opcional)"
                    value={form.evento}
                    onChange={set('evento')}
                    placeholder="Ex: Halloween Party, Aniversário do clube, NYE..."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEventoFormAberto(true)}
                  title="Criar evento associado"
                  className="shrink-0 mb-0.5 flex items-center gap-1 px-2.5 py-2 rounded border border-border bg-surface-2 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors text-[11px]"
                >
                  <CalendarPlus size={13} />
                </button>
              </div>

              <Textarea
                label="Observações"
                value={form.notas}
                onChange={set('notas')}
                placeholder="Notas sobre a atuação, rider, condições especiais..."
              />
            </>
          ))}

          {/* ── Aba 2: Notas & Avaliação ── */}
          {slot && aba === 1 && (
            <div className="flex flex-col gap-4">
              {/* Nota do gestor */}
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-accent-subtle">Nota do gestor</p>
                <p className="text-sm text-accent min-h-[40px] rounded-lg bg-surface-2 border border-border px-3 py-2 whitespace-pre-wrap">
                  {avaliacao?.comentario?.trim() ? avaliacao.comentario : <span className="text-accent-subtle italic">—</span>}
                </p>
              </div>

              {/* Nota do DJ */}
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-accent-subtle">Nota do DJ</p>
                <p className="text-sm text-accent min-h-[40px] rounded-lg bg-surface-2 border border-border px-3 py-2 whitespace-pre-wrap">
                  {avaliacao?.notas_dj?.trim() ? avaliacao.notas_dj : <span className="text-accent-subtle italic">—</span>}
                </p>
              </div>

              {/* Observações */}
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-accent-subtle">Observações</p>
                <p className="text-sm text-accent min-h-[40px] rounded-lg bg-surface-2 border border-border px-3 py-2 whitespace-pre-wrap">
                  {form.notas?.trim() ? form.notas : <span className="text-accent-subtle italic">—</span>}
                </p>
              </div>

              {/* Avaliação */}
              {avaliacao ? (
                <div className="flex flex-col gap-2 rounded-lg bg-surface-2 border border-border px-3 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-accent-subtle mb-1">Avaliação gestor</p>
                  {[
                    { label: 'Artística', val: avaliacao.nota_artistica },
                    { label: 'Assiduidade', val: avaliacao.nota_assiduidade },
                    { label: 'Profissionalismo', val: avaliacao.nota_profissionalismo },
                    { label: 'Adaptação', val: avaliacao.nota_adaptacao },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-accent-subtle">{label}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={10} className={i < (val ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-white/15'} />
                          ))}
                        </div>
                        <span className="text-xs text-accent-subtle w-4 text-right">{val ?? '—'}</span>
                      </div>
                    </div>
                  ))}
                  <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                    <span className="text-xs font-medium text-accent-muted">Total</span>
                    <span className="text-sm font-bold text-accent">
                      {[avaliacao.nota_artistica, avaliacao.nota_assiduidade, avaliacao.nota_profissionalismo, avaliacao.nota_adaptacao]
                        .filter(v => v != null).reduce((a, b) => a + b, 0)} / 20
                    </span>
                  </div>
                  {avaliacao.interesse != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-accent-subtle">Interesse</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={10} className={i < (avaliacao.interesse ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-white/15'} />
                          ))}
                        </div>
                        <span className="text-xs text-accent-subtle w-4 text-right">{avaliacao.interesse}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-accent-subtle italic text-center py-2">Sem avaliação registada</p>
              )}

              {/* Auto-avaliação do DJ */}
              {avaliacao && [avaliacao.auto_nota_artistica, avaliacao.auto_nota_assiduidade, avaliacao.auto_nota_profissionalismo, avaliacao.auto_nota_adaptacao].some(v => v != null) && (
                <div className="flex flex-col gap-2 rounded-lg bg-surface-2 border border-border px-3 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-accent-subtle mb-1">Auto-avaliação DJ</p>
                  {[
                    { label: 'Artística', val: avaliacao.auto_nota_artistica },
                    { label: 'Assiduidade', val: avaliacao.auto_nota_assiduidade },
                    { label: 'Profissionalismo', val: avaliacao.auto_nota_profissionalismo },
                    { label: 'Adaptação', val: avaliacao.auto_nota_adaptacao },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-accent-subtle">{label}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={10} className={i < (val ?? 0) ? 'fill-blue-400 text-blue-400' : 'text-white/15'} />
                          ))}
                        </div>
                        <span className="text-xs text-accent-subtle w-4 text-right">{val ?? '—'}</span>
                      </div>
                    </div>
                  ))}
                  <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                    <span className="text-xs font-medium text-accent-muted">Total</span>
                    <span className="text-sm font-bold text-accent">
                      {[avaliacao.auto_nota_artistica, avaliacao.auto_nota_assiduidade, avaliacao.auto_nota_profissionalismo, avaliacao.auto_nota_adaptacao]
                        .filter(v => v != null).reduce((a, b) => a + b, 0)} / 20
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Aba 3: Contas ── */}
          {slot && aba === 2 && (() => {
            const totalHorasExtra = horasExtras
              .filter(h => h.estado === 'validado')
              .reduce((s, h) => s + (h.valor_total ?? 0), 0)
            const valorDJ    = form.valor    === '' ? 0 : Number(form.valor)    || 0
            const transporte = form.transporte === '' ? 0 : Number(form.transporte) || 0
            const extras     = form.extras     === '' ? 0 : Number(form.extras)     || 0
            const totalCusto = valorDJ + transporte + extras + totalHorasExtra
            const margem     = form.margem === '' ? 0 : Number(form.margem) || 0
            return (
              <div className="flex flex-col gap-5">
                {/* Resumo financeiro */}
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">Valores</p>
                  <div className="grid grid-cols-4 gap-3">
                    <Input label="Valor DJ (€)" value={form.valor}
                      onChange={set('valor')} type="number" min={0} step={0.01} placeholder="0" />
                    <Input label="Margem (€)" value={form.margem}
                      onChange={set('margem')} type="number" min={0} step={0.01} placeholder="0" />
                    <Input label="Transporte (€)" value={form.transporte}
                      onChange={set('transporte')} type="number" min={0} step={0.01} placeholder="0" />
                    <Input label="Extras (€)" value={form.extras}
                      onChange={set('extras')} type="number" min={0} step={0.01} placeholder="0" />
                  </div>
                  {/* Totais */}
                  <div className="rounded-lg bg-surface-2 border border-border px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs text-accent-subtle">
                      <span>Custo total (DJ + transporte + extras + horas extra)</span>
                      <span className="font-semibold text-accent">{formatarEuro(totalCusto)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-accent-subtle border-t border-border/50 pt-1.5 mt-0.5">
                      <span>Margem (lucro)</span>
                      <span className={clsx('font-semibold', margem > 0 ? 'text-status-confirmado' : 'text-accent')}>{formatarEuro(margem)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm border-t border-border/50 pt-2 mt-0.5">
                      <span className="font-semibold text-accent">Total cliente</span>
                      <span className="font-bold text-accent">{formatarEuro(totalCusto + margem)}</span>
                    </div>
                  </div>
                </div>

                {/* Horas extras */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">Horas extras</p>
                    <button type="button" onClick={() => setNovaHoraAberta(v => !v)}
                      className="flex items-center gap-1 text-[11px] text-accent-subtle hover:text-accent transition-colors">
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>

                  {novaHoraAberta && (
                    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 flex flex-col gap-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-3">
                          <Input label="Descrição" value={novaHora.descricao}
                            onChange={e => setNovaHora(h => ({ ...h, descricao: e.target.value }))}
                            placeholder="Ex: 2h extra NYE" />
                        </div>
                        <Input label="Horas" value={novaHora.horas}
                          onChange={e => setNovaHora(h => ({ ...h, horas: e.target.value }))}
                          type="number" min={0} step={0.5} placeholder="0" />
                        <Input label="€/hora" value={novaHora.valor_hora}
                          onChange={e => setNovaHora(h => ({ ...h, valor_hora: e.target.value }))}
                          type="number" min={0} step={1} placeholder={safeParse(config.contas_valor_hora_extra, 30)} />
                        <div className="flex items-end">
                          <div className="w-full rounded bg-surface-3 border border-border px-3 py-2 text-sm text-accent-muted text-center">
                            {formatarEuro((Number(novaHora.horas)||0) * (Number(novaHora.valor_hora) || Number(safeParse(config.contas_valor_hora_extra, 30))))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variante="ghost" tamanho="sm"
                          onClick={() => { setNovaHoraAberta(false); setNovaHora({ descricao: '', horas: '', valor_hora: '' }) }}>
                          Cancelar
                        </Button>
                        <Button type="button" variante="secondary" tamanho="sm" loading={novaHoraLoading}
                          disabled={!novaHora.horas || Number(novaHora.horas) <= 0}
                          onClick={async () => {
                            setNovaHoraLoading(true)
                            try {
                              const vh = Number(novaHora.valor_hora) || Number(safeParse(config.contas_valor_hora_extra, 30))
                              const nova = await agendaHorasExtraApi.criar({
                                agendaId: slot.id,
                                descricao: novaHora.descricao,
                                horas: novaHora.horas,
                                valorHora: vh,
                              })
                              setHorasExtras(hs => [...hs, nova])
                              setNovaHoraAberta(false)
                              setNovaHora({ descricao: '', horas: '', valor_hora: '' })
                            } catch (err) {
                              console.error(err)
                            } finally {
                              setNovaHoraLoading(false)
                            }
                          }}>
                          Guardar hora extra
                        </Button>
                      </div>
                    </div>
                  )}

                  {horasExtraLoading ? (
                    <p className="text-xs text-accent-subtle py-2">A carregar…</p>
                  ) : horasExtras.length === 0 ? (
                    <p className="text-xs text-accent-subtle italic py-1">Sem horas extras registadas.</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {horasExtras.map(h => (
                        <div key={h.id} className="flex items-center gap-2 rounded bg-surface-2 border border-border px-3 py-2">
                          <Clock size={12} className="text-accent-subtle shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-accent">{h.descricao || `${h.horas}h extra`}</span>
                            <span className="text-[10px] text-accent-subtle ml-2">{h.horas}h × {formatarEuro(h.valor_hora)} = {formatarEuro(h.valor_total)}</span>
                          </div>
                          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium',
                            h.estado === 'validado'  ? 'bg-status-confirmado/15 text-status-confirmado' :
                            h.estado === 'recusado'  ? 'bg-red-500/15 text-red-400' :
                            'bg-amber-400/15 text-amber-400'
                          )}>
                            {h.estado === 'validado' ? '✓ validado' : h.estado === 'recusado' ? '✗ recusado' : '⏳ pendente'}
                          </span>
                          {h.estado === 'pendente' && (
                            <button type="button" title="Apagar"
                              onClick={async () => {
                                try {
                                  await agendaHorasExtraApi.apagar(h.id)
                                  setHorasExtras(hs => hs.filter(x => x.id !== h.id))
                                } catch (err) { console.error(err) }
                              }}
                              className="text-accent-subtle hover:text-red-400 transition-colors ml-1">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pagamento */}
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">Pagamento</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Estado" value={form.estado_pagamento} onChange={set('estado_pagamento')}>
                      {ESTADO_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                    <Select label="Forma" value={form.forma_pagamento} onChange={set('forma_pagamento')}>
                      <option value="">—</option>
                      {FORMA_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </div>
                  <Textarea label="Notas financeiras" value={form.notas_contas}
                    onChange={set('notas_contas')} placeholder="Referência de transferência, acordo especial…" />
                </div>
              </div>
            )
          })()}

          {/* ── Aba 5: Faturação (read-only) ── */}
          {slot && aba === 4 && slot.estado_pagamento && slot.estado_pagamento !== 'pendente' && (
            <div className="flex flex-col gap-4 py-1">
              {/* Estado de pagamento */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-accent-subtle font-semibold uppercase tracking-wider">Estado de Pagamento</span>
                <span className={clsx(
                  'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  slot.estado_pagamento === 'pago'                    ? 'bg-green-500/15 text-green-300' :
                  slot.estado_pagamento === 'em_analise'              ? 'bg-orange-500/15 text-orange-300' :
                  slot.estado_pagamento === 'em_pagamento'            ? 'bg-blue-400/15 text-blue-300' :
                  slot.estado_pagamento === 'a_pagamento'             ? 'bg-amber-400/15 text-amber-300' :
                  slot.estado_pagamento === 'pendente_regularizacao'  ? 'bg-red-500/15 text-red-300' :
                  'bg-white/8 text-white/50'
                )}>
                  {{
                    pendente:               'Pendente',
                    a_pagamento:            'A Pagamento',
                    em_analise:             'Em Análise',
                    aprovada_pagamento:     'Aprovada',
                    em_pagamento:           'Em Pagamento',
                    pago:                   'Pago',
                    pendente_regularizacao: 'Pend. Regularização',
                  }[slot.estado_pagamento] ?? slot.estado_pagamento}
                </span>
              </div>

              {slot.motivo_discordancia && (
                <div className="bg-surface-2 border border-border rounded-lg px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle mb-1">Motivo do DJ</p>
                  <p className="text-xs text-accent-muted leading-relaxed">{slot.motivo_discordancia}</p>
                </div>
              )}

              {slot.resposta_admin && (
                <div className="bg-surface-2 border border-border rounded-lg px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle mb-1">Resposta Admin</p>
                  <p className="text-xs text-accent-muted leading-relaxed">{slot.resposta_admin}</p>
                </div>
              )}

              <p className="text-[11px] text-accent-subtle italic">
                Para gerir este pagamento, acede à página{' '}
                <a href="/pagamentos" className="text-accent underline underline-offset-2 hover:text-white transition-colors">Pagamentos</a>.
              </p>
            </div>
          )}

          {/* ── Aba 4: Histórico ── */}
          {slot && aba === 3 && (
            <div className="flex flex-col gap-0 py-1">
              {historico.length === 0 ? (
                <p className="text-center text-xs text-accent-subtle py-8">Sem histórico registado.</p>
              ) : (
                historico.map((h, i) => {
                  const icone = h.tipo === 'estado' ? '→' : h.tipo === 'dj' ? '⇄' : h.tipo === 'troca' ? '⇄' : '·'
                  const cor   = h.tipo === 'estado' ? 'text-amber-400' : h.tipo === 'troca' ? 'text-[#fc03c6]' : 'text-sky-400'
                  const dt    = new Date(h.created_at)
                  const label = dt.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={h.id} className={clsx('flex items-start gap-3 px-1 py-2.5', i > 0 && 'border-t border-border/30')}>
                      <div className={clsx('mt-0.5 w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center shrink-0 text-[10px] font-bold', cor)}>
                        {icone}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-accent leading-snug">{h.descricao}</p>
                        <p className="text-[10px] text-accent-subtle mt-0.5">{label}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-border bg-surface-1 flex items-center justify-between">
          <div className="flex gap-2">
            {slot?.id && (
              <Button type="button" variante="danger" tamanho="sm" onClick={apagar} loading={loading}>
                Apagar
              </Button>
            )}
            {slot?.id && (
              <Button
                type="button" variante="ghost" tamanho="sm" onClick={resetar} loading={loading}
                className="border border-border/50 text-accent-subtle hover:text-orange-400 hover:border-orange-400/40 transition-colors inline-flex items-center gap-1"
                title="Limpar slot: remove DJ, estado e valores"
              >
                <RotateCcw size={13} /> Limpar
              </Button>
            )}
            {slot?.id && form.estado === 'proposta' && (
              <Button
                type="button" variante="ghost" tamanho="sm" onClick={confirmar} loading={loading}
                className="text-status-confirmado/80 hover:text-status-confirmado"
              >
                Confirmar
              </Button>
            )}
            {slot?.id && form.estado === 'aceite' && (
              <Button
                type="button" variante="ghost" tamanho="sm" onClick={confirmarAceite} loading={loading}
                className="text-teal-400/80 hover:text-teal-400"
              >
                Enviar ao Manager
              </Button>
            )}
            {slot?.id && (
              <Button
                type="button" variante="ghost" tamanho="sm" onClick={toggleSemEfeito} loading={loading}
                className={clsx(
                  'border transition-colors',
                  form.estado === 'sem_efeito'
                    ? 'border-white/20 text-accent bg-surface-3'
                    : 'border-border/50 text-accent-subtle hover:text-accent hover:border-white/20'
                )}
              >
                {form.estado === 'sem_efeito' ? '↩ Repor' : 'Sem Efeito'}
              </Button>
            )}
            {slot?.id && form.dj_id && (
              <Button
                type="button" variante="ghost" tamanho="sm" onClick={abrirTroca}
                className="border border-border/50 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeftRight size={13} /> Alterar
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end">
            {erro && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5 w-full text-left">
                {erro}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variante="ghost" tamanho="sm" onClick={onFechar}>Cancelar</Button>
              <Button
                type="submit"
                variante="primary"
                tamanho="sm"
                loading={loading}
                disabled={!overrideRegras && (!!conflitoCrossEspaco || !!bloqueioIndisponivel || conflito || conflitos.length > 0)}
                title={
                  !overrideRegras && conflitoCrossEspaco ? 'Resolve o conflito de Cliente antes de guardar'
                  : !overrideRegras && bloqueioIndisponivel ? 'DJ indisponível nesta data'
                  : !overrideRegras && (conflito || conflitos.length > 0) ? 'Existe conflito de agenda — activa "Ignorar validações" para forçar'
                  : undefined
                }
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Modal>

    {/* FormEvento para criar evento a partir do slot */}
    <FormEvento
      aberto={eventoFormAberto}
      evento={eventoFormAberto ? { data_evento: form.data, espaco_id: form.espaco_id || '' } : null}
      onFechar={() => setEventoFormAberto(false)}
      onGuardado={() => setEventoFormAberto(false)}
    />

    {/* Modal de troca de DJ */}
    <Modal aberto={trocaAberta} onFechar={() => setTrocaAberta(false)} titulo="Alterar DJ" largura="max-w-sm">
      <div className="p-5 flex flex-col gap-4">

        {/* Toggle tipo */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {[['substituir', 'Substituição'], ['troca_direta', 'Troca direta']].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => { setTipoTroca(val); setTrocaDataId(''); setTrocaSlots([]) }}
              className={clsx(
                'flex-1 py-1.5 text-xs font-medium transition-colors',
                tipoTroca === val ? 'bg-surface-3 text-accent' : 'text-accent-subtle hover:text-accent'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-xs text-accent-subtle -mt-1">
          {tipoTroca === 'substituir'
            ? <>O DJ atual sai desta data e o novo DJ é escalado em estado <b>Proposta</b>. Ambos recebem WhatsApp automaticamente.</>
            : <>Os dois DJs trocam de data entre si. Ambos ficam em estado <b>Proposta</b> e recebem WhatsApp com a nova data.</>
          }
        </p>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-accent-subtle mb-1">
            {tipoTroca === 'substituir' ? 'Novo DJ' : 'DJ a trocar'}
          </label>
          <Select value={trocaDjId} onChange={(e) => { setTrocaDjId(e.target.value); setTrocaDataId('') }}>
            <option value="">— escolher —</option>
            {candidatosTroca.map(d => (
              <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
            ))}
          </Select>
        </div>

        {tipoTroca === 'troca_direta' && trocaDjId && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-accent-subtle mb-1">
              Data a trocar {trocaSlotsLoading && <span className="normal-case font-normal">a carregar…</span>}
            </label>
            <Select value={trocaDataId} onChange={(e) => setTrocaDataId(e.target.value)} disabled={trocaSlotsLoading}>
              <option value="">— escolher data —</option>
              {trocaSlots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.data} · {s.espacos?.nome ?? '?'}{s.hora_inicio ? ` · ${s.hora_inicio.slice(0, 5)}` : ''}
                </option>
              ))}
            </Select>
            {!trocaSlotsLoading && trocaSlots.length === 0 && (
              <p className="text-[11px] text-accent-subtle mt-1">Este DJ não tem datas futuras disponíveis.</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-accent-subtle mb-1">Motivo (opcional)</label>
          <Textarea rows={2} value={trocaMotivo} onChange={(e) => setTrocaMotivo(e.target.value)}
            placeholder="Motivo da alteração…" />
        </div>

        {trocaErro && <Alerta tipo="erro" mensagem={trocaErro} />}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variante="ghost" tamanho="sm" onClick={() => setTrocaAberta(false)}>Cancelar</Button>
          <Button type="button" variante="primary" tamanho="sm" onClick={executarTroca} loading={trocaLoading}
            disabled={!trocaDjId || (tipoTroca === 'troca_direta' && !trocaDataId)}>
            Confirmar {tipoTroca === 'troca_direta' ? 'troca' : 'alteração'}
          </Button>
        </div>
      </div>
    </Modal>
    </>
  )
}
