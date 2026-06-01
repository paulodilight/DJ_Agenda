import { useState, useMemo, useCallback, useEffect } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { Users, Euro, CalendarDays, TrendingUp, Check, AlertTriangle, ChevronUp, SlidersHorizontal, Search, ArrowUpDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { djsApi, djMetaEspacoApi } from '@/lib/api'
import { useEspacos } from '@/hooks/useEspacos'
import { useMesStore } from '@/store'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { clsx } from 'clsx'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Input de peso com estado local — só guarda na BD ao sair do campo (onBlur)
// Evita que o input fique disabled durante a digitação por causa do upsert assíncrono
function PesoInput({ valor, onGuardar, toggling, className, placeholder }) {
  const [local, setLocal] = useState(String(valor ?? ''))
  useEffect(() => { setLocal(String(valor ?? '')) }, [valor])
  return (
    <input
      type="number"
      min="0"
      max="99"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onGuardar(e.target.value)}
      className={clsx(className, toggling && 'opacity-40 cursor-wait')}
    />
  )
}

// ── Gráfico vertical ─────────────────────────────────────────────────────────
const CHART_H = 200 // px altura das barras

function GraficoVertical({ dados, maxDatas, maxValor, vista = 'datas', onClickDJ }) {
  const [tooltip, setTooltip] = useState(null)

  if (dados.length === 0) {
    return <p className="text-xs text-accent-subtle/60 text-center py-6">Sem dados para o mês seleccionado.</p>
  }

  const max    = vista === 'datas' ? maxDatas : maxValor
  const corBar = vista === 'datas'
    ? 'bg-status-confirmado/60 hover:bg-status-confirmado'
    : 'bg-blue-400/60 hover:bg-blue-400'

  return (
    <div className="w-full">
      <div className="flex items-end w-full">
        {dados.map((dj) => {
          const v = vista === 'datas' ? dj.nDatas : dj.valor
          const h = max > 0 ? Math.round((v / max) * CHART_H) : 0
          return (
            <div key={dj.dj_id} className="relative flex-1 flex flex-col items-center min-w-0">
              {/* Tooltip */}
              {tooltip?.dj_id === dj.dj_id && (
                <div className="absolute bottom-[calc(100%-80px)] left-1/2 -translate-x-1/2 bg-surface-4 border border-border rounded px-2.5 py-1.5 text-[10px] text-accent whitespace-nowrap shadow-lg z-20 pointer-events-none mb-1 flex flex-col items-center gap-0.5">
                  <span className="font-semibold text-accent text-[11px]">{dj.nome ?? '—'}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-status-confirmado font-semibold">{dj.nDatas} datas</span>
                    <span className="text-accent-subtle mx-0.5">·</span>
                    <span className="text-blue-400 font-semibold">{formatarEuro(dj.valor)}</span>
                  </div>
                </div>
              )}

              {/* Barra */}
              <div
                className="flex items-end justify-center cursor-pointer w-full px-0.5"
                style={{ height: CHART_H }}
                onMouseEnter={() => setTooltip(dj)}
                onMouseLeave={() => setTooltip(null)}
              >
                <div
                  className={clsx('w-full max-w-[28px] rounded-t-sm transition-colors', corBar)}
                  style={{ height: h || 2 }}
                />
              </div>

              {/* Nome DJ — vertical */}
              <div className="mt-1.5 flex justify-center overflow-hidden" style={{ height: 80 }}>
                <span
                  className="text-[10px] text-accent-muted whitespace-nowrap leading-none"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  title={dj.nome ?? ''}
                >
                  {dj.nome ?? '—'}
                </span>
              </div>

              {/* Botão preferências */}
              {onClickDJ && (
                <button
                  onClick={() => onClickDJ(dj)}
                  title="Preferências Admin"
                  className="mt-1 p-1 rounded border border-border/50 text-accent-subtle/50 hover:text-accent hover:border-border transition-colors"
                >
                  <SlidersHorizontal size={10} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Linha base */}
      <div className="border-t border-border/40" />
    </div>
  )
}

// ── Badge de estado ───────────────────────────────────────────────────────────
function BadgeEstado({ nDatas, valor, metaDatas, orcamentoMax }) {
  const semMeta = !metaDatas && !orcamentoMax
  if (semMeta) return <span className="text-[10px] text-accent-subtle/50">—</span>

  const acimaDatas   = metaDatas   && nDatas > metaDatas
  const acimaBudget  = orcamentoMax && valor  > orcamentoMax
  const abaixoDatas  = metaDatas   && nDatas < metaDatas
  const abaixoBudget = orcamentoMax && valor  < orcamentoMax * 0.5 // <50% do orçamento

  if (acimaDatas || acimaBudget) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-cancelado/15 text-status-cancelado">
        <ChevronUp size={10} />
        Acima
      </span>
    )
  }
  if (abaixoDatas || abaixoBudget) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-proposta/15 text-status-proposta">
        <AlertTriangle size={10} />
        Abaixo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-confirmado/15 text-status-confirmado">
      <Check size={10} />
      OK
    </span>
  )
}

// ── Input de meta (inline, auto-save) ────────────────────────────────────────
function InputMeta({ value, onChange, placeholder, prefixo }) {
  const [local, setLocal] = useState(value ?? '')

  // Sync se o valor externo mudar (e.g. reload)
  useEffect(() => { setLocal(value ?? '') }, [value])

  return (
    <div className="flex items-center gap-1">
      {prefixo && <span className="text-[11px] text-accent-subtle">{prefixo}</span>}
      <input
        type="number"
        min="0"
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(local === '' ? null : Number(local))}
        className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-accent tabular-nums text-right focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors placeholder:text-accent-subtle/30"
      />
    </div>
  )
}

// ── Modal DJ: metas + meta por Cliente + preferências ─────────────────────────
function ModalDJ({ dj, meta, metaEspaco, isSaving, onSaveMeta, onSaveMetaEspaco, espacosComTurnos, turnosPorEspaco, adminPrefs, onSetPeso, togglingPref, onFechar }) {
  if (!dj) return null

  const totalActivos = espacosComTurnos.reduce((acc, espaco) => {
    const ets = turnosPorEspaco[espaco.id] ?? []
    return acc + ets.filter(t => (adminPrefs[`${dj.dj_id}|${espaco.id}|${t.id}`] ?? 0) > 0).length
  }, 0)

  return (
    <Modal aberto={!!dj} onFechar={onFechar} titulo={dj.nome ?? '—'} largura="max-w-lg">
      <div className="px-6 py-5 flex flex-col gap-5">

        {/* ── Metas globais do mês ── */}
        <div>
          <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mb-2.5">Metas Globais do Mês</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 border border-border/60 rounded-lg px-3 py-2.5">
              <p className="text-[10px] text-accent-subtle mb-1.5">Meta de Datas (total)</p>
              <div className="flex items-center gap-1.5">
                <InputMeta
                  value={meta?.meta_datas_mes}
                  placeholder="—"
                  onChange={(v) => onSaveMeta(dj.dj_id, 'meta_datas_mes', v)}
                />
                {isSaving && <span className="text-[9px] text-accent-subtle animate-pulse">…</span>}
              </div>
            </div>
            <div className="bg-surface-2 border border-border/60 rounded-lg px-3 py-2.5">
              <p className="text-[10px] text-accent-subtle mb-1.5">Orçamento Máx.</p>
              <div className="flex items-center gap-1.5">
                <InputMeta
                  value={meta?.orcamento_max}
                  placeholder="—"
                  prefixo="€"
                  onChange={(v) => onSaveMeta(dj.dj_id, 'orcamento_max', v)}
                />
                {isSaving && <span className="text-[9px] text-accent-subtle animate-pulse">…</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Limite por Cliente ── */}
        {espacosComTurnos.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mb-1">Limite por Cliente</p>
            <p className="text-[10px] text-accent-subtle/60 mb-2.5">
              Max. atuações neste Cliente/mês · vazio = usa meta global · 0 = nunca distribuir aqui
            </p>
            <div className="border border-border/60 rounded-lg overflow-hidden">
              {espacosComTurnos.map((espaco, idx) => {
                const val = metaEspaco?.[espaco.id] ?? null
                return (
                  <div
                    key={espaco.id}
                    className={clsx(
                      'flex items-center justify-between gap-3 px-3 py-2',
                      idx !== 0 && 'border-t border-border/40',
                      val != null ? 'bg-accent/5' : 'bg-surface-2'
                    )}
                  >
                    <span className={clsx(
                      'text-[11px] font-medium truncate',
                      val != null ? 'text-accent' : 'text-accent-muted'
                    )} title={espaco.nome.trim()}>
                      {espaco.nome.trim()}
                    </span>
                    <InputMeta
                      value={val}
                      placeholder="—"
                      onChange={(v) => onSaveMetaEspaco(dj.dj_id, espaco.id, v)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Prioridade por turno ── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest">
              Prioridade por Turno
            </p>
            {totalActivos > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                {totalActivos} activo{totalActivos !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-[10px] text-accent-subtle/60 mb-2.5">
            Número = pontos extra no score · vazio ou 0 = sem prioridade
          </p>

          {espacosComTurnos.length === 0 ? (
            <p className="text-xs text-accent-subtle/60 text-center py-3">Nenhum Cliente com turnos configurados.</p>
          ) : (
            <div className="border border-border/60 rounded-lg overflow-hidden">
              {espacosComTurnos.map((espaco, idx) => {
                const ets = turnosPorEspaco[espaco.id] ?? []
                const nomeEspaco = espaco.nome.trim()
                const nActivos = ets.filter(t => (adminPrefs[`${dj.dj_id}|${espaco.id}|${t.id}`] ?? 0) > 0).length

                return (
                  <div
                    key={espaco.id}
                    className={clsx(
                      'flex items-start gap-3 px-3 py-2',
                      idx !== 0 && 'border-t border-border/40',
                      nActivos > 0 ? 'bg-accent/5' : 'bg-surface-2'
                    )}
                  >
                    {/* Nome do Cliente */}
                    <span className={clsx(
                      'text-[11px] font-medium w-24 shrink-0 truncate pt-1',
                      nActivos > 0 ? 'text-accent' : 'text-accent-muted'
                    )} title={nomeEspaco}>
                      {nomeEspaco}
                    </span>

                    {/* Input numérico por turno */}
                    <div className="flex flex-wrap gap-2">
                      {ets.map(turno => {
                        const key = `${dj.dj_id}|${espaco.id}|${turno.id}`
                        const peso = adminPrefs[key] ?? ''
                        const activo = (adminPrefs[key] ?? 0) > 0
                        const toggling = togglingPref.has(key)
                        return (
                          <div key={turno.id} className="flex flex-col items-center gap-0.5">
                            <span className={clsx(
                              'text-[9px] font-medium truncate max-w-[70px] text-center',
                              activo ? 'text-accent' : 'text-accent-subtle/60'
                            )}>
                              {ets.length === 1 ? nomeEspaco : turno.nome}
                            </span>
                            <PesoInput
                              valor={peso}
                              toggling={toggling}
                              placeholder="—"
                              onGuardar={(v) => onSetPeso(dj.dj_id, espaco.id, turno.id, v)}
                              className={clsx(
                                'w-14 bg-surface-1 border rounded px-1.5 py-1 text-xs text-center tabular-nums focus:outline-none focus:border-white/30 transition-colors',
                                activo ? 'border-accent/40 text-accent bg-accent/5' : 'border-border/50 text-accent-subtle',
                              )}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </Modal>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function Equilibrio() {
  const { anoMes } = useMesStore()
  const { espacos, loading: loadingEspacos } = useEspacos()

  const [slots,       setSlots]       = useState([])
  const [djs,         setDJs]         = useState([])
  const [turnos,      setTurnos]      = useState([])  // direto da BD, sempre fresco
  const [adminPrefs,  setAdminPrefs]  = useState({}) // "dj_id|espaco_id|turno_id" → peso
  const [loading,     setLoading]     = useState(true)
  const [erro,        setErro]        = useState(null)
  const [vistaGrafico,       setVistaGrafico]       = useState('datas') // 'datas' | 'valor'
  const [filtroEspaco,       setFiltroEspaco]       = useState('')
  const [pesquisaTabela,     setPesquisaTabela]     = useState('')
  const [filtroEstadoTabela, setFiltroEstadoTabela] = useState('') // '' | 'ok' | 'acima' | 'abaixo' | 'sem_meta'
  const [filtroEstadoDJ,     setFiltroEstadoDJ]     = useState('') // '' | 'activo' | 'activo_ext'
  const [filtroCategoria,    setFiltroCategoria]    = useState('') // '' | categoria_id
  const [ordenacaoTabela,    setOrdenacaoTabela]    = useState('datas_desc') // 'datas_desc'|'datas_asc'|'valor_desc'|'valor_asc'|'nome'
  const [metas,         setMetas]         = useState({}) // { [dj_id]: { meta_datas_mes, orcamento_max } }
  const [metasEspaco,   setMetasEspaco]   = useState({}) // { [dj_id]: { [espaco_id]: max_datas_mes } }
  const [salvando,      setSalvando]      = useState({}) // { [dj_id]: bool }
  const [togglingPref,  setTogglingPref]  = useState(new Set()) // keys a guardar
  const [prefModalDJ,   setPrefModalDJ]   = useState(null) // dj row aberto no modal de prefs
  const [categorias,    setCategorias]    = useState([]) // [{ id, nome }]
  const [djCatsMap,     setDjCatsMap]     = useState({}) // { dj_id: Set<categoria_id> }

  // ── Calcular intervalo do mês ─────────────────────────────────────────────
  const { dataInicio, dataFim } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref   = new Date(ano, mes - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
    }
  }, [anoMes])

  // ── Carregar dados ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErro(null)

    Promise.all([
      supabase
        .from('agenda')
        .select('id, data, dj_id, espaco_id, valor, estado, djs(nome_artistico), espacos(nome)')
        .gte('data', dataInicio)
        .lte('data', dataFim)
        .neq('estado', 'cancelado'),
      djsApi.listar(),
      supabase.from('turnos_espaco').select('id, nome, espaco_id, ordem').order('ordem'),
      supabase.from('admin_dj_espaco_pref').select('dj_id, espaco_id, turno_id, peso'),
      supabase.from('dj_meta_espaco').select('dj_id, espaco_id, max_datas_mes'),
      supabase.from('categorias_dj').select('id, nome').order('nome'),
      supabase.from('dj_categorias').select('dj_id, categoria_id'),
    ])
      .then(([slotsRes, djsData, turnosRes, adminPrefsRes, metaEspacoRes, catsRes, djCatsRes]) => {
        if (cancelled) return
        if (slotsRes.error) throw slotsRes.error
        if (turnosRes.error) console.warn('Turnos error:', turnosRes.error)
        if (adminPrefsRes.error) console.warn('AdminPrefs error:', adminPrefsRes.error)
        const slotsNorm = (slotsRes.data ?? []).map((s) => ({
          ...s,
          dj_nome:    s.djs?.nome_artistico ?? s.dj_nome ?? null,
          espaco_nome: s.espacos?.nome ?? null,
        }))
        setSlots(slotsNorm)
        setDJs(djsData ?? [])
        setTurnos(turnosRes.data ?? [])
        // Preferências admin: "dj_id|espaco_id|turno_id" → peso
        const prefMap = {}
        ;(adminPrefsRes.data ?? []).forEach(p => {
          prefMap[`${p.dj_id}|${p.espaco_id}|${p.turno_id}`] = p.peso ?? 10
        })
        setAdminPrefs(prefMap)
        // Inicializar metas globais
        const metasInit = {}
        ;(djsData ?? []).forEach((dj) => {
          metasInit[dj.id] = {
            meta_datas_mes: dj.meta_datas_mes ?? null,
            orcamento_max:  dj.orcamento_max  ?? null,
          }
        })
        setMetas(metasInit)
        // Inicializar metas por Cliente: { [dj_id]: { [espaco_id]: max_datas_mes } }
        const metasEspacoInit = {}
        ;(metaEspacoRes.data ?? []).forEach(({ dj_id, espaco_id, max_datas_mes }) => {
          if (!metasEspacoInit[dj_id]) metasEspacoInit[dj_id] = {}
          metasEspacoInit[dj_id][espaco_id] = max_datas_mes
        })
        setMetasEspaco(metasEspacoInit)
        // Categorias
        setCategorias(catsRes.data ?? [])
        const catsMap = {}
        ;(djCatsRes.data ?? []).forEach(({ dj_id, categoria_id }) => {
          if (!catsMap[dj_id]) catsMap[dj_id] = new Set()
          catsMap[dj_id].add(categoria_id)
        })
        setDjCatsMap(catsMap)
      })
      .catch((e) => { if (!cancelled) setErro(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [dataInicio, dataFim])

  // ── Turnos agrupados por Cliente — query direta, sempre fresco ────────────
  const turnosPorEspaco = useMemo(() => {
    const map = {}
    turnos.forEach(t => {
      if (!map[t.espaco_id]) map[t.espaco_id] = []
      map[t.espaco_id].push(t)
    })
    return map
  }, [turnos])

  // ── Clientes com pelo menos um turno (elegíveis para preferências) ─────────
  const espacosComTurnos = useMemo(() =>
    espacos.filter(e => (turnosPorEspaco[e.id]?.length ?? 0) > 0)
  , [espacos, turnosPorEspaco])

  // ── Definir peso por DJ por turno (0 ou null = remover) ──────────────────
  const setPesoTurno = useCallback(async (djId, espacoId, turnoId, peso) => {
    const key = `${djId}|${espacoId}|${turnoId}`
    const pesoNum = peso === '' || peso == null ? null : Number(peso)

    // Actualização optimista
    setAdminPrefs(prev => {
      const next = { ...prev }
      if (pesoNum == null || pesoNum === 0) {
        delete next[key]
      } else {
        next[key] = pesoNum
      }
      return next
    })
    setTogglingPref(prev => new Set([...prev, key]))

    try {
      if (pesoNum == null || pesoNum === 0) {
        await supabase.from('admin_dj_espaco_pref')
          .delete()
          .eq('dj_id', djId).eq('espaco_id', espacoId).eq('turno_id', turnoId)
      } else {
        await supabase.from('admin_dj_espaco_pref')
          .upsert({ dj_id: djId, espaco_id: espacoId, turno_id: turnoId, peso: pesoNum })
      }
    } catch {
      // Reverter
      setAdminPrefs(prev => { const n = { ...prev }; delete n[key]; return n })
    } finally {
      setTogglingPref(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }, [])

  // ── Guardar meta global ───────────────────────────────────────────────────
  const guardarMeta = useCallback(async (djId, campo, valor) => {
    const actual = metas[djId] ?? {}
    const novas  = { ...actual, [campo]: valor }
    setMetas((prev) => ({ ...prev, [djId]: novas }))
    setSalvando((prev) => ({ ...prev, [djId]: true }))
    try {
      await djsApi.actualizarMeta(djId, novas)
    } catch (e) {
      console.error('Erro ao guardar meta:', e)
    } finally {
      setSalvando((prev) => ({ ...prev, [djId]: false }))
    }
  }, [metas])

  // ── Guardar meta por Cliente (auto-save no blur) ───────────────────────────
  const guardarMetaEspaco = useCallback(async (djId, espacoId, valor) => {
    // Actualização optimista
    setMetasEspaco((prev) => ({
      ...prev,
      [djId]: { ...(prev[djId] ?? {}), [espacoId]: valor },
    }))
    try {
      await djMetaEspacoApi.guardarUm(djId, espacoId, valor)
    } catch (e) {
      console.error('Erro ao guardar meta por Cliente:', e)
    }
  }, [])

  // ── Slots filtrados por Cliente (para gráfico e tabela) ───────────────────
  const slotsFiltrados = useMemo(() =>
    filtroEspaco ? slots.filter((s) => s.espaco_id === filtroEspaco) : slots
  , [slots, filtroEspaco])

  // ── Agregar por DJ ────────────────────────────────────────────────────────
  // activo + activo_ext são distribuíveis — ambos aparecem na tabela
  const djsActivos = useMemo(() =>
    new Set(djs.filter((d) => d.estado === 'activo' || d.estado === 'activo_ext').map((d) => d.id))
  , [djs])

  const porDJ = useMemo(() => {
    const map = {}

    // 1. Contabilizar slots do mês (apenas DJs activos)
    slotsFiltrados.forEach((s) => {
      if (!s.dj_id || !djsActivos.has(s.dj_id)) return
      if (!map[s.dj_id]) map[s.dj_id] = { dj_id: s.dj_id, nome: s.dj_nome, nDatas: 0, valor: 0, espacosSet: new Set() }
      map[s.dj_id].nDatas++
      map[s.dj_id].valor += s.valor ?? 0
      if (s.espaco_id) map[s.dj_id].espacosSet.add(s.espaco_id)
    })

    // 2. Garantir que TODOS os DJs activos aparecem (mesmo sem datas nem meta)
    djs.forEach((dj) => {
      if (!djsActivos.has(dj.id)) return
      if (!map[dj.id]) {
        map[dj.id] = { dj_id: dj.id, nome: dj.nome_artistico, nDatas: 0, valor: 0, espacosSet: new Set() }
      }
    })

    return Object.values(map)
      .sort((a, b) => b.nDatas - a.nDatas || (a.nome ?? '').localeCompare(b.nome ?? ''))
  }, [slotsFiltrados, djs, djsActivos]) // metas não é dependência — DJs aparecem sempre

  // ── Só DJs com estado 'activo' (exclui activo_ext) para o gráfico ────────
  const porDJGrafico = useMemo(() =>
    porDJ.filter((d) => {
      const info = djs.find((dj) => dj.id === d.dj_id)
      return info?.estado === 'activo'
    })
  , [porDJ, djs])

  // ── Máximos para escala do gráfico ───────────────────────────────────────
  const maxDatas = useMemo(() => Math.max(...porDJGrafico.map((d) => d.nDatas), 1), [porDJGrafico])
  const maxValor = useMemo(() => Math.max(...porDJGrafico.map((d) => d.valor), 1), [porDJGrafico])

  // ── Helper: estado de equilíbrio de um DJ ────────────────────────────────
  const estadoDJ = useCallback((dj) => {
    const meta = metas[dj.dj_id] ?? {}
    const { meta_datas_mes, orcamento_max } = meta
    if (!meta_datas_mes && !orcamento_max) return 'sem_meta'
    if ((meta_datas_mes && dj.nDatas > meta_datas_mes) || (orcamento_max && dj.valor > orcamento_max)) return 'acima'
    if ((meta_datas_mes && dj.nDatas < meta_datas_mes) || (orcamento_max && dj.valor < orcamento_max * 0.5)) return 'abaixo'
    return 'ok'
  }, [metas])

  // ── porDJ com pesquisa + filtros + ordenação ─────────────────────────────
  const porDJTabela = useMemo(() => {
    let lista = porDJ

    // Pesquisa por nome
    if (pesquisaTabela.trim()) {
      const q = pesquisaTabela.toLowerCase()
      lista = lista.filter(dj => (dj.nome ?? '').toLowerCase().includes(q))
    }

    // Filtro por estado de equilíbrio
    if (filtroEstadoTabela) {
      lista = lista.filter(dj => estadoDJ(dj) === filtroEstadoTabela)
    }

    // Filtro por estado do DJ (activo / activo_ext)
    if (filtroEstadoDJ) {
      lista = lista.filter(dj => {
        const info = djs.find(d => d.id === dj.dj_id)
        return info?.estado === filtroEstadoDJ
      })
    }

    // Filtro por categoria
    if (filtroCategoria) {
      const catId = Number(filtroCategoria)
      lista = lista.filter(dj => djCatsMap[dj.dj_id]?.has(catId))
    }

    // Ordenação
    lista = [...lista].sort((a, b) => {
      switch (ordenacaoTabela) {
        case 'datas_asc':  return a.nDatas - b.nDatas
        case 'valor_desc': return b.valor  - a.valor
        case 'valor_asc':  return a.valor  - b.valor
        case 'nome':       return (a.nome ?? '').localeCompare(b.nome ?? '')
        default:           return b.nDatas - a.nDatas || (a.nome ?? '').localeCompare(b.nome ?? '')
      }
    })

    return lista
  }, [porDJ, pesquisaTabela, filtroEstadoTabela, filtroEstadoDJ, filtroCategoria, ordenacaoTabela, estadoDJ, djs, djCatsMap])

  // ── Totais globais ────────────────────────────────────────────────────────
  const totalSlots       = slots.length
  const totalPreenchidas = slots.filter((s) => !!s.dj_id).length
  const djMaisDatas = porDJ.reduce((top, d) => (!top || d.nDatas > top.nDatas) ? d : top, null)
  const djMaisValor = porDJ.reduce((top, d) => (!top || d.valor  > top.valor)  ? d : top, null)

  const titulo = cap(format(new Date(anoMes + '-01'), 'MMMM yyyy', { locale: pt }))

  if (loading || loadingEspacos) return <LoadingPage />

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 flex flex-col gap-6">

        {/* ── KPIs globais ── */}
        <div className="grid grid-cols-4 gap-3">
          {/* Total datas */}
          <div className="bg-surface-1 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-status-confirmado/10 flex items-center justify-center shrink-0">
              <CalendarDays size={16} className="text-status-confirmado" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-accent leading-none">{totalSlots}</p>
              <p className="text-[11px] text-accent-muted mt-0.5">total de datas</p>
            </div>
          </div>

          {/* Datas preenchidas */}
          <div className="bg-surface-1 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-400/10 flex items-center justify-center shrink-0">
              <Users size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-accent leading-none">
                {totalPreenchidas}
                <span className="text-sm font-normal text-accent-subtle ml-1">/ {totalSlots}</span>
              </p>
              <p className="text-[11px] text-accent-muted mt-0.5">datas preenchidas</p>
            </div>
          </div>

          {/* DJ com mais datas */}
          <div className="bg-surface-1 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-400/10 flex items-center justify-center shrink-0 text-purple-400 font-bold text-sm">
              #1
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tabular-nums text-accent leading-none">
                {djMaisDatas?.nDatas ?? 0}
                <span className="text-[11px] font-normal text-accent-subtle ml-1">datas</span>
              </p>
              <p className="text-[11px] text-accent-muted mt-0.5 truncate" title={djMaisDatas?.nome ?? '—'}>
                {djMaisDatas?.nome ?? '—'}
              </p>
            </div>
          </div>

          {/* DJ com mais valor */}
          <div className="bg-surface-1 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-400/10 flex items-center justify-center shrink-0">
              <Euro size={16} className="text-yellow-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tabular-nums text-accent leading-none">
                {formatarEuro(djMaisValor?.valor ?? 0)}
              </p>
              <p className="text-[11px] text-accent-muted mt-0.5 truncate" title={djMaisValor?.nome ?? '—'}>
                {djMaisValor?.nome ?? '—'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Gráfico por DJ ── */}
        <div className="bg-surface-1 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-accent-muted" />
              <p className="text-xs font-semibold text-accent">Distribuição por DJ — {titulo}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Toggle Datas / Valor */}
              <div className="flex bg-surface-2 border border-border rounded p-0.5">
                <button
                  onClick={() => setVistaGrafico('datas')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors',
                    vistaGrafico === 'datas'
                      ? 'bg-status-confirmado/20 text-status-confirmado font-medium'
                      : 'text-accent-muted hover:text-accent'
                  )}
                >
                  <div className="w-2 h-2 rounded-sm bg-status-confirmado/70 shrink-0" />
                  Datas
                </button>
                <button
                  onClick={() => setVistaGrafico('valor')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors',
                    vistaGrafico === 'valor'
                      ? 'bg-blue-400/20 text-blue-400 font-medium'
                      : 'text-accent-muted hover:text-accent'
                  )}
                >
                  <div className="w-2 h-2 rounded-sm bg-blue-400/70 shrink-0" />
                  Valor
                </button>
              </div>
              {/* Filtro Cliente */}
              <select
                value={filtroEspaco}
                onChange={(e) => setFiltroEspaco(e.target.value)}
                className="bg-surface-2 border border-border rounded px-2 py-1 text-[11px] text-accent-muted focus:outline-none"
              >
                <option value="">Todos os Clientes</option>
                {espacos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          </div>

          <GraficoVertical dados={porDJGrafico} maxDatas={maxDatas} maxValor={maxValor} vista={vistaGrafico} onClickDJ={setPrefModalDJ} />
        </div>

        {/* ── Tabela de equilíbrio ── */}
        <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">

          {/* Cabeçalho + filtros */}
          <div className="px-4 py-3 border-b border-border flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-accent">Tabela de Equilíbrio</p>
              <p className="text-[11px] text-accent-subtle">
                As metas são guardadas automaticamente. Clica em <SlidersHorizontal size={10} className="inline -mt-0.5" /> para preferências.
              </p>
            </div>

            {/* Barra de filtros — linha 1 */}
            <div className="flex items-center gap-2 flex-wrap">

              {/* Pesquisa */}
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
                <input
                  type="text"
                  value={pesquisaTabela}
                  onChange={e => setPesquisaTabela(e.target.value)}
                  placeholder="Pesquisar DJ…"
                  className="w-full bg-surface-2 border border-border rounded pl-7 pr-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors"
                />
              </div>

              {/* Filtro estado do DJ */}
              <select
                value={filtroEstadoDJ}
                onChange={e => setFiltroEstadoDJ(e.target.value)}
                className="bg-surface-2 border border-border rounded px-2 py-1.5 text-[11px] text-accent-muted focus:outline-none focus:border-white/30 transition-colors"
              >
                <option value="">Todos os estados</option>
                <option value="activo">Activo</option>
                <option value="activo_ext">Activo EXT</option>
              </select>

              {/* Filtro categoria */}
              <select
                value={filtroCategoria}
                onChange={e => setFiltroCategoria(e.target.value)}
                className="bg-surface-2 border border-border rounded px-2 py-1.5 text-[11px] text-accent-muted focus:outline-none focus:border-white/30 transition-colors"
              >
                <option value="">Todas as categorias</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>

              {/* Ordenação */}
              <div className="flex items-center gap-1 ml-auto">
                <ArrowUpDown size={11} className="text-accent-subtle shrink-0" />
                <select
                  value={ordenacaoTabela}
                  onChange={e => setOrdenacaoTabela(e.target.value)}
                  className="bg-surface-2 border border-border rounded px-2 py-1.5 text-[11px] text-accent-muted focus:outline-none focus:border-white/30 transition-colors"
                >
                  <option value="datas_desc">Datas ↓</option>
                  <option value="datas_asc">Datas ↑</option>
                  <option value="valor_desc">Valor ↓</option>
                  <option value="valor_asc">Valor ↑</option>
                  <option value="nome">Nome A–Z</option>
                </select>
              </div>

            </div>

            {/* Barra de filtros — linha 2: estado de equilíbrio */}
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { val: '',         label: 'Todos' },
                { val: 'ok',       label: '✓ OK' },
                { val: 'acima',    label: '↑ Acima' },
                { val: 'abaixo',   label: '⚠ Abaixo' },
                { val: 'sem_meta', label: '— Sem meta' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => setFiltroEstadoTabela(val)}
                  className={clsx(
                    'px-2 py-1 rounded text-[10px] font-medium border transition-colors whitespace-nowrap',
                    filtroEstadoTabela === val
                      ? 'bg-accent/15 text-accent border-accent/30'
                      : 'bg-surface-2 text-accent-subtle border-border hover:text-accent'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Contador */}
            {(pesquisaTabela || filtroEstadoTabela || filtroEstadoDJ || filtroCategoria) && (
              <p className="text-[10px] text-accent-subtle">
                {porDJTabela.length} de {porDJ.length} DJ{porDJ.length !== 1 ? 's' : ''}
                {' '}<button onClick={() => { setPesquisaTabela(''); setFiltroEstadoTabela(''); setFiltroEstadoDJ(''); setFiltroCategoria('') }} className="text-accent/60 hover:text-accent underline underline-offset-2 transition-colors">limpar</button>
              </p>
            )}
          </div>

          <div style={{ minHeight: Math.max(porDJ.length * 44, 300) }}>
          {porDJTabela.length === 0 ? (
            <p className="text-xs text-accent-subtle/60 text-center py-8">
              {porDJ.length === 0 ? 'Sem dados para o mês seleccionado.' : 'Nenhum DJ corresponde aos filtros.'}
            </p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface-2 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-accent-muted">DJ</th>
                  <th className="text-right px-3 py-2.5 font-medium text-accent-muted">Nº Datas</th>
                  <th className="text-right px-3 py-2.5 font-medium text-accent-muted">Valor Total</th>
                  <th className="text-right px-3 py-2.5 font-medium text-accent-muted">Meta Datas</th>
                  <th className="text-right px-3 py-2.5 font-medium text-accent-muted">Orçamento Máx.</th>
                  <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Estado</th>
                </tr>
              </thead>
              <tbody>
                {porDJTabela.map((dj, i) => {
                  const meta = metas[dj.dj_id] ?? {}
                  const isSaving = salvando[dj.dj_id]

                  return (
                    <tr key={dj.dj_id} className={clsx(
                      'border-b border-border/30 transition-colors hover:bg-surface-2/50',
                      i % 2 === 0 ? '' : 'bg-surface-0/40'
                    )}>
                      {/* DJ */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-surface-3 border border-border flex items-center justify-center text-[10px] font-bold text-accent-muted shrink-0">
                            {(dj.nome ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-accent truncate max-w-[140px]" title={dj.nome}>{dj.nome ?? '—'}</span>
                          {isSaving && <span className="text-[9px] text-accent-subtle animate-pulse">a guardar…</span>}
                          {/* Botão de preferências admin */}
                          {(() => {
                            const nPrefs = espacosComTurnos.reduce((acc, espaco) => {
                              const ets = turnosPorEspaco[espaco.id] ?? []
                              return acc + ets.filter(t => (adminPrefs[`${dj.dj_id}|${espaco.id}|${t.id}`] ?? 0) > 0).length
                            }, 0)
                            return (
                              <button
                                onClick={() => setPrefModalDJ(dj)}
                                title="Preferências Admin"
                                className={clsx(
                                  'ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors shrink-0',
                                  nPrefs > 0
                                    ? 'border-accent/40 text-accent bg-accent/10 hover:bg-accent/20'
                                    : 'border-border/50 text-accent-subtle/50 hover:text-accent-subtle hover:border-border'
                                )}
                              >
                                <SlidersHorizontal size={10} />
                                {nPrefs > 0 && <span className="text-[9px] font-semibold tabular-nums">{nPrefs}</span>}
                              </button>
                            )
                          })()}
                        </div>
                      </td>

                      {/* Nº Datas */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={clsx(
                          'font-semibold',
                          meta.meta_datas_mes && dj.nDatas > meta.meta_datas_mes
                            ? 'text-status-cancelado'
                            : 'text-accent'
                        )}>
                          {dj.nDatas}
                        </span>
                        {meta.meta_datas_mes && (
                          <span className="text-accent-subtle/60 ml-1">/ {meta.meta_datas_mes}</span>
                        )}
                      </td>

                      {/* Valor Total */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={clsx(
                          'font-semibold',
                          meta.orcamento_max && dj.valor > meta.orcamento_max
                            ? 'text-status-cancelado'
                            : 'text-status-confirmado'
                        )}>
                          {formatarEuro(dj.valor)}
                        </span>
                        {meta.orcamento_max && (
                          <span className="text-accent-subtle/60 ml-1">/ {formatarEuro(meta.orcamento_max)}</span>
                        )}
                      </td>

                      {/* Meta Datas */}
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">
                          <InputMeta
                            value={meta.meta_datas_mes}
                            placeholder="—"
                            onChange={(v) => guardarMeta(dj.dj_id, 'meta_datas_mes', v)}
                          />
                        </div>
                      </td>

                      {/* Orçamento Máx. */}
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">
                          <InputMeta
                            value={meta.orcamento_max}
                            placeholder="—"
                            prefixo="€"
                            onChange={(v) => guardarMeta(dj.dj_id, 'orcamento_max', v)}
                          />
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-3 py-2.5 text-center">
                        <BadgeEstado
                          nDatas={dj.nDatas}
                          valor={dj.valor}
                          metaDatas={meta.meta_datas_mes}
                          orcamentoMax={meta.orcamento_max}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          </div>
        </div>

        {erro && (
          <div className="bg-status-cancelado/10 border border-status-cancelado/30 rounded px-4 py-3 text-xs text-status-cancelado">
            Erro ao carregar dados: {erro}
          </div>
        )}

      </div>

      {/* Modal DJ: metas + preferências */}
      <ModalDJ
        dj={prefModalDJ}
        meta={prefModalDJ ? (metas[prefModalDJ.dj_id] ?? {}) : {}}
        metaEspaco={prefModalDJ ? (metasEspaco[prefModalDJ.dj_id] ?? {}) : {}}
        isSaving={prefModalDJ ? !!salvando[prefModalDJ.dj_id] : false}
        onSaveMeta={guardarMeta}
        onSaveMetaEspaco={guardarMetaEspaco}
        espacosComTurnos={espacosComTurnos}
        turnosPorEspaco={turnosPorEspaco}
        adminPrefs={adminPrefs}
        onSetPeso={setPesoTurno}
        togglingPref={togglingPref}
        onFechar={() => setPrefModalDJ(null)}
      />
    </div>
  )
}
