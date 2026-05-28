import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { pt } from 'date-fns/locale'
import { X, Search, Columns2, AlignJustify } from 'lucide-react'
import { useMesStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

const isoData    = (d) => format(d, 'yyyy-MM-dd')
const hhmm       = (t) => t?.slice(0, 5) ?? null
const isFds      = (d) => [5, 6].includes(new Date(d + 'T00:00:00').getDay())
const nomeDiaSem = (d) => format(new Date(d + 'T00:00:00'), 'EEE', { locale: pt })
const dataFmt    = (d) => format(new Date(d + 'T00:00:00'), 'dd/MM')

// ── Modal atribuição de técnico ───────────────────────────────────────────────
function ModalAtribuicao({ aberto, celula, tecnicos, onFechar, onGuardado }) {
  const [tecnicoId, setTecnicoId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTecnicoId(celula?.evento?.tecnico_id ?? celula?.agendamento?.tecnico_id ?? '')
  }, [aberto, celula])

  const guardar = async () => {
    if (!celula) return
    setLoading(true)
    try {
      if (celula.evento?.id) {
        await supabase.from('supa_eventos')
          .update({ tecnico_id: tecnicoId || null })
          .eq('id', celula.evento.id)
      } else {
        const ag = celula.agendamento
        if (ag?.id) {
          if (tecnicoId) {
            await supabase.from('agendamentos_tecnicos')
              .update({ tecnico_id: tecnicoId, folga: false })
              .eq('id', ag.id)
          } else {
            await supabase.from('agendamentos_tecnicos').delete().eq('id', ag.id)
          }
        } else if (tecnicoId) {
          await supabase.from('agendamentos_tecnicos').insert({
            data: celula.data,
            espaco_id: celula.espaco_id,
            tecnico_id: tecnicoId,
            folga: false,
          })
        }
      }
      onGuardado()
      onFechar()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} largura="max-w-sm">
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-accent">Atribuir Técnico</p>
            {celula && <p className="text-[11px] text-accent-subtle mt-0.5">{celula.espaco} · {celula.data}</p>}
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {(celula?.evento || celula?.dj) && (
            <div className="p-3 rounded-lg bg-surface-2 border border-border/50 text-[11px] flex flex-col gap-1">
              {celula.evento && <span className="text-accent-muted"><span className="text-accent-subtle">Evento:</span> {celula.evento.evento}</span>}
              {celula.evento?.hora_instalacao && <span className="text-accent-muted"><span className="text-accent-subtle">Inst.:</span> {hhmm(celula.evento.hora_instalacao)}</span>}
              {celula.evento?.hora_inicio && <span className="text-accent-muted"><span className="text-accent-subtle">Início:</span> {hhmm(celula.evento.hora_inicio)}</span>}
              {celula.dj && <span className="text-accent-muted"><span className="text-accent-subtle">DJ:</span> {celula.dj}</span>}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider">Técnico</label>
            <select
              value={tecnicoId}
              onChange={e => setTecnicoId(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent focus:outline-none focus:border-white/30"
            >
              <option value="">— Nenhum —</option>
              {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variante="secundario" onClick={onFechar} disabled={loading}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>{loading ? 'A guardar…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal folgas ──────────────────────────────────────────────────────────────
function ModalFolga({ aberto, data, tecnicos, folgasHoje, agendamentos, onFechar, onGuardado }) {
  const [seleccionados, setSeleccionados] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setSeleccionados(folgasHoje ?? [])
  }, [aberto, folgasHoje])

  const toggle = (id) => setSeleccionados(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  const guardar = async () => {
    setLoading(true)
    try {
      const folgasAntigas = agendamentos.filter(a => a.data === data && a.folga)
      if (folgasAntigas.length > 0)
        await supabase.from('agendamentos_tecnicos').delete().in('id', folgasAntigas.map(a => a.id))
      if (seleccionados.length > 0)
        await supabase.from('agendamentos_tecnicos').insert(
          seleccionados.map(tid => ({ data, tecnico_id: tid, folga: true }))
        )
      onGuardado()
      onFechar()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} largura="max-w-xs">
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-accent">Folgas</p>
            {data && <p className="text-[11px] text-accent-subtle mt-0.5">{dataFmt(data)} · {nomeDiaSem(data)}</p>}
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2">
          {tecnicos.map(t => (
            <label key={t.id} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={seleccionados.includes(t.id)} onChange={() => toggle(t.id)}
                className="w-4 h-4 rounded border-border accent-status-confirmado" />
              <span className="text-sm text-accent">{t.nome}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variante="secundario" onClick={onFechar} disabled={loading}>Cancelar</Button>
          <Button onClick={guardar} disabled={loading}>{loading ? 'A guardar…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// Colunas de um grupo de evento
const GROUP_COLS = ['Técnico', 'Espaço', 'Evento', 'Hora Inst.', 'Hora Início', 'DJ']

// ── Página principal ──────────────────────────────────────────────────────────
export function ApoioTecnico() {
  const { anoMes } = useMesStore()
  const [loading, setLoading]           = useState(true)
  const [tecnicos, setTecnicos]         = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [eventos, setEventos]           = useState([])
  const [slots, setSlots]               = useState([])
  const [espacos, setEspacos]           = useState([])
  const [modalAtrib, setModalAtrib]     = useState(null)
  const [modalFolga, setModalFolga]     = useState(null)
  const [filtroEspaco, setFiltroEspaco]   = useState('')
  const [filtroTecnico, setFiltroTecnico] = useState('')
  const [pesquisa, setPesquisa]           = useState('')
  const [vista, setVista]                 = useState('colunas') // 'colunas' | 'linhas'

  const { dataInicio, dataFim, dias } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref    = new Date(ano, mes - 1, 1)
    const inicio = startOfMonth(ref)
    const fim    = endOfMonth(ref)
    return { dataInicio: isoData(inicio), dataFim: isoData(fim), dias: eachDayOfInterval({ start: inicio, end: fim }) }
  }, [anoMes])

  const carregar = useCallback(async () => {
    setLoading(true)
    const [tRes, eRes, agRes, evRes, slRes] = await Promise.all([
      supabase.from('tecnicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('espacos').select('id, nome').eq('activo', true).order('nome'),
      supabase.from('agendamentos_tecnicos').select('*').gte('data', dataInicio).lte('data', dataFim),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, data_evento, hora_inicio, hora_instalacao, status, tecnico_id')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim).neq('status', 'cancelado'),
      supabase.from('agenda')
        .select('id, espaco_id, data, dj_nome, dj_id, tipo_slot, estado, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim)
        .not('estado', 'in', '("cancelado","sem_efeito","faltou")'),
    ])
    if (!tRes.error) setTecnicos(tRes.data ?? [])
    if (!eRes.error) setEspacos(eRes.data ?? [])
    if (!agRes.error) setAgendamentos(agRes.data ?? [])
    if (!evRes.error) setEventos(evRes.data ?? [])
    if (!slRes.error) setSlots(slRes.data ?? [])
    setLoading(false)
  }, [dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setFiltroEspaco(''); setFiltroTecnico(''); setPesquisa('') }, [anoMes])

  const agIdx = useMemo(() => {
    const idx = {}
    agendamentos.filter(a => !a.folga && a.espaco_id).forEach(a => { idx[`${a.data}|${a.espaco_id}`] = a })
    return idx
  }, [agendamentos])

  const folgasIdx = useMemo(() => {
    const idx = {}
    agendamentos.filter(a => a.folga).forEach(a => {
      if (!idx[a.data]) idx[a.data] = []
      idx[a.data].push(a.tecnico_id)
    })
    return idx
  }, [agendamentos])

  const evIdx = useMemo(() => {
    const idx = {}
    eventos.forEach(e => { const k = `${e.data_evento}|${e.espaco_id}`; if (!idx[k]) idx[k] = e })
    return idx
  }, [eventos])

  const djIdx = useMemo(() => {
    const idx = {}
    slots.forEach(s => {
      // Nome: nome artístico do join > nome do join > dj_nome em texto livre
      const nome = s.djs?.nome_artistico ?? s.djs?.nome ?? s.dj_nome
      if (!nome) return
      const k = `${s.data}|${s.espaco_id}`
      if (!idx[k]) idx[k] = []
      if (!idx[k].includes(nome)) idx[k].push(nome)
    })
    return idx
  }, [slots])

  const espacosActivos = useMemo(() => {
    const ids = new Set([...eventos.map(e => e.espaco_id), ...slots.map(s => s.espaco_id)])
    return espacos.filter(e => ids.has(e.id))
  }, [espacos, eventos, slots])

  const linhasBrutas = useMemo(() => {
    const result = []
    dias.forEach(dia => {
      const dataStr = isoData(dia)
      const linhas  = []
      espacos.forEach(espaco => {
        const k     = `${dataStr}|${espaco.id}`
        const ev    = evIdx[k]
        const dj    = djIdx[k]
        if (!ev) return
        const ag      = agIdx[k] ?? null
        const tecId   = ev?.tecnico_id ?? ag?.tecnico_id ?? null
        const tecNome = tecId ? tecnicos.find(t => t.id === tecId)?.nome ?? null : null
        linhas.push({ dataStr, dia, espaco_id: espaco.id, espacoNome: espaco.nome.trim(), ev, djs: dj ?? [], ag, tecNome })
      })
      if (linhas.length === 0) return
      result.push({ dataStr, dia, linhas, folgas: folgasIdx[dataStr] ?? [] })
    })
    return result
  }, [dias, espacos, evIdx, djIdx, agIdx, folgasIdx, tecnicos])

  const linhasPorDia = useMemo(() => {
    const q = pesquisa.trim().toLowerCase()
    // ID do técnico seleccionado
    const tecFiltroId = filtroTecnico
      ? tecnicos.find(t => t.nome === filtroTecnico)?.id ?? null
      : null

    return linhasBrutas.map(grupo => {
      let linhas = grupo.linhas

      if (filtroEspaco) linhas = linhas.filter(l => l.espaco_id === filtroEspaco)

      // Filtro por técnico: mostra linhas onde este técnico está atribuído
      // OU dias onde está de folga (mantém o dia visível mesmo que sem linha activa)
      if (tecFiltroId) {
        linhas = linhas.filter(l => {
          const tecId = l.ev?.tecnico_id ?? l.ag?.tecnico_id ?? null
          return tecId === tecFiltroId
        })
      }

      if (q) linhas = linhas.filter(l =>
        l.espacoNome.toLowerCase().includes(q) ||
        (l.ev?.evento ?? '').toLowerCase().includes(q) ||
        (l.djs?.join(' ') ?? '').toLowerCase().includes(q) ||
        (l.tecNome ?? '').toLowerCase().includes(q)
      )

      // Se filtro por técnico: manter o dia se tem folga desse técnico mesmo sem linhas
      const temFolgaDoTecnico = tecFiltroId && (grupo.folgas ?? []).includes(tecFiltroId)
      if (linhas.length === 0 && !temFolgaDoTecnico) return null

      return { ...grupo, linhas }
    }).filter(Boolean)
  }, [linhasBrutas, filtroEspaco, filtroTecnico, pesquisa, tecnicos])

  // Número máximo de eventos num único dia (define quantos grupos de colunas criar)
  const maxGrupos = useMemo(() =>
    Math.max(1, ...linhasPorDia.map(g => g.linhas.length))
  , [linhasPorDia])

  if (loading) return <LoadingPage />

  const thCls = 'px-2 py-2 text-left text-[10px] font-bold text-accent-subtle uppercase tracking-widest whitespace-nowrap'
  const sepThCls = 'w-0.5 p-0 bg-border'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filtros ── */}
      <div className="shrink-0 border-b border-border/50 bg-surface-0/40">

        {/* Linha 1 — espaços + pesquisa */}
        <div className="px-5 py-2 flex items-center justify-between gap-3 border-b border-border/30">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mr-2">Espaço</span>
            <button onClick={() => setFiltroEspaco('')}
              className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
                filtroEspaco === '' ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
              Todos
            </button>
            {espacosActivos.map(e => (
              <button key={e.id} onClick={() => setFiltroEspaco(filtroEspaco === e.id ? '' : e.id)}
                className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
                  filtroEspaco === e.id ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
                {e.nome.trim()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle vista */}
            <div className="flex bg-surface-2 border border-border rounded p-0.5">
              <button
                onClick={() => setVista('colunas')}
                title="Vista em colunas"
                className={clsx('p-1.5 rounded transition-colors', vista === 'colunas' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}
              >
                <Columns2 size={13} />
              </button>
              <button
                onClick={() => setVista('linhas')}
                title="Vista em linhas"
                className={clsx('p-1.5 rounded transition-colors', vista === 'linhas' ? 'bg-surface-4 text-accent' : 'text-accent-muted hover:text-accent')}
              >
                <AlignJustify size={13} />
              </button>
            </div>

            {/* Pesquisa */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
              <input type="text" placeholder="Pesquisar…" value={pesquisa} onChange={e => setPesquisa(e.target.value)}
                className="pl-8 pr-7 py-1.5 bg-surface-2 border border-border rounded text-xs text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/20 w-44" />
              {pesquisa && (
                <button onClick={() => setPesquisa('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent">
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Linha 2 — colaboradores */}
        <div className="px-5 py-2 flex items-center gap-1">
          <span className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mr-2">Apoio</span>
          <button onClick={() => setFiltroTecnico('')}
            className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
              filtroTecnico === '' ? 'bg-surface-3 text-accent border-white/20 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
            Todos
          </button>
          {tecnicos.map(t => (
            <button key={t.id} onClick={() => setFiltroTecnico(filtroTecnico === t.nome ? '' : t.nome)}
              className={clsx('px-3 py-1.5 rounded text-xs transition-colors border',
                filtroTecnico === t.nome ? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30 font-medium' : 'bg-surface-2 text-accent-muted border-border hover:text-accent')}>
              {t.nome}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="flex-1 overflow-auto">

        {/* ════ VISTA COLUNAS ════ */}
        {vista === 'colunas' && (
          <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: 50 }} />
              {Array.from({ length: maxGrupos }, (_, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <col style={{ width: 2 }} />}
                  <col style={{ width: 95 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 78 }} />
                  <col style={{ width: 78 }} />
                  <col style={{ width: 110 }} />
                </React.Fragment>
              ))}
              <col style={{ width: 100 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-2 border-b-2 border-border">
              <tr>
                <th className={thCls}>Dia</th>
                <th className={thCls}>Data</th>
                {Array.from({ length: maxGrupos }, (_, i) => [
                  i > 0 && <th key={`sh-sep-${i}`} className={sepThCls} />,
                  <th key={`sh-tec-${i}`} className={clsx(thCls, i > 0 && 'pl-3')}>Técnico</th>,
                  <th key={`sh-esp-${i}`} className={thCls}>Espaço</th>,
                  <th key={`sh-ev-${i}`}  className={thCls}>Evento</th>,
                  <th key={`sh-ins-${i}`} className={clsx(thCls, 'text-center')}>Hora Inst.</th>,
                  <th key={`sh-ini-${i}`} className={clsx(thCls, 'text-center')}>Hora Início</th>,
                  <th key={`sh-dj-${i}`}  className={thCls}>DJ</th>,
                ])}
                <th className={clsx(thCls, 'border-l border-border/60')}>Folga</th>
              </tr>
            </thead>
            <tbody>
              {linhasPorDia.length === 0 && (
                <tr><td colSpan={99} className="py-16 text-center text-accent-subtle/40">Sem eventos activos neste mês.</td></tr>
              )}
              {linhasPorDia.map(({ dataStr, dia, linhas, folgas }) => {
                const nomesEmFolga = folgas.map(tid => tecnicos.find(t => t.id === tid)?.nome ?? '?').join(' · ')
                return (
                  <tr key={dataStr} className={clsx('border-b border-border/30 hover:bg-surface-2/20 transition-colors align-middle', isFds(dataStr) ? 'bg-blue-400/[0.04]' : 'bg-surface-0')}>
                    <td onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                      className="px-3 py-2 text-accent-muted capitalize font-medium whitespace-nowrap border-r border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors">
                      {format(dia, 'EEE', { locale: pt })}
                    </td>
                    <td onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                      className="px-2 py-2 text-accent-subtle tabular-nums whitespace-nowrap border-r border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors">
                      {format(dia, 'dd/MM')}
                    </td>
                    {Array.from({ length: maxGrupos }, (_, i) => {
                      const linha = linhas[i] ?? null
                      return [
                        i > 0 && <td key={`sep-${dataStr}-${i}`} className="p-0 bg-border w-0.5" />,
                        <td key={`tec-${dataStr}-${i}`}
                          onClick={linha ? () => setModalAtrib({ data: dataStr, espaco_id: linha.espaco_id, espaco: linha.espacoNome, agendamento: linha.ag, evento: linha.ev, dj: linha.djs?.join(', ') }) : undefined}
                          className={clsx('px-2 py-2 whitespace-nowrap', i > 0 && 'pl-3', linha ? 'cursor-pointer hover:bg-status-confirmado/5 transition-colors' : '')}>
                          {linha?.tecNome ? <span className="text-status-confirmado font-semibold">{linha.tecNome}</span> : linha ? <span className="text-border/30 text-[10px]">+ atribuir</span> : null}
                        </td>,
                        <td key={`esp-${dataStr}-${i}`} className="px-2 py-2 text-accent-muted font-medium whitespace-nowrap">{linha?.espacoNome ?? ''}</td>,
                        <td key={`ev-${dataStr}-${i}`} className="px-2 py-2 text-accent-muted max-w-0"><span className="block truncate">{linha?.ev?.evento ?? ''}</span></td>,
                        <td key={`ins-${dataStr}-${i}`} className="px-2 py-2 text-center text-accent-subtle tabular-nums whitespace-nowrap">
                          {linha?.ev?.hora_instalacao ? hhmm(linha.ev.hora_instalacao) : linha ? <span className="text-border/20">—</span> : null}
                        </td>,
                        <td key={`ini-${dataStr}-${i}`} className="px-2 py-2 text-center text-accent-subtle tabular-nums whitespace-nowrap">
                          {linha?.ev?.hora_inicio ? hhmm(linha.ev.hora_inicio) : linha ? <span className="text-border/20">—</span> : null}
                        </td>,
                        <td key={`dj-${dataStr}-${i}`} className="px-2 py-2 text-accent-muted whitespace-nowrap">
                          {linha ? linha.djs?.length ? <span>{linha.djs.join(' · ')}</span> : <span className="text-border/20">—</span> : null}
                        </td>,
                      ]
                    })}
                    <td onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                      className="px-2 py-2 border-l border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors whitespace-nowrap">
                      {nomesEmFolga ? <span className="text-orange-400 font-medium text-[11px]">{nomesEmFolga}</span> : <span className="text-border/20 text-[10px]">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* ════ VISTA LINHAS ════ */}
        {vista === 'linhas' && (
          <table className="w-full text-xs border-collapse">
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: 50 }} />
              <col style={{ width: 95 }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 78 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-surface-2 border-b-2 border-border">
              <tr>
                <th className={thCls}>Dia</th>
                <th className={thCls}>Data</th>
                <th className={thCls}>Técnico</th>
                <th className={thCls}>Espaço</th>
                <th className={thCls}>Evento</th>
                <th className={clsx(thCls, 'text-center')}>Hora Inst.</th>
                <th className={clsx(thCls, 'text-center')}>Hora Início</th>
                <th className={thCls}>DJ</th>
                <th className={clsx(thCls, 'border-l border-border/60')}>Folga</th>
              </tr>
            </thead>
            <tbody>
              {linhasPorDia.length === 0 && (
                <tr><td colSpan={9} className="py-16 text-center text-accent-subtle/40">Sem eventos activos neste mês.</td></tr>
              )}
              {linhasPorDia.map(({ dataStr, dia, linhas, folgas }) => {
                const nomesEmFolga = folgas.map(tid => tecnicos.find(t => t.id === tid)?.nome ?? '?').join(' · ')
                const rowSpan = linhas.length || 1
                return linhas.map((linha, li) => (
                  <tr key={`${dataStr}-${linha.espaco_id}`}
                    className={clsx(
                      'hover:bg-surface-2/20 transition-colors',
                      li < linhas.length - 1 ? 'border-b border-border/10' : 'border-b border-border/30',
                      isFds(dataStr) ? 'bg-blue-400/[0.04]' : 'bg-surface-0'
                    )}
                  >
                    {/* Dia — rowSpan */}
                    {li === 0 && (
                      <td rowSpan={rowSpan} onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                        className="px-3 py-2 text-accent-muted capitalize font-medium whitespace-nowrap align-top border-r border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors">
                        {format(dia, 'EEE', { locale: pt })}
                      </td>
                    )}
                    {/* Data — rowSpan */}
                    {li === 0 && (
                      <td rowSpan={rowSpan} onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                        className="px-2 py-2 text-accent-subtle tabular-nums whitespace-nowrap align-top border-r border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors">
                        {format(dia, 'dd/MM')}
                      </td>
                    )}
                    {/* Técnico */}
                    <td onClick={() => setModalAtrib({ data: dataStr, espaco_id: linha.espaco_id, espaco: linha.espacoNome, agendamento: linha.ag, evento: linha.ev, dj: linha.djs?.join(', ') })}
                      className="px-2 py-2 cursor-pointer hover:bg-status-confirmado/5 transition-colors whitespace-nowrap">
                      {linha.tecNome ? <span className="text-status-confirmado font-semibold">{linha.tecNome}</span> : <span className="text-border/30 text-[10px]">+ atribuir</span>}
                    </td>
                    {/* Espaço */}
                    <td className="px-2 py-2 text-accent-muted font-medium whitespace-nowrap">{linha.espacoNome}</td>
                    {/* Evento */}
                    <td className="px-2 py-2 text-accent-muted max-w-0"><span className="block truncate">{linha.ev?.evento ?? <span className="text-border/20">—</span>}</span></td>
                    {/* Hora Inst. */}
                    <td className="px-2 py-2 text-center text-accent-subtle tabular-nums whitespace-nowrap">
                      {linha.ev?.hora_instalacao ? hhmm(linha.ev.hora_instalacao) : <span className="text-border/20">—</span>}
                    </td>
                    {/* Hora Início */}
                    <td className="px-2 py-2 text-center text-accent-subtle tabular-nums whitespace-nowrap">
                      {linha.ev?.hora_inicio ? hhmm(linha.ev.hora_inicio) : <span className="text-border/20">—</span>}
                    </td>
                    {/* DJ */}
                    <td className="px-2 py-2 text-accent-muted whitespace-nowrap">
                      {linha.djs?.length ? linha.djs.join(' · ') : <span className="text-border/20">—</span>}
                    </td>
                    {/* Folga — rowSpan */}
                    {li === 0 && (
                      <td rowSpan={rowSpan} onClick={() => setModalFolga({ data: dataStr })} title="Gerir folgas"
                        className="px-2 py-2 align-top border-l border-border/40 cursor-pointer hover:bg-orange-400/5 transition-colors whitespace-nowrap">
                        {nomesEmFolga ? <span className="text-orange-400 font-medium text-[11px]">{nomesEmFolga}</span> : <span className="text-border/20 text-[10px]">—</span>}
                      </td>
                    )}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        )}

      </div>

      <ModalAtribuicao
        aberto={!!modalAtrib} celula={modalAtrib} tecnicos={tecnicos}
        onFechar={() => setModalAtrib(null)}
        onGuardado={() => { setModalAtrib(null); carregar() }}
      />
      <ModalFolga
        aberto={!!modalFolga} data={modalFolga?.data ?? null} tecnicos={tecnicos}
        folgasHoje={folgasIdx[modalFolga?.data] ?? []} agendamentos={agendamentos}
        onFechar={() => setModalFolga(null)}
        onGuardado={() => { setModalFolga(null); carregar() }}
      />
    </div>
  )
}
