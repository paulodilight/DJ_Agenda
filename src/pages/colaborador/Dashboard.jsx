import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Camera, ChevronRight, CalendarClock, Wrench, LayoutList, PenLine, AlertTriangle, Clock, X } from 'lucide-react'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/colaborador/Avatar'
import { EventoModal } from '@/components/colaborador/EventoModal'
import { OcorrenciaDetalhe } from '@/components/ocorrencias/OcorrenciaDetalhe'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { hhmm, dataLonga } from '@/components/colaborador/format'
import { useAssinaturaDia } from '@/hooks/useAssinaturaDia'

const LABELS_ASSIN = {
  in_work:   { label: 'In Work',   cor: 'text-green-400  border-green-400/30  bg-green-400/[0.07]'  },
  in_evento: { label: 'In Evento', cor: 'text-amber-400  border-amber-400/30  bg-amber-400/[0.07]'  },
  out_work:  { label: 'Out Work',  cor: 'text-red-400    border-red-400/30    bg-red-400/[0.07]'    },
}

function BotaoAssinatura({ proxima, registar, tiposFeitos = [] }) {
  const [loading, setLoading] = useState(false)

  // Badges: tipos já assinados hoje (vêm do DB via hook)
  const badges = tiposFeitos
    .filter(tf => LABELS_ASSIN[tf.tipo])
    .map(tf => ({
      tipo: tf.tipo,
      hora: new Date(tf.registado_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
    }))

  // Só mostrar botão se o próximo tipo ainda não está assinado hoje
  const jaFeito     = proxima && badges.some(b => b.tipo === proxima.tipo)
  const podeAssinar = proxima && LABELS_ASSIN[proxima.tipo] && !jaFeito

  if (!podeAssinar && badges.length === 0) return null

  const onClick = async (e) => {
    e.stopPropagation()
    if (!podeAssinar || loading) return
    setLoading(true)
    await registar(proxima.tipo, { eventoId: proxima.eventoId, agendamentoId: proxima.agendamentoId })
    setLoading(false)
    // badges actualizados automaticamente pelo hook (versao incrementa após registar)
  }

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <p className="text-[10px] uppercase tracking-wider text-accent-subtle/50 w-full">Assinatura de hoje</p>
      {badges.map(({ tipo, hora }) => {
        const cfg = LABELS_ASSIN[tipo]
        return (
          <span key={tipo} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${cfg.cor}`}>
            <PenLine size={11} />
            {cfg.label} · {hora}
          </span>
        )
      })}
      {podeAssinar && (
        <button onClick={onClick} disabled={loading}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-opacity disabled:opacity-50 ${LABELS_ASSIN[proxima.tipo].cor}`}>
          <PenLine size={11} />
          {loading ? 'A registar…' : LABELS_ASSIN[proxima.tipo].label}
        </button>
      )}
    </div>
  )
}

const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const FASE_DOT = {
  criacao:    { cor: 'bg-amber-400',  label: 'Criação'    },
  preparacao: { cor: 'bg-orange-500', label: 'Preparação' },
  execucao:   { cor: 'bg-green-400',  label: 'Execução'   },
  concluido:  { cor: 'bg-blue-400',   label: 'Concluído'  },
}

const derivarFase = (ev) => {
  if (!ev) return null
  const f = ev.fase
  if (f === 'concluido' || f === 'faturado') return 'concluido'
  if (f === 'execucao')  return 'execucao'
  if (f === 'preparacao') return 'preparacao'
  if (f === 'criacao')   return 'criacao'
  // fallback via status quando fase ainda não foi definida
  if (ev.status === 'realizado') return 'concluido'
  if (['confirmado', 'pré-confirmado', 'validação', 'aceitação', 'trocado'].includes(ev.status)) return 'preparacao'
  return 'criacao'
}

const ESTADOS_TAREFA = ['em curso', 'a validar', 'concluída']

const ESTADO_COR = {
  'concluída': 'bg-green-400/15 border-green-400/40 text-green-400',
  'concluida': 'bg-green-400/15 border-green-400/40 text-green-400',
  'em curso':  'bg-blue-400/15 border-blue-400/40 text-blue-400',
  'a validar': 'bg-amber-400/15 border-amber-400/40 text-amber-400',
  'a fazer':   'bg-surface-2 border-border text-accent-muted',
}

function ModalTarefa({ tarefa, onFechar, onGuardar }) {
  const [estadoSel, setEstadoSel]   = useState(null)
  const [aGuardar, setAGuardar]     = useState(false)

  const confirmar = async () => {
    if (!estadoSel || estadoSel === tarefa.estado) return
    setAGuardar(true)
    try {
      await colaboradorApi.actualizarEstadoTarefa(tarefa.id, estadoSel)
      onGuardar(tarefa.id, estadoSel)
    } catch (e) {
      alert('Não foi possível atualizar: ' + e.message)
      setAGuardar(false)
    }
  }

  const bloqueada = ['concluída', 'concluida'].includes(tarefa.estado)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ClipboardList size={14} className="text-accent-muted shrink-0" />
          <span className="text-sm font-bold text-accent flex-1 truncate">{tarefa.tarefa}</span>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent transition-colors">
            <X size={16} />
          </button>
        </div>
        {/* Corpo */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {/* Estado actual */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2">Estado</p>
            {!bloqueada ? (
              <div className="flex flex-wrap gap-1.5">
                {ESTADOS_TAREFA.map(s => {
                  const isActual = s === tarefa.estado
                  const isSel    = s === estadoSel
                  return (
                    <button key={s} onClick={() => setEstadoSel(isActual && !isSel ? null : s)}
                      disabled={aGuardar}
                      className={[
                        'px-3 py-1 rounded-full text-[12px] font-semibold border transition-all capitalize disabled:opacity-40',
                        isSel && !isActual
                          ? 'ring-2 ring-offset-1 ring-offset-surface-1 ' + (ESTADO_COR[s] ?? 'bg-surface-2 border-border text-accent ring-white/30')
                          : isActual
                            ? (ESTADO_COR[s] ?? 'bg-surface-2 border-border text-accent-muted')
                            : 'bg-surface-2 border-border/60 text-accent-subtle hover:text-accent hover:border-white/20',
                      ].join(' ')}>
                      {s}
                    </button>
                  )
                })}
              </div>
            ) : (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${ESTADO_COR[tarefa.estado] ?? 'bg-surface-2 border-border text-accent-muted'}`}>
                {tarefa.estado}
              </span>
            )}
          </div>

          {tarefa.data_conclusao && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-0.5">Data limite</p>
              <p className="text-sm text-accent-muted flex items-center gap-1.5">
                <Clock size={12} className="shrink-0" />
                {dataLonga(tarefa.data_conclusao)}{tarefa.hora ? ` · ${hhmm(tarefa.hora)}` : ''}
              </p>
            </div>
          )}
          {tarefa.tipo && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-0.5">Tipo</p>
              <p className="text-sm text-accent-muted">{tarefa.tipo}{tarefa.recorrencia ? ` · ${tarefa.recorrencia}` : ''}</p>
            </div>
          )}
          {tarefa.criado_por && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-0.5">Criado por</p>
              <p className="text-sm text-accent-muted">{tarefa.criado_por}</p>
            </div>
          )}
          {tarefa.notas_operacionais && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-1">Notas</p>
              <p className="text-sm text-accent-muted leading-relaxed whitespace-pre-line">{tarefa.notas_operacionais}</p>
            </div>
          )}

          {/* Botão confirmar */}
          {estadoSel && estadoSel !== tarefa.estado && (
            <button onClick={confirmar} disabled={aGuardar}
              className="mt-1 w-full py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent font-semibold text-sm hover:bg-accent/30 transition-colors disabled:opacity-50">
              {aGuardar ? 'A guardar…' : `Confirmar → ${estadoSel}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CardNav({ to, Icone, rotulo }) {
  return (
    <Link to={to}
      className="group flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-surface-1 border border-border hover:border-white/20 active:scale-[0.98] transition-all">
      <span className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center shrink-0 text-accent-muted group-hover:text-accent transition-colors">
        <Icone size={20} />
      </span>
      <span className="text-sm font-semibold text-accent">{rotulo}</span>
      <ChevronRight size={16} className="ml-auto text-accent-subtle group-hover:text-accent transition-colors shrink-0" />
    </Link>
  )
}

export function ColaboradorDashboard() {
  const { colaborador, actualizarFoto } = useColaboradorStore()
  const { proxima: proximaAssin, registar: registarAssin, tiposFeitos } = useAssinaturaDia(colaborador?.id ?? null)
  const [loading, setLoading]           = useState(true)
  const [eventos, setEventos]           = useState([])
  const [mapaTecnicos, setMapaTecnicos] = useState({})
  const [tarefas, setTarefas]           = useState([])
  const [ocorrencia, setOcorrencia]         = useState(null)
  const [aEnviarFoto, setAEnviarFoto]       = useState(false)
  const [eventoAberto, setEventoAberto]     = useState(null)
  const [tarefaAberta, setTarefaAberta]     = useState(null)
  const [ocorrenciaAberta, setOcorrenciaAberta] = useState(null) // { oc, intervencoes }
  const [prepAberta, setPrepAberta]             = useState(null)
  const fileRef = useRef(null)

  const abrirOcorrencia = async (oc) => {
    const [{ data: fullOc }, { data: ivs }] = await Promise.all([
      supabase.from('ocorrencias').select('*, espacos(nome)').eq('id', oc.id).single(),
      supabase.from('ocorrencias_intervencoes').select('*').eq('ocorrencia_id', oc.id).order('created_at', { ascending: true }),
    ])
    setOcorrenciaAberta({ oc: fullOc ?? oc, intervencoes: ivs ?? [] })
  }

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)
    Promise.all([
      colaboradorApi.eventosDoTecnico(colaborador.id),
      colaboradorApi.listarColaboradores(),
      colaboradorApi.tarefasDoColaborador(colaborador.nome),
      supabase.from('ocorrencias').select('*, espacos(nome)')
        .in('status', ['aberta', 'em_processo'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])
      .then(([evs, colabs, tarefasData, { data: oc }]) => {
        if (!activo) return
        setEventos(evs)
        setMapaTecnicos(Object.fromEntries(colabs.map(c => [c.id, c.nome])))
        setTarefas(tarefasData)
        setOcorrencia(oc ?? null)
      })
      .catch(console.error)
      .finally(() => activo && setLoading(false))
    return () => { activo = false }
  }, [colaborador])

  const hoje = hojeISO()
  const chaveOrdem = (e) => {
    const hora = e.hora_instalacao ?? e.hora_inicio ?? '00:00'
    return `${e.data_evento ?? '9999-99-99'}T${hora}`
  }

  // Hora actual em HH:MM para comparar com eventos de hoje
  const agoraHHMM = (() => {
    const n = new Date()
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
  })()

  const proximos = eventos
    .filter(e => {
      if (!e.meu || !e.data_evento) return false
      if (e.data_evento > hoje) return true          // dias futuros — sempre incluir
      if (e.data_evento < hoje) return false         // dias passados — excluir
      // hoje: incluir se ainda não terminou
      const fim    = e.hora_fim?.slice(0, 5)
      const inicio = e.hora_inicio?.slice(0, 5)
      if (fim && inicio) {
        // evento cruza meia-noite (ex: 18:30 → 00:00) → ainda activo hoje
        if (fim <= inicio) return true
        return fim > agoraHHMM
      }
      if (fim)    return fim    > agoraHHMM
      if (inicio) return inicio > agoraHHMM
      return true  // sem hora definida — incluir
    })
    .sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)))
  const proximoEvento = proximos[0] ?? null

  const proximaTarefa = tarefas.find(t =>
    !['concluída', 'concluida', 'cancelada'].includes(t.estado) &&
    (!t.data_conclusao || t.data_conclusao >= hoje)
  ) ?? null

  const proximaPreparacao = eventos
    .filter(e => e.meu && e.data_preparacao && e.data_preparacao >= hoje)
    .sort((a, b) => a.data_preparacao.localeCompare(b.data_preparacao))[0] ?? null

  const localProximo   = proximoEvento?.espacos?.nome || proximoEvento?.cliente || null
  const instalProximo  = proximoEvento?.hora_instalacao
    ? [dataLonga(proximoEvento.dia_instalacao || proximoEvento.data_evento), hhmm(proximoEvento.hora_instalacao)].filter(Boolean).join(' · ')
    : null

  const onUploadFoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAEnviarFoto(true)
    try {
      const url = await colaboradorApi.uploadFoto(colaborador.id, file)
      actualizarFoto(url)
    } catch (err) { alert('Não foi possível enviar a foto: ' + err.message) }
    finally {
      setAEnviarFoto(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) return <LoadingPage />

  return (
    <div className="grid lg:grid-cols-3 gap-4 lg:gap-8 items-start lg:items-center max-w-4xl mx-auto w-full">

      {/* ── Esquerda: saudação + próximo evento clicável ── */}
      <div className="order-2 lg:order-1">
        <p className="text-3xl sm:text-4xl font-black text-accent leading-tight text-center lg:text-left">
          Olá, {colaborador?.nome}!
        </p>

        {/* Assinatura de hoje — separada do próximo evento */}
        {(proximaAssin || tiposFeitos.length > 0) && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-surface-1 p-4">
            <BotaoAssinatura proxima={proximaAssin} registar={registarAssin} tiposFeitos={tiposFeitos} />
          </div>
        )}

        {proximoEvento ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4">
            <button onClick={() => setEventoAberto(proximoEvento)}
              className="w-full text-left hover:opacity-80 active:scale-[0.99] transition-all group">
              {(() => {
                const fase = derivarFase(proximoEvento)
                const dot  = FASE_DOT[fase] ?? FASE_DOT.criacao
                return (
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 group-hover:text-amber-400 transition-colors flex-1">
                      Próximo evento →
                    </p>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot.cor}`} title={dot.label} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle/50">{dot.label}</span>
                  </div>
                )
              })()}
              <p className="text-lg font-bold text-accent leading-snug">{proximoEvento.evento}</p>
              {localProximo && <p className="text-sm text-accent-muted mt-0.5">{localProximo}</p>}
              <div className="mt-2 flex flex-col gap-1.5">
                {instalProximo && (
                  <span className="flex items-center gap-2 text-[15px] text-accent font-semibold">
                    <Wrench size={13} className="text-accent shrink-0" />
                    Instalação: {instalProximo}
                  </span>
                )}
                <span className="flex items-center gap-2 text-sm text-accent-muted">
                  <CalendarClock size={13} className="text-accent-subtle shrink-0" />
                  <span className="capitalize">{dataLonga(proximoEvento.data_evento)}</span>
                  {proximoEvento.hora_inicio && <span>· {hhmm(proximoEvento.hora_inicio)}</span>}
                </span>
              </div>
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2">Próximo evento</p>
            <p className="text-sm text-accent-subtle">Sem eventos agendados de momento.</p>
          </div>
        )}

        {/* Preparação */}
        {proximaPreparacao && (
          <div onClick={() => setPrepAberta(proximaPreparacao)}
            className="mt-3 rounded-2xl border border-purple-500/20 bg-purple-500/[0.07] p-4 cursor-pointer hover:border-purple-500/40 active:scale-[0.99] transition-all">
            <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400/70 mb-2">
              Preparação
            </p>
            <p className="text-base font-bold text-accent leading-snug">{dataLonga(proximaPreparacao.data_preparacao)}</p>
            {proximaPreparacao.notas_preparacao && (
              <p className="text-sm text-accent-muted mt-1 leading-relaxed line-clamp-2">{proximaPreparacao.notas_preparacao}</p>
            )}
            <p className="text-[11px] text-accent-subtle/60 mt-2">→ {proximaPreparacao.evento}</p>
          </div>
        )}

        {/* Próxima tarefa */}
        <div
          className={proximaTarefa ? 'mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4 cursor-pointer hover:border-white/20 active:scale-[0.99] transition-all' : 'mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4'}
          onClick={proximaTarefa ? () => setTarefaAberta(proximaTarefa) : undefined}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-2 flex items-center gap-1.5">
            <ClipboardList size={11} />
            Próxima tarefa
          </p>
          {proximaTarefa
            ? <>
                <p className="text-sm font-semibold text-accent leading-snug">{proximaTarefa.tarefa}</p>
                {proximaTarefa.data_conclusao && (
                  <p className="text-[11px] text-accent-muted mt-1">{dataLonga(proximaTarefa.data_conclusao)}{proximaTarefa.hora ? ` · ${hhmm(proximaTarefa.hora)}` : ''}</p>
                )}
              </>
            : <p className="text-sm text-accent-subtle">Sem tarefas pendentes.</p>
          }
        </div>

        {/* Ocorrência mais antiga em aberto */}
        <div
          className={ocorrencia ? 'mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4 cursor-pointer hover:border-white/20 active:scale-[0.99] transition-all' : 'mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4'}
          onClick={ocorrencia ? () => abrirOcorrencia(ocorrencia) : undefined}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2 flex items-center gap-1.5">
            <AlertTriangle size={11} />
            Ocorrência em aberto
          </p>
          {ocorrencia
            ? <>
                <p className="text-sm font-semibold text-accent leading-snug">{ocorrencia.titulo}</p>
                {ocorrencia.espacos?.nome && <p className="text-[11px] text-accent-muted mt-0.5">{ocorrencia.espacos.nome}</p>}
              </>
            : <p className="text-sm text-accent-subtle">Sem ocorrências em aberto.</p>
          }
        </div>
      </div>

      {/* ── Centro: avatar ── */}
      <div className="order-1 lg:order-2 w-full" style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-block', position: 'relative' }}>
          <Avatar nome={colaborador?.nome} foto={colaborador?.foto_url} tamanho="xl" anel />
          <button onClick={() => fileRef.current?.click()} disabled={aEnviarFoto} title="Trocar foto"
            className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-surface-3 border border-border flex items-center justify-center text-accent-muted hover:text-accent hover:bg-surface-4 transition-colors disabled:opacity-50">
            <Camera size={15} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUploadFoto} />
        </div>
        {aEnviarFoto && <p className="text-xs text-accent-subtle mt-2">A enviar…</p>}
      </div>


      {eventoAberto && (
        <EventoModal
          evento={eventoAberto}
          mapaTecnicos={mapaTecnicos}
          tarefas={tarefas}
          onFechar={() => setEventoAberto(null)}
        />
      )}

      {/* Modal tarefa */}
      {tarefaAberta && (
        <ModalTarefa
          tarefa={tarefaAberta}
          onFechar={() => setTarefaAberta(null)}
          onGuardar={(id, novoEstado) => {
            setTarefas(prev => prev.map(t => t.id === id ? { ...t, estado: novoEstado } : t))
            setTarefaAberta(null)
          }}
        />
      )}

      {/* Modal ocorrência — usa OcorrenciaDetalhe igual à aba Ocorrências */}
      {ocorrenciaAberta && (
        <OcorrenciaDetalhe
          ocorrencia={ocorrenciaAberta.oc}
          intervencoes={ocorrenciaAberta.intervencoes}
          nomeUtilizador={colaborador?.nome}
          podeEditar={false}
          onFechar={() => setOcorrenciaAberta(null)}
          onAtualizar={() => abrirOcorrencia(ocorrenciaAberta.oc)}
        />
      )}

      {/* Modal preparação */}
      {prepAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPrepAberta(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-blue-500/30 bg-surface-1 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-blue-500/20 bg-blue-500/[0.06] flex items-center gap-2">
              <Wrench size={14} className="text-blue-400 shrink-0" />
              <span className="text-sm font-bold text-blue-300 flex-1">Preparação</span>
              <button onClick={() => setPrepAberta(null)} className="text-accent-subtle hover:text-accent transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-0.5">Evento</p>
                <p className="text-sm font-semibold text-accent">{prepAberta.evento}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-0.5">Data de preparação</p>
                <p className="text-sm text-accent-muted">{dataLonga(prepAberta.data_preparacao)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-0.5">Data do evento</p>
                <p className="text-sm text-accent-muted">{dataLonga(prepAberta.data_evento)}</p>
              </div>
              {prepAberta.notas_preparacao ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-1">Notas</p>
                  <p className="text-sm text-accent-muted leading-relaxed whitespace-pre-line">{prepAberta.notas_preparacao}</p>
                </div>
              ) : (
                <p className="text-xs text-accent-subtle/50 italic">Sem notas de preparação.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
