import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Camera, ChevronRight, CalendarClock, Wrench, LayoutList, PenLine, AlertTriangle } from 'lucide-react'
import { useColaboradorStore } from '@/store'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/colaborador/Avatar'
import { EventoModal } from '@/components/colaborador/EventoModal'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { hhmm, dataLonga } from '@/components/colaborador/format'
import { useAssinaturaDia } from '@/hooks/useAssinaturaDia'

const LABELS_ASSIN = {
  lmd_entrada:   { label: 'Entrada LMD',    cor: 'text-indigo-400 border-indigo-400/30 bg-indigo-400/[0.07]' },
  evento_saida:  { label: 'Fim de Evento',  cor: 'text-red-400   border-red-400/30   bg-red-400/[0.07]'   },
  lmd_saida:     { label: 'Saída LMD',      cor: 'text-red-400   border-red-400/30   bg-red-400/[0.07]'   },
}

function BotaoAssinatura({ proxima, registar }) {
  const [loading, setLoading]     = useState(false)
  const [registados, setRegistados] = useState([]) // [{tipo, hora}]

  if (!proxima && registados.length === 0) return null

  const onClick = async (e) => {
    e.stopPropagation()
    if (!proxima || !LABELS_ASSIN[proxima.tipo]) return
    setLoading(true)
    await registar(proxima.tipo, { eventoId: proxima.eventoId, agendamentoId: proxima.agendamentoId })
    const agora = new Date()
    const hora  = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
    setRegistados(prev => [...prev, { tipo: proxima.tipo, hora }])
    setLoading(false)
  }

  const podeAssinar = proxima && LABELS_ASSIN[proxima.tipo]

  return (
    <div className="mt-3 flex flex-col gap-1.5 items-end">
      {registados.map(({ tipo, hora }) => {
        const cfg = LABELS_ASSIN[tipo]
        return (
          <span key={tipo} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${cfg?.cor ?? ''}`}>
            <PenLine size={11} />
            {cfg?.label} · {hora}
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
  const { proxima: proximaAssin, registar: registarAssin } = useAssinaturaDia(colaborador?.id ?? null)
  const [loading, setLoading]           = useState(true)
  const [eventos, setEventos]           = useState([])
  const [mapaTecnicos, setMapaTecnicos] = useState({})
  const [tarefas, setTarefas]           = useState([])
  const [ocorrencia, setOcorrencia]     = useState(null)
  const [aEnviarFoto, setAEnviarFoto]   = useState(false)
  const [eventoAberto, setEventoAberto] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!colaborador) return
    let activo = true
    setLoading(true)
    Promise.all([
      colaboradorApi.eventosDoTecnico(colaborador.id),
      colaboradorApi.listarColaboradores(),
      colaboradorApi.tarefasDoColaborador(colaborador.nome),
      supabase.from('ocorrencias').select('id, titulo, status, created_at, espacos(nome)')
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

  const proximaTarefa = tarefas.find(t => !['concluída', 'concluida', 'cancelada'].includes(t.estado)) ?? null

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

        {proximoEvento ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-surface-1 p-4">
            <button onClick={() => setEventoAberto(proximoEvento)}
              className="w-full text-left hover:opacity-80 active:scale-[0.99] transition-all group">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-2 group-hover:text-amber-400 transition-colors">
                Próximo evento →
              </p>
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
            <BotaoAssinatura proxima={proximaAssin} registar={registarAssin} />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-surface-1 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2">Próximo evento</p>
            <p className="text-sm text-accent-subtle">Sem eventos agendados de momento.</p>
            <BotaoAssinatura proxima={proximaAssin} registar={registarAssin} />
          </div>
        )}

        {/* Preparação */}
        {proximaPreparacao && (
          <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70 mb-2">
              Preparação
            </p>
            <p className="text-base font-bold text-accent leading-snug">{dataLonga(proximaPreparacao.data_preparacao)}</p>
            {proximaPreparacao.notas_preparacao && (
              <p className="text-sm text-accent-muted mt-1 leading-relaxed">{proximaPreparacao.notas_preparacao}</p>
            )}
            <p className="text-[11px] text-accent-subtle/60 mt-2">→ {proximaPreparacao.evento}</p>
          </div>
        )}

        {/* Próxima tarefa */}
        <div className="mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2 flex items-center gap-1.5">
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
        <div className="mt-3 rounded-2xl border border-white/10 bg-surface-1 p-4">
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

      {/* ── Direita: navegação ── */}
      <div className="order-3 flex flex-col gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle mb-2">As minhas páginas</p>
        <CardNav to="/apoiot/agenda"      Icone={LayoutList}    rotulo="Agenda" />
      </div>

      {eventoAberto && (
        <EventoModal
          evento={eventoAberto}
          mapaTecnicos={mapaTecnicos}
          onFechar={() => setEventoAberto(null)}
        />
      )}
    </div>
  )
}
