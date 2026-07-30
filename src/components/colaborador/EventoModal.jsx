import { useState, useEffect, useRef } from 'react'
import { X, StickyNote, Boxes, Save, MapPin, Check, Loader2, AlertCircle, PenLine, ListChecks, Lock, FileText, Plus, Trash2, Clock, Flag, Camera, ImageIcon, Printer, CheckCircle2 } from 'lucide-react'
import { useAssinaturaDia } from '@/hooks/useAssinaturaDia'
import { clsx } from 'clsx'
import { Badge } from '@/components/ui/Badge'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { supabase } from '@/lib/supabase'
import { usePresenca, podeAssinar, presencaAtrasada, TOLERANCIA_MIN } from '@/hooks/usePresenca'
import { useColaboradorStore } from '@/store'
import { PrintModal } from '@/components/shared/PrintModal'
import { FolhaEvento } from '@/components/shared/FolhaEvento'
import { labelEstado } from '@/utils/formatacao'
import { corTecnico } from '@/utils/tecnicoColor'
import { hhmm, dataLonga, dataCompleta } from './format'

const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

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

export function EventoModal({ evento, mapaTecnicos = {}, onFechar, tarefas = [] }) {
  const [aba, setAba]             = useState('detalhes')
  const [dir, setDir]             = useState('right')
  const [notas, setNotas]         = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)
  const [erro, setErro]           = useState(null)
  const touchX = useRef(null)
  const [eventoListas,  setEventoListas]  = useState([])
  const [eventoChecks,  setEventoChecks]  = useState(new Set())
  const [clSubmetidas,  setClSubmetidas]  = useState(new Set()) // Set de checklist_id já guardados
  const [clGuardando,   setClGuardando]   = useState(new Set()) // Set de checklist_id a guardar agora
  const [equipItems,    setEquipItems]    = useState([])
  const [equipEvento,   setEquipEvento]   = useState([])
  const [equipInput,    setEquipInput]    = useState('')
  const [equipAdding,   setEquipAdding]   = useState(false)
  const [execucaoNotas,  setExecucaoNotas]  = useState('')
  const [execucaoSaving, setExecucaoSaving] = useState(false)
  const [feedbackId,     setFeedbackId]     = useState(null)
  const [feedbackFotos,  setFeedbackFotos]  = useState([])
  const [fotoUploading,  setFotoUploading]  = useState(false)
  const [faseLocal,      setFaseLocal]      = useState(evento.fase || 'criacao')
  const [printEvento,    setPrintEvento]    = useState(false)
  const [assinEvento,    setAssinEvento]    = useState({
    assinatura_lmd_at: evento.assinatura_lmd_at ?? null,
    assinatura_in_at:  evento.assinatura_in_at  ?? null,
    assinatura_out_at: evento.assinatura_out_at ?? null,
  })
  const [assinEvSaving,  setAssinEvSaving]  = useState({})
  const [concluindoFase, setConcluindoFase] = useState(false)
  const [carros,         setCarros]         = useState([])
  const [eventoCarros,   setEventoCarros]   = useState({ carro_id: '', condutor_id: '', km_saida: '', km_chegada: '' })
  const [veiculoSaving,  setVeiculoSaving]  = useState(false)
  const [veiculoSaved,   setVeiculoSaved]   = useState(false)
  const [execucaoSaved,  setExecucaoSaved]  = useState(false)
  const [equipEventoChecks,   setEquipEventoChecks]   = useState(new Set())
  const [equipConfirmadoEm,   setEquipConfirmadoEm]   = useState(null)

  // ── Identidade do colaborador logado ──
  const colaborador = useColaboradorStore(s => s.colaborador)

  // Só pode ver/editar as suas próprias notas se estiver atribuído ao evento
  const isAtribuido = colaborador && (
    evento.todos_tecnicos === true ||
    (evento._tecnicosIds ?? []).includes(colaborador.id) ||
    evento.tecnico_id === colaborador.id
  )
  // Só o responsável principal pode assinar presença
  const isResponsavel = evento.todos_tecnicos === true || colaborador?.id === evento.tecnico_id
  const isLmd = evento.tipo === 'Apoio LMD'

  // ── Assinatura de início/fim de evento ──
  const { proxima: proximaAssin, registar: registarAssin, loading: assinLoading, feitas: feitasAssin, tiposFeitos: tiposAssinFeitos } = useAssinaturaDia(colaborador?.id ?? null, evento.id)
  const [assinandoEvento, setAssinandoEvento] = useState(false)
  const mostrarInEvento = !assinLoading && proximaAssin?.tipo === 'in_evento' && proximaAssin?.eventoId === evento.id

  const assinarEvento = async (tipo) => {
    setAssinandoEvento(true)
    await registarAssin(tipo, { eventoId: evento.id })
    setAssinandoEvento(false)
  }

  // ── Assinatura de presença do técnico (GPS) ──
  const pres = usePresenca({ kind: 'tecnico', refId: evento.id, ownerId: colaborador?.id ?? null, signedBy: 'tecnico' })
  const [aConfirmarPres, setConfirmarPres] = useState(false)
  const presDisponivel = podeAssinar(evento.data_evento, evento.hora_inicio)
  const presAtrasada = presencaAtrasada(pres.presenca, evento.data_evento, evento.hora_inicio)

  // Quando Marcar Presença (GPS) é assinado, auto-regista IN-Work
  useEffect(() => {
    if (pres.status === 'signed' && !assinEvento.assinatura_lmd_at) {
      registarAssinEvento('assinatura_lmd_at')
    }
  }, [pres.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Busca timestamps de assinatura frescos da BD — o evento prop pode estar stale
  useEffect(() => {
    if (!evento?.id) return
    let activo = true
    supabase.from('supa_eventos')
      .select('assinatura_lmd_at, assinatura_in_at, assinatura_out_at, equip_confirmado_em')
      .eq('id', evento.id)
      .single()
      .then(({ data }) => {
        if (!activo || !data) return
        setAssinEvento({
          assinatura_lmd_at: data.assinatura_lmd_at ?? null,
          assinatura_in_at:  data.assinatura_in_at  ?? null,
          assinatura_out_at: data.assinatura_out_at ?? null,
        })
        setEquipConfirmadoEm(data.equip_confirmado_em ?? null)
      })
    return () => { activo = false }
  }, [evento?.id])

  // Sincroniza assinaturas do hook (home) para supa_eventos quando ainda não estão registadas
  useEffect(() => {
    if (!tiposAssinFeitos?.length || !evento?.id) return
    if (evento.data_evento !== hojeISO()) return  // só sincroniza para eventos de hoje
    const inWork = tiposAssinFeitos.find(f => f.tipo === 'in_work')
    if (inWork && !assinEvento.assinatura_lmd_at) {
      const ts = inWork.registado_em
      supabase.from('supa_eventos').update({ assinatura_lmd_at: ts }).eq('id', evento.id)
        .then(({ error }) => { if (!error) setAssinEvento(prev => ({ ...prev, assinatura_lmd_at: ts })) })
    }
    const outWork = tiposAssinFeitos.find(f => f.tipo === 'out_work')
    if (outWork && !assinEvento.assinatura_out_at && assinEvento.assinatura_lmd_at) {
      const ts = outWork.registado_em
      supabase.from('supa_eventos').update({ assinatura_out_at: ts }).eq('id', evento.id)
        .then(({ error }) => { if (!error) setAssinEvento(prev => ({ ...prev, assinatura_out_at: ts })) })
    }
  }, [tiposAssinFeitos, evento?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('carros').select('id, marca, modelo, matricula').eq('ativo', true).order('marca')
      .then(({ data }) => setCarros(data ?? []))
  }, [])

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
        .select('checklist_id, checklists(id, nome, fase, checklist_itens(id, texto, ordem))')
        .eq('evento_id', evento.id),
      colaborador?.id ? supabase.from('checklist_checks')
        .select('checklist_item_id')
        .eq('evento_id', evento.id)
        .eq('tecnico_id', colaborador.id) : Promise.resolve({ data: [] }),
      colaborador?.id ? supabase.from('checklist_submissoes')
        .select('checklist_id')
        .eq('evento_id', evento.id)
        .eq('tecnico_id', colaborador.id) : Promise.resolve({ data: [] }),
      supabase.from('checklists')
        .select('id, nome, fase, checklist_itens(id, texto, ordem)')
        .eq('fase', 'saida'),
    ]).then(([{ data: ecs }, { data: chks }, { data: subs }, { data: saidaLists }]) => {
      if (!activo) return
      const linked = (ecs ?? []).map(ec => ({
        clId: ec.checklist_id, nome: ec.checklists?.nome ?? '?',
        fase: ec.checklists?.fase ?? null,
        itens: (ec.checklists?.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem),
      }))
      const linkedIds = new Set(linked.map(l => l.clId))
      const globalSaida = (saidaLists ?? [])
        .filter(cl => !linkedIds.has(cl.id))
        .map(cl => ({
          clId: cl.id, nome: cl.nome, fase: cl.fase,
          itens: (cl.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem),
        }))
      setEventoListas([...linked, ...globalSaida])
      setEventoChecks(new Set((chks ?? []).map(c => c.checklist_item_id)))
      setClSubmetidas(new Set((subs ?? []).map(s => s.checklist_id)))
    })
    return () => { activo = false }
  }, [evento?.id, colaborador?.id])

  // Preparação → Execução automático 4h antes do evento
  useEffect(() => {
    if (!evento?.data_evento || !evento?.hora_inicio || faseLocal !== 'preparacao') return
    const verificar = () => {
      const [h, m] = evento.hora_inicio.split(':').map(Number)
      const eventoDate = new Date(`${evento.data_evento}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
      const limite = new Date(eventoDate.getTime() - 4 * 60 * 60 * 1000)
      if (new Date() >= limite) marcarFase('execucao')
    }
    verificar()
    const id = setInterval(verificar, 60_000)
    return () => clearInterval(id)
  }, [evento?.data_evento, evento?.hora_inicio, faseLocal])

  const logo    = evento.espacos?.logo_url
  const cliente = evento.espacos?.nome || evento.cliente || null
  const tecNomeResp = evento.todos_tecnicos ? 'Todos os técnicos' : (mapaTecnicos[evento.tecnico_id] || evento.responsavel || null)

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

  const toggleCheck = async (itemId, checklistId) => {
    if (!colaborador?.id || clSubmetidas.has(checklistId)) return
    const checked = eventoChecks.has(itemId)
    const newChecks = new Set(eventoChecks)
    if (checked) newChecks.delete(itemId); else newChecks.add(itemId)
    setEventoChecks(newChecks)

    // Criação → Preparação quando todos os itens (excl. saída) estão marcados
    if (!checked && faseLocal === 'criacao') {
      const itens = eventoListas.filter(l => l.fase !== 'saida').flatMap(l => l.itens.map(it => it.id))
      if (itens.length > 0 && itens.every(id => newChecks.has(id))) marcarFase('preparacao')
    }

    if (!checked) {
      const { error } = await supabase.from('checklist_checks').upsert(
        { evento_id: evento.id, checklist_item_id: itemId, tecnico_id: colaborador.id },
        { onConflict: 'evento_id,checklist_item_id,tecnico_id' }
      )
      if (error) console.error('checklist_checks upsert error:', error)
    } else {
      const { error } = await supabase.from('checklist_checks').delete()
        .eq('evento_id', evento.id).eq('checklist_item_id', itemId).eq('tecnico_id', colaborador.id)
      if (error) console.error('checklist_checks delete error:', error)
    }
  }

  useEffect(() => {
    if (!evento?.id || !colaborador?.id) return
    let activo = true
    supabase.from('evento_feedback')
      .select('id, texto, fotos')
      .eq('evento_id', evento.id)
      .eq('tecnico_id', colaborador.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo || !data) return
        setFeedbackId(data.id)
        setExecucaoNotas(data.texto ?? '')
        setFeedbackFotos(data.fotos ?? [])
      })
    return () => { activo = false }
  }, [evento?.id, colaborador?.id])

  useEffect(() => {
    if (!evento?.id) return
    let activo = true
    supabase.from('evento_equipamentos')
      .select('id, tipo, quantidade, descricao_manual, observacoes, equipamentos(nome)')
      .eq('evento_id', evento.id)
      .then(({ data }) => { if (activo) setEquipEvento(data ?? []) })
    return () => { activo = false }
  }, [evento?.id])

  useEffect(() => {
    if (!evento?.id) return
    let activo = true
    supabase.from('evento_carros')
      .select('carro_id, condutor_id, km_saida, km_chegada')
      .eq('evento_id', evento.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo || !data) return
        setEventoCarros({
          carro_id:    data.carro_id    ?? '',
          condutor_id: data.condutor_id ?? '',
          km_saida:    data.km_saida    != null ? String(data.km_saida)    : '',
          km_chegada:  data.km_chegada  != null ? String(data.km_chegada)  : '',
        })
      })
    return () => { activo = false }
  }, [evento?.id])

  useEffect(() => {
    if (!evento?.id) return
    let activo = true
    supabase.from('evento_equip_items')
      .select('id, texto, feito, criado_por, criado_em')
      .eq('evento_id', evento.id)
      .order('criado_em', { ascending: true })
      .then(({ data }) => { if (activo) setEquipItems(data ?? []) })
    return () => { activo = false }
  }, [evento?.id])

  const adicionarEquip = async () => {
    const texto = equipInput.trim()
    if (!texto || !colaborador?.id || equipAdding) return
    setEquipAdding(true)
    const { data, error } = await supabase.from('evento_equip_items').insert({
      evento_id: evento.id, criado_por: colaborador.id, texto,
    }).select('id, texto, feito, criado_por, criado_em').single()
    if (!error && data) { setEquipItems(prev => [...prev, data]); setEquipInput('') }
    setEquipAdding(false)
  }

  const removerEquip = async (id) => {
    await supabase.from('evento_equip_items').delete().eq('id', id)
    setEquipItems(prev => prev.filter(e => e.id !== id))
  }

  const toggleEquip = async (id, feito) => {
    setEquipItems(prev => prev.map(e => e.id === id ? { ...e, feito: !feito } : e))
    await supabase.from('evento_equip_items')
      .update({ feito: !feito, feito_por: colaborador?.id ?? null })
      .eq('id', id)
  }

  const guardarChecklist = async (checklistId) => {
    if (!colaborador?.id || clSubmetidas.has(checklistId) || clGuardando.has(checklistId)) return
    setClGuardando(prev => new Set([...prev, checklistId]))
    const { error } = await supabase.from('checklist_submissoes').insert({
      evento_id:    evento.id,
      tecnico_id:   colaborador.id,
      checklist_id: checklistId,
    })
    if (!error) setClSubmetidas(prev => new Set([...prev, checklistId]))
    else console.error('checklist_submissoes insert error:', error)
    setClGuardando(prev => { const s = new Set(prev); s.delete(checklistId); return s })
  }

  const registarAssinEvento = async (campo) => {
    if (!isAtribuido || assinEvento[campo] || assinEvSaving[campo]) return
    const agora = new Date().toISOString()
    setAssinEvSaving(prev => ({ ...prev, [campo]: true }))
    const { error } = await supabase.from('supa_eventos').update({ [campo]: agora }).eq('id', evento.id)
    if (!error) setAssinEvento(prev => ({ ...prev, [campo]: agora }))
    setAssinEvSaving(prev => ({ ...prev, [campo]: false }))
  }

  const marcarFase = async (novaFase) => {
    if (!isAtribuido || concluindoFase) return
    setConcluindoFase(true)
    const { error } = await supabase.from('supa_eventos').update({ fase: novaFase }).eq('id', evento.id)
    if (!error) setFaseLocal(novaFase)
    setConcluindoFase(false)
  }

  const guardarVeiculo = async () => {
    if (!isAtribuido || veiculoSaving) return
    setVeiculoSaving(true)
    await supabase.from('evento_carros').delete().eq('evento_id', evento.id)
    if (eventoCarros.carro_id || eventoCarros.condutor_id || eventoCarros.km_saida || eventoCarros.km_chegada) {
      await supabase.from('evento_carros').insert({
        evento_id:   evento.id,
        carro_id:    eventoCarros.carro_id    || null,
        condutor_id: eventoCarros.condutor_id || null,
        km_saida:    eventoCarros.km_saida    !== '' ? Number(eventoCarros.km_saida)    : null,
        km_chegada:  eventoCarros.km_chegada  !== '' ? Number(eventoCarros.km_chegada)  : null,
      })
    }
    setVeiculoSaving(false)
    setVeiculoSaved(true)
  }

  const adicionarFoto = async (file) => {
    if (!file || fotoUploading) return
    setFotoUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${evento.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('eventos-feedback').upload(path, file)
    if (!error) {
      const { data: pub } = supabase.storage.from('eventos-feedback').getPublicUrl(path)
      setFeedbackFotos(prev => [...prev, pub.publicUrl])
    }
    setFotoUploading(false)
  }

  const removerFoto = (url) => setFeedbackFotos(prev => prev.filter(u => u !== url))

  const guardarFeedback = async () => {
    if (!colaborador?.id || execucaoSaving) return
    setExecucaoSaving(true)
    if (feedbackId) {
      await supabase.from('evento_feedback').update({ texto: execucaoNotas, fotos: feedbackFotos }).eq('id', feedbackId)
    } else {
      const { data } = await supabase.from('evento_feedback')
        .insert({ evento_id: evento.id, tecnico_id: colaborador.id, texto: execucaoNotas, fotos: feedbackFotos })
        .select('id').maybeSingle()
      if (data?.id) setFeedbackId(data.id)
    }
    setExecucaoSaving(false)
    setExecucaoSaved(true)
  }

  const goAba = (novaAba, direcao) => {
    if (novaAba === aba) return
    setDir(direcao)
    setAba(novaAba)
  }

  const ABAS_ORDER = isLmd ? ['detalhes'] : ['detalhes', 'notas', 'checklist', 'execucao']
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

  // ── Dados normalizados para impressão ──
  const dadosEvento = {
    nomeEvento: evento.evento || '—',
    data: evento.data_evento || null,
    horaInicio: evento.hora_inicio?.slice(0, 5) || null,
    horaFim: evento.hora_fim?.slice(0, 5) || null,
    diaInstalacao: evento.dia_instalacao || null,
    horaInstalacao: evento.hora_instalacao?.slice(0, 5) || null,
    local: evento.espacos?.nome || null,
    morada: evento.morada || null,
    responsavel: evento.responsavel || null,
    contacto: evento.contacto_pelo_evento || null,
    tecnicos: [
      evento.todos_tecnicos ? { nome: 'Todos os técnicos', label: 'Equipa' }
        : mapaTecnicos[evento.tecnico_id] ? { nome: mapaTecnicos[evento.tecnico_id], label: 'Responsável' } : null,
      ...outrosTecs.map(nome => ({ nome, label: 'Apoio' })),
    ].filter(Boolean),
    status: evento.status || null,
    fase: faseLocal || null,
    equipamentos: equipEvento.map(r => ({
      nome: r.descricao_manual || r.equipamentos?.nome || '—',
      quantidade: r.quantidade || 1,
      observacoes: r.observacoes || null,
    })),
    equipItemsFeitos: equipItems,
    checklists: eventoListas.map(l => ({ nome: l.nome, fase: l.fase, itens: l.itens.map(i => i.texto) })),
    veiculo: (() => {
      const carro = carros.find(c => c.id === Number(eventoCarros.carro_id))
      const condutorNome = mapaTecnicos[eventoCarros.condutor_id] || null
      if (!carro && !condutorNome) return null
      return {
        descricao: carro ? carro.marca + ' ' + carro.modelo + ' · ' + carro.matricula : null,
        condutor: condutorNome,
      }
    })(),
    notasOperacionais: evento.notas_operacionais || null,
    notasPreparacao: evento.notas_preparacao || null,
    dataPreparacao: evento.data_preparacao || null,
    notasColaborador: notas || null,
    feedbackTexto: execucaoNotas || null,
    fotos: feedbackFotos,
    assinaturas: {
      lmd_at: assinEvento.assinatura_lmd_at,
      in_at:  assinEvento.assinatura_in_at,
      out_at: assinEvento.assinatura_out_at,
    },
    tipoEvento: evento.tipo || null,
  }

  return (
    <>

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
        <div className="flex border-b border-border px-2 shrink-0 items-center justify-center">
          {(isLmd
            ? [{ id: 'detalhes', label: 'Detalhes', d: 'left' }]
            : [
                { id: 'detalhes',  label: 'Detalhes',       d: 'left' },
                { id: 'notas',     label: 'Equip. & Notas', d: 'right' },
                { id: 'execucao',  label: 'Execução',       d: 'right' },
                { id: 'checklist', label: 'Checklist',      d: 'right' },
              ]
          ).map(t => (
            <button key={t.id} onClick={() => goAba(t.id, t.d)}
              className={clsx(
                'px-3 py-2.5 font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
                aba === t.id ? 'border-amber-400 text-amber-400' : 'border-transparent text-accent-muted hover:text-accent',
              )}
              style={{ fontSize: 12 }}>{t.label}</button>
          ))}
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

                {/* LOCAL | ícone checklist centrado na coluna direita */}
                <Campo rotulo="Local" valor={cliente} />
                {eventoListas.length > 0 && cliente ? (
                  <div className="flex items-center justify-center py-2 border-b border-border/30">
                    <button onClick={() => goAba('checklist', 'right')}
                      title="Ver checklists"
                      className="text-amber-400/70 hover:text-amber-400 transition-colors">
                      <ListChecks size={32} />
                    </button>
                  </div>
                ) : (
                  <Campo rotulo="Contacto" valor={evento.contacto_pelo_evento} />
                )}
                {eventoListas.length > 0 && cliente && (
                  <Campo rotulo="Contacto" valor={evento.contacto_pelo_evento} />
                )}

                {/* Morada — coluna única */}
                <Campo rotulo="Morada" valor={evento.morada} isLink full />
              </div>

              {/* ── LMD: Assinaturas (IN Work + OUT Work) ── */}
              {isLmd && isAtribuido && (
                <div className="mt-3">
                  <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>Presença / Assinaturas</p>
                  <div className="flex flex-col gap-2">
                    {[
                      { campo: 'assinatura_lmd_at', label: 'IN — Work' },
                      { campo: 'assinatura_out_at', label: 'OUT — Work', requiredCampo: 'assinatura_lmd_at' },
                    ].map(({ campo, label, requiredCampo }) => {
                      const val      = assinEvento[campo]
                      const saving   = assinEvSaving[campo]
                      const bloqueado = requiredCampo ? !assinEvento[requiredCampo] : false
                      return (
                        <div key={campo} className={clsx('flex items-center gap-3 p-2.5 rounded-xl border bg-white/[0.03]', bloqueado ? 'border-white/5 opacity-40' : 'border-white/10')}>
                          <div className={clsx('w-2 h-2 rounded-full shrink-0', val ? 'bg-green-400' : 'bg-white/20')} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-accent" style={{ fontSize: 12 }}>{label}</p>
                            {val && (
                              <p className="text-accent-subtle/60 tabular-nums mt-0.5" style={{ fontSize: 10 }}>
                                {new Date(val).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          {val ? (
                            <Check size={14} className="text-green-400 shrink-0" />
                          ) : !bloqueado && isAtribuido ? (
                            <button
                              onClick={() => registarAssinEvento(campo)}
                              disabled={!!saving}
                              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 font-medium hover:bg-amber-400/20 disabled:opacity-40 transition-colors"
                              style={{ fontSize: 11 }}>
                              <Clock size={11} />
                              {saving ? '…' : 'Registar'}
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── LMD: Tarefas do técnico ── */}
              {isLmd && tarefas.filter(t => !['concluída', 'concluida', 'cancelada'].includes(t.estado)).length > 0 && (
                <div className="mt-3">
                  <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>As minhas tarefas</p>
                  <div className="flex flex-col gap-1.5">
                    {tarefas
                      .filter(t => !['concluída', 'concluida', 'cancelada'].includes(t.estado))
                      .map(t => (
                        <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                          <p className="font-semibold text-accent leading-snug" style={{ fontSize: 13 }}>{t.tarefa}</p>
                          {t.data_conclusao && (
                            <p className="text-accent-subtle/60 mt-0.5" style={{ fontSize: 11 }}>{dataLonga(t.data_conclusao)}</p>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>

          ) : aba === 'checklist' ? (
            <div className="flex flex-col gap-3 py-2">
              {/* Equipamentos para o evento (checklist interativa) — topo */}
              {equipEvento.length > 0 && (() => {
                const total  = equipEvento.length
                const feitos = equipEvento.filter(r => equipEventoChecks.has(r.id)).length
                return (
                  <div className="border border-white/10 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/[0.08] border-b border-amber-400/20">
                      <Boxes size={12} className={equipConfirmadoEm ? 'text-green-400 shrink-0' : 'text-amber-400 shrink-0'} />
                      <p className={clsx('font-bold uppercase tracking-wider flex-1', equipConfirmadoEm ? 'text-green-400' : 'text-amber-400')} style={{ fontSize: 10 }}>Equipamentos para o evento</p>
                      {equipConfirmadoEm ? (
                        <span className="inline-flex items-center gap-1 text-green-400" style={{ fontSize: 10 }}>
                          <Lock size={10} /> Guardado
                        </span>
                      ) : (
                        <button
                          onClick={async () => {
                            const ts = new Date().toISOString()
                            const { error } = await supabase.from('supa_eventos').update({ equip_confirmado_em: ts }).eq('id', evento.id)
                            if (!error) setEquipConfirmadoEm(ts)
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition-all"
                          style={{ fontSize: 10 }}>
                          <Lock size={10} />
                          {`Guardar ${feitos}/${total}`}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col">
                      {equipEvento.map((r, i) => {
                        const checked = equipEventoChecks.has(r.id)
                        return (
                          <button key={i} disabled={!!equipConfirmadoEm}
                            onClick={() => setEquipEventoChecks(prev => {
                              const s = new Set(prev)
                              checked ? s.delete(r.id) : s.add(r.id)
                              return s
                            })}
                            className={clsx(
                              'flex items-center gap-2 px-3 py-2.5 border-b border-white/5 last:border-0 w-full text-left transition-colors',
                              checked ? 'bg-green-500/5' : 'hover:bg-white/[0.03]',
                              !!equipConfirmadoEm && 'cursor-default'
                            )}>
                            <div className={clsx(
                              'w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center transition-colors',
                              checked ? 'bg-green-500/30 border-green-500/60' : 'border-white/20'
                            )}>
                              {checked && <Check size={10} className="text-green-400" />}
                            </div>
                            <span className="text-accent-subtle/60 tabular-nums shrink-0 font-medium" style={{ fontSize: 12 }}>{r.quantidade}×</span>
                            <span className={clsx('flex-1 text-left', checked ? 'text-accent-subtle/50 line-through' : 'text-accent-muted')} style={{ fontSize: 13 }}>
                              {r.descricao_manual || r.equipamentos?.nome || '—'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {eventoListas.length === 0 && equipEvento.length === 0 && (
                <p className="text-center italic py-6" style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Sem checklists neste evento.</p>
              )}
              {eventoListas.filter(l => l.fase !== 'saida').map(lista => {
                const submetida = clSubmetidas.has(lista.clId)
                const aGuardar  = clGuardando.has(lista.clId)
                const total     = lista.itens.length
                const feitos    = lista.itens.filter(it => eventoChecks.has(it.id)).length
                return (
                  <div key={lista.clId} className="border border-white/10 rounded-xl overflow-hidden">
                    {/* Cabeçalho do card */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
                      <ListChecks size={12} className={submetida ? 'text-green-400 shrink-0' : 'text-amber-400 shrink-0'} />
                      <p className={clsx('font-semibold flex-1', submetida ? 'text-green-400' : 'text-amber-400')} style={{ fontSize: 12 }}>
                        {lista.nome}
                      </p>
                      {submetida ? (
                        <span className="inline-flex items-center gap-1 text-green-400" style={{ fontSize: 10 }}>
                          <Lock size={10} /> Guardado
                        </span>
                      ) : isAtribuido && total > 0 && (
                        <button
                          onClick={() => guardarChecklist(lista.clId)}
                          disabled={aGuardar}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 disabled:opacity-50 transition-all"
                          style={{ fontSize: 10 }}>
                          <Lock size={10} />
                          {aGuardar ? '…' : `Guardar ${feitos}/${total}`}
                        </button>
                      )}
                    </div>
                    {/* Itens */}
                    <div className="flex flex-col">
                      {lista.itens.map((item) => {
                        const checked = eventoChecks.has(item.id)
                        return (
                          <button key={item.id}
                            onClick={() => toggleCheck(item.id, lista.clId)}
                            disabled={!isAtribuido || submetida}
                            className={clsx(
                              'flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0 text-left transition-colors',
                              checked ? 'bg-green-500/10' : 'hover:bg-white/5',
                              (!isAtribuido || submetida) ? 'cursor-default' : 'cursor-pointer'
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
                )
              })}
              {/* Equipamentos do responsável */}
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-b border-white/10">
                  <Boxes size={12} className="text-amber-400 shrink-0" />
                  <p className="font-semibold flex-1 text-amber-400" style={{ fontSize: 12 }}>Equipamentos</p>
                </div>
                <div className="flex flex-col">
                  {equipItems.map(item => (
                    <div key={item.id}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0 transition-colors',
                        item.feito ? 'bg-green-500/10' : ''
                      )}>
                      <button
                        onClick={() => isAtribuido && toggleEquip(item.id, item.feito)}
                        disabled={!isAtribuido}
                        className={clsx(
                          'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                          item.feito ? 'bg-green-500/30 border-green-500/60' : 'border-white/20',
                          !isAtribuido && 'cursor-default'
                        )}>
                        {item.feito && <Check size={12} className="text-green-400" />}
                      </button>
                      <span className={clsx('flex-1', item.feito ? 'line-through opacity-50' : 'opacity-80')} style={{ fontSize: 13 }}>
                        {item.texto}
                      </span>
                      {isResponsavel && (
                        <button onClick={() => removerEquip(item.id)}
                          className="text-accent-subtle/40 hover:text-red-400 transition-colors p-0.5 shrink-0">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {equipItems.length === 0 && (
                    <p className="px-3 py-2.5 italic opacity-30" style={{ fontSize: 12 }}>Sem equipamentos adicionados.</p>
                  )}
                  {isResponsavel && (
                    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
                      <input
                        value={equipInput}
                        onChange={e => setEquipInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && adicionarEquip()}
                        placeholder="Adicionar equipamento…"
                        className="flex-1 bg-transparent text-accent placeholder:text-accent-subtle/40 focus:outline-none"
                        style={{ fontSize: 13 }}
                      />
                      <button
                        onClick={adicionarEquip}
                        disabled={equipAdding || !equipInput.trim()}
                        className="text-amber-400 hover:text-amber-300 disabled:opacity-30 transition-colors shrink-0">
                        <Plus size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {!isAtribuido && eventoListas.length > 0 && (
                <p className="text-center opacity-40 italic" style={{ fontSize: 12 }}>Só técnicos atribuídos podem marcar itens.</p>
              )}
            </div>

          ) : aba === 'execucao' ? (
            <div className="flex flex-col gap-4 py-2">

              {/* Fase do evento */}
              <div>
                <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>Fase do Evento</p>
                <div className="flex items-center gap-1.5 p-2.5 bg-white/5 rounded-xl border border-white/10 overflow-x-auto">
                  {[
                    { id: 'criacao',    label: 'Criação' },
                    { id: 'preparacao', label: 'Prep.' },
                    { id: 'execucao',   label: 'Exec.' },
                    { id: 'concluido',  label: 'Concluído' },
                    { id: 'faturado',   label: 'Faturado' },
                  ].map(({ id, label }, i, arr) => {
                    const fases = ['criacao', 'preparacao', 'execucao', 'concluido', 'faturado']
                    const idxAtual = fases.indexOf(faseLocal)
                    const done = i <= idxAtual
                    return (
                      <div key={id} className="flex items-center gap-1 shrink-0">
                        <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0', done ? 'bg-amber-400' : 'bg-white/20')} />
                        <span className={clsx(done ? 'text-amber-400' : 'text-white/30')} style={{ fontSize: 10 }}>{label}</span>
                        {i < arr.length - 1 && <div className={clsx('w-4 h-px shrink-0', i < idxAtual ? 'bg-amber-400/40' : 'bg-white/10')} />}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Presença / Assinaturas */}
              <div>
                <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>Presença / Assinaturas</p>
                <div className="flex flex-col gap-2">
                  {[
                    { campo: 'assinatura_lmd_at', label: 'IN — Work' },
                    { campo: 'assinatura_in_at',  label: 'IN — Event', requiredCampo: 'assinatura_lmd_at' },
                    ...(!evento.xclusive ? [{ campo: 'assinatura_out_at', label: 'OUT — Work', requiredCampo: 'assinatura_in_at' }] : []),
                  ].map(({ campo, label, requiredCampo }) => {
                    const val       = assinEvento[campo]
                    const saving    = assinEvSaving[campo]
                    const bloqueado = requiredCampo ? !assinEvento[requiredCampo] : false
                    return (
                      <div key={campo} className={clsx('flex items-center gap-3 p-2.5 rounded-xl border bg-white/[0.03]', bloqueado ? 'border-white/5 opacity-40' : 'border-white/10')}>
                        <div className={clsx('w-2 h-2 rounded-full shrink-0', val ? 'bg-green-400' : 'bg-white/20')} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-accent" style={{ fontSize: 12 }}>{label}</p>
                          {val && (
                            <p className="text-accent-subtle/60 tabular-nums mt-0.5" style={{ fontSize: 10 }}>
                              {new Date(val).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        {val ? (
                          <Check size={14} className="text-green-400 shrink-0" />
                        ) : !bloqueado && isAtribuido ? (
                          <button
                            onClick={() => registarAssinEvento(campo)}
                            disabled={!!saving}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 font-medium hover:bg-amber-400/20 disabled:opacity-40 transition-colors"
                            style={{ fontSize: 11 }}>
                            <Clock size={11} />
                            {saving ? '…' : 'Registar'}
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>


              {/* Checklist de saída */}
              {eventoListas.some(l => l.fase === 'saida') && (
                <div className="flex flex-col gap-2">
                  {eventoListas.filter(l => l.fase === 'saida').map(lista => {
                    const submetida = clSubmetidas.has(lista.clId)
                    const aGuardar  = clGuardando.has(lista.clId)
                    const total     = lista.itens.length
                    const feitos    = lista.itens.filter(it => eventoChecks.has(it.id)).length
                    return (
                      <div key={lista.clId} className="rounded-xl border border-white/10 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/[0.08] border-b border-amber-400/20">
                          <ListChecks size={12} className={submetida ? 'text-green-400 shrink-0' : 'text-amber-400 shrink-0'} />
                          <p className={clsx('font-bold uppercase tracking-wider flex-1', submetida ? 'text-green-400' : 'text-amber-400')} style={{ fontSize: 10 }}>{lista.nome}</p>
                          {submetida ? (
                            <span className="inline-flex items-center gap-1 text-green-400" style={{ fontSize: 10 }}>
                              <Lock size={10} /> Guardado
                            </span>
                          ) : isAtribuido && total > 0 && (
                            <button
                              onClick={() => guardarChecklist(lista.clId)}
                              disabled={aGuardar}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 disabled:opacity-50 transition-all"
                              style={{ fontSize: 10 }}>
                              <Lock size={10} />
                              {aGuardar ? '…' : `Guardar ${feitos}/${total}`}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col">
                          {lista.itens.map(item => {
                            const checked = eventoChecks.has(item.id)
                            return (
                              <button key={item.id}
                                onClick={() => toggleCheck(item.id, lista.clId)}
                                disabled={!isAtribuido || submetida}
                                className={clsx(
                                  'flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0 text-left transition-colors',
                                  checked ? 'bg-green-500/10' : 'hover:bg-white/5',
                                  (!isAtribuido || submetida) ? 'cursor-default' : 'cursor-pointer'
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
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Veículo */}
              {isAtribuido && (
                <div>
                  <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>Veículo</p>
                  <div className="flex flex-col gap-2 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-accent-subtle/60 mb-1" style={{ fontSize: 10 }}>Carro</p>
                        <select value={eventoCarros.carro_id}
                          onChange={e => setEventoCarros(p => ({ ...p, carro_id: e.target.value }))}
                          className="w-full bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-accent focus:outline-none focus:border-white/30"
                          style={{ fontSize: 12 }}>
                          <option value="">— Selecionar —</option>
                          {carros.map(c => <option key={c.id} value={c.id}>{c.marca} {c.modelo} · {c.matricula}</option>)}
                        </select>
                      </div>
                      <div>
                        <p className="text-accent-subtle/60 mb-1" style={{ fontSize: 10 }}>Condutor</p>
                        <select value={eventoCarros.condutor_id}
                          onChange={e => setEventoCarros(p => ({ ...p, condutor_id: e.target.value }))}
                          className="w-full bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-accent focus:outline-none focus:border-white/30"
                          style={{ fontSize: 12 }}>
                          <option value="">— Selecionar —</option>
                          {Object.entries(mapaTecnicos).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-accent-subtle/60 mb-1" style={{ fontSize: 10 }}>Km saída</p>
                        <input type="number" min="0" step="1"
                          value={eventoCarros.km_saida}
                          onChange={e => setEventoCarros(p => ({ ...p, km_saida: e.target.value }))}
                          placeholder="—"
                          className="w-full bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-accent placeholder:text-accent-subtle/30 focus:outline-none focus:border-white/30"
                          style={{ fontSize: 12 }} />
                      </div>
                      <div>
                        <p className="text-accent-subtle/60 mb-1" style={{ fontSize: 10 }}>Km chegada</p>
                        <input type="number" min="0" step="1"
                          value={eventoCarros.km_chegada}
                          onChange={e => setEventoCarros(p => ({ ...p, km_chegada: e.target.value }))}
                          placeholder="—"
                          className="w-full bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-accent placeholder:text-accent-subtle/30 focus:outline-none focus:border-white/30"
                          style={{ fontSize: 12 }} />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button onClick={guardarVeiculo} disabled={veiculoSaving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-accent font-medium hover:bg-white/15 disabled:opacity-40 transition-colors"
                        style={{ fontSize: 12 }}>
                        {veiculoSaved ? <CheckCircle2 size={12} className="text-green-400" /> : <Save size={12} />}
                        {veiculoSaving ? 'A guardar…' : veiculoSaved ? 'Guardado' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Fotos do evento (anexadas na criação) */}
              {(evento.fotos_urls ?? []).length > 0 && (
                <div>
                  <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>Fotos do Evento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(evento.fotos_urls ?? []).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="relative rounded-lg overflow-hidden aspect-square bg-white/5 block">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback / notas de execução */}
              {isAtribuido && (
                <div>
                  <p className="uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>Feedback / Notas</p>
                  <textarea
                    value={execucaoNotas}
                    onChange={e => setExecucaoNotas(e.target.value)}
                    rows={3}
                    placeholder="Feedback sobre o evento, ocorrências, observações…"
                    style={{ fontSize: 13 }}
                    className="w-full bg-surface-2 border border-white/20 rounded-xl px-3 py-2 text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/40 resize-none"
                  />
                  {/* Fotos */}
                  <div className="mt-2">
                    {feedbackFotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {feedbackFotos.map((url, i) => (
                          <div key={i} className="relative rounded-lg overflow-hidden aspect-square bg-white/5">
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => removerFoto(url)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <label className={clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border border-white/15 cursor-pointer transition-colors flex-1',
                        fotoUploading ? 'opacity-40 cursor-wait' : 'hover:bg-white/5'
                      )}>
                        <Camera size={14} className="text-accent-subtle shrink-0" />
                        <span className="text-accent-subtle" style={{ fontSize: 12 }}>
                          {fotoUploading ? 'A carregar…' : 'Câmara'}
                        </span>
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          disabled={fotoUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) adicionarFoto(f); e.target.value = '' }} />
                      </label>
                      <label className={clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border border-white/15 cursor-pointer transition-colors flex-1',
                        fotoUploading ? 'opacity-40 cursor-wait' : 'hover:bg-white/5'
                      )}>
                        <ImageIcon size={14} className="text-accent-subtle shrink-0" />
                        <span className="text-accent-subtle" style={{ fontSize: 12 }}>
                          {fotoUploading ? 'A carregar…' : 'Galeria'}
                        </span>
                        <input type="file" accept="image/*" multiple className="hidden"
                          disabled={fotoUploading}
                          onChange={async e => {
                            const files = Array.from(e.target.files ?? [])
                            for (const f of files) await adicionarFoto(f)
                            e.target.value = ''
                          }} />
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button onClick={guardarFeedback} disabled={execucaoSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-accent font-medium hover:bg-white/15 disabled:opacity-40 transition-colors"
                      style={{ fontSize: 12 }}>
                      {execucaoSaved ? <CheckCircle2 size={12} className="text-green-400" /> : <Save size={12} />}
                      {execucaoSaving ? 'A guardar…' : execucaoSaved ? 'Guardado' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Marcar como Concluído */}
              {isAtribuido && (faseLocal === 'execucao' || faseLocal === 'preparacao' || faseLocal === 'criacao') && (
                <button
                  onClick={() => marcarFase('concluido')}
                  disabled={concluindoFase}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-semibold hover:bg-green-500/20 disabled:opacity-40 transition-colors"
                  style={{ fontSize: 14 }}>
                  <Flag size={16} />
                  {concluindoFase ? 'A marcar…' : 'Marcar como Concluído'}
                </button>
              )}
              {faseLocal === 'concluido' && (
                <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-semibold" style={{ fontSize: 14 }}>
                  <Check size={16} /> Evento Concluído
                </div>
              )}
            </div>

          ) : (
            <div className="flex flex-col gap-4 py-2">
              {/* Equipamentos — topo */}
              {equipEvento.length > 0 && (
                <div className="rounded-xl border border-white/15 overflow-hidden">
                  <div className="px-3 py-2 bg-white/5 border-b border-white/10">
                    <p className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-400" style={{ fontSize: 10 }}>
                      <Boxes size={11} /> Equipamentos para o evento
                    </p>
                  </div>
                  <div className="flex flex-col">
                    {equipEvento.map((r, i) => (
                      <div key={i} className="px-3 py-2 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-accent-subtle/60 tabular-nums shrink-0 font-medium" style={{ fontSize: 12 }}>{r.quantidade}×</span>
                          <span className="text-accent-muted" style={{ fontSize: 13 }}>
                            {r.descricao_manual || r.equipamentos?.nome || '—'}
                          </span>
                        </div>
                        {r.observacoes && (
                          <p className="text-accent-subtle/50 italic ml-6 mt-0.5" style={{ fontSize: 11 }}>{r.observacoes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {evento.notas_preparacao && (
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] px-3 py-3">
                  <p className="flex items-center gap-1.5 uppercase tracking-wider text-purple-400/70 mb-2" style={{ fontSize: 10 }}>
                    <StickyNote size={12} /> Notas de preparação
                  </p>
                  <p className="text-accent-muted whitespace-pre-wrap leading-relaxed" style={{ fontSize: 14 }}>
                    {evento.notas_preparacao}
                  </p>
                </div>
              )}
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
              {evento.rider_url && (
                <div>
                  <p className="flex items-center gap-1.5 uppercase tracking-wider text-accent-subtle mb-2" style={{ fontSize: 10 }}>
                    <FileText size={12} /> Rider Técnico
                  </p>
                  <a href={evento.rider_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface-2 text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
                    style={{ fontSize: 13 }}>
                    <FileText size={14} />
                    Ver PDF
                  </a>
                </div>
              )}
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
                      {guardado ? <CheckCircle2 size={13} className="text-green-600" /> : <Save size={13} />}
                      {guardando ? 'A guardar…' : guardado ? 'Guardado' : 'Guardar notas'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé — assinatura de início de evento + presença + fechar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/40 shrink-0">
          <div className="flex flex-col gap-1.5 items-start">
            {/* Botão In Evento */}
            {mostrarInEvento && (
              <button onClick={() => assinarEvento('in_evento')} disabled={assinandoEvento}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-400/30 bg-green-400/[0.07] text-green-400 text-xs font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity">
                <PenLine size={13} />
                {assinandoEvento ? 'A registar…' : 'In Evento'}
              </button>
            )}
            {/* Badge In Evento já feito */}
            {!mostrarInEvento && feitasAssin.some(f => f.tipo === 'in_evento') && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400">
                <Check size={13} /> In Evento · {new Date(feitasAssin.find(f => f.tipo === 'in_evento').registado_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {/* Presença GPS */}
            <div className="flex items-center gap-3 flex-wrap">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-medium hover:bg-amber-400/20 transition-colors disabled:opacity-40">
                  <MapPin size={14} /> Marcar presença
                </button>
              ) : null}
            </div>
          </div>
          <button onClick={() => setPrintEvento(true)}
            title="Folha de Evento"
            className="w-11 h-11 rounded-full bg-surface-2 border border-border flex items-center justify-center text-accent-subtle hover:text-accent hover:bg-surface-3 active:scale-95 transition-all">
            <Printer size={18} />
          </button>
          <button onClick={onFechar}
            className="w-11 h-11 rounded-full bg-surface-2 border border-border flex items-center justify-center text-accent-subtle hover:text-accent hover:bg-surface-3 active:scale-95 transition-all">
            <X size={22} />
          </button>
        </div>
      </div>
    </div>

    <PrintModal aberto={printEvento} onFechar={() => setPrintEvento(false)} titulo={evento.evento || "Evento"}>
      <FolhaEvento dados={dadosEvento} />
    </PrintModal>
    </>
  )
}
