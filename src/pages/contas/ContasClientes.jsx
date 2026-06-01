import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { Save, Pencil, X, Search } from 'lucide-react'
import { useMesStore } from '@/store'
import { useEspacos } from '@/hooks/useEspacos'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n }
const emptyRow  = ()  => ({ id: null, descricao: '', unidades: 1, valor_unitario: '' })
const N_ROWS    = 5

function initCard(servicos) {
  const equips  = servicos.filter(s => s.tipo === 'equipamento')
  const extras  = servicos.filter(s => s.tipo === 'extra')
  const apoioEn = servicos.find(s  => s.tipo === 'apoio_tecnico')
  const toRow   = (s) => ({
    id: s.id ?? null, descricao: s.descricao ?? '',
    unidades: s.unidades ?? 1,
    valor_unitario: s.valor_unitario != null ? String(s.valor_unitario) : '',
  })
  const pad = (arr, n) => {
    const rows = arr.slice(0, n).map(toRow)
    while (rows.length < n) rows.push(emptyRow())
    return rows
  }
  return {
    apoioOverride: apoioEn != null ? String(apoioEn.valor ?? '') : null,
    apoioId:       apoioEn?.id ?? null,
    equipamentos:  pad(equips, N_ROWS),
    extras:        pad(extras, N_ROWS),
    dirty: false,
  }
}

// ── Linha manual ─────────────────────────────────────────────────────────────
function LinhaManual({ row, onChange }) {
  const total = parseNum(row.unidades) * parseNum(row.valor_unitario)
  return (
    <tr className="border-b border-border/20 last:border-0">
      <td className="py-1.5 pl-2 pr-1 w-12">
        <input type="number" min="0" step="1" value={row.unidades}
          onChange={e => onChange({ ...row, unidades: e.target.value })}
          className="w-full bg-surface-2 border border-border/50 rounded px-1.5 py-1 text-xs text-accent text-center focus:outline-none focus:ring-1 focus:ring-accent/30" />
      </td>
      <td className="py-1.5 px-1">
        <input type="text" value={row.descricao}
          onChange={e => onChange({ ...row, descricao: e.target.value })}
          placeholder="Descrição…"
          className="w-full bg-surface-2 border border-border/50 rounded px-2 py-1 text-xs text-accent placeholder:text-accent-subtle/30 focus:outline-none focus:ring-1 focus:ring-accent/30" />
      </td>
      <td className="py-1.5 px-1 w-20">
        <input type="number" min="0" step="0.01" value={row.valor_unitario}
          onChange={e => onChange({ ...row, valor_unitario: e.target.value })}
          placeholder="0,00"
          className="w-full bg-surface-2 border border-border/50 rounded px-1.5 py-1 text-xs text-accent text-right focus:outline-none focus:ring-1 focus:ring-accent/30" />
      </td>
      <td className="py-1.5 pl-1 pr-2 w-20 text-right tabular-nums text-xs font-semibold">
        {total > 0 ? <span className="text-accent">{formatarEuro(total)}</span>
                   : <span className="text-border/30">—</span>}
      </td>
    </tr>
  )
}

// ── Linha auto (só leitura) ───────────────────────────────────────────────────
function LinhaInfo({ label, unidades, unidLabel, valor, editavel, editando, valorEdit, onEdit, onChangeEdit, onReset }) {
  return (
    <tr className="border-b border-border/20 last:border-0">
      <td className="py-2 pl-4 pr-2 text-sm font-medium text-accent">{label}</td>
      <td className="py-2 px-2 text-xs text-accent-muted tabular-nums text-center">
        {unidades != null && unidades > 0
          ? <span>{unidades} <span className="text-accent-subtle">{unidLabel}</span></span>
          : <span className="text-border/30">—</span>}
      </td>
      <td className="py-2 pl-2 pr-4 text-right">
        {editando ? (
          <div className="flex items-center gap-1 justify-end">
            <input type="number" min="0" step="0.01" value={valorEdit}
              onChange={e => onChangeEdit(e.target.value)} autoFocus
              className="w-24 bg-surface-2 border border-border/50 rounded px-2 py-1 text-xs text-accent text-right focus:outline-none focus:ring-1 focus:ring-accent/30" />
            <button onClick={() => onEdit(false)} className="text-accent-subtle hover:text-accent"><X size={11} /></button>
          </div>
        ) : (
          <div className="flex items-center justify-end group">
            {editavel && (
              <button onClick={() => onEdit(true)} className="mr-2 opacity-0 group-hover:opacity-100 text-accent-subtle hover:text-accent transition-opacity">
                <Pencil size={11} />
              </button>
            )}
            {onReset && (
              <button onClick={onReset} title="Repor automático" className="mr-1 opacity-0 group-hover:opacity-100 text-accent-subtle hover:text-status-cancelado transition-opacity">
                <X size={10} />
              </button>
            )}
            <span className={clsx('text-sm font-semibold tabular-nums', valor > 0 ? 'text-accent' : 'text-border/30')}>
              {valor > 0 ? formatarEuro(valor) : '—'}
            </span>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardBloco({ titulo, linhas, total, comUnidades = false, unidLabel = 'at.' }) {
  const totalN = comUnidades ? linhas.reduce((a, l) => a + (l.n ?? 0), 0) : null
  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="bg-surface-2 border-b border-border grid items-center" style={{ gridTemplateColumns: '45% 25% 30%' }}>
        <p className="px-4 py-3 text-[11px] font-bold text-accent-subtle uppercase tracking-widest">{titulo}</p>
        <p className="py-3 text-center tabular-nums text-[11px] font-semibold text-accent-muted">
          {totalN != null && totalN > 0
            ? <>{totalN} <span className="font-normal text-accent-subtle/60">{unidLabel}</span></>
            : null}
        </p>
        <p className="py-3 pr-4 text-right text-base font-bold text-status-confirmado tabular-nums">{formatarEuro(total)}</p>
      </div>
      <table className="w-full text-xs border-collapse">
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className={clsx('border-b border-border/20 last:border-0', i % 2 !== 0 && 'bg-surface-0/30')}>
              <td className="py-2 pl-4 pr-2 text-accent-muted truncate max-w-[180px]">{l.nome}</td>
              {comUnidades && (
                <td className="py-2 px-2 text-center tabular-nums text-accent-subtle">
                  {l.n > 0 ? <span>{l.n} <span className="text-accent-subtle/50">{unidLabel}</span></span> : <span className="text-border/30">—</span>}
                </td>
              )}
              <td className="py-2 pl-2 pr-4 text-right tabular-nums font-semibold">
                {l.v > 0 ? <span className="text-accent">{formatarEuro(l.v)}</span> : <span className="text-border/30">—</span>}
              </td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={comUnidades ? 3 : 2} className="py-4 text-center text-accent-subtle/40 text-[11px]">Sem dados</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function Dashboard({ espacos, slots, eventos, agendTec, cards }) {
  const djRes = useMemo(() => {
    const map = {}
    slots.filter(s => s.tipo_slot !== 'convidado').forEach(s => {
      if (!map[s.espaco_id]) map[s.espaco_id] = { n: 0, v: 0 }
      map[s.espaco_id].n++
      map[s.espaco_id].v += parseNum(s.valor)
    })
    const linhas = espacos.filter(e => map[e.id]).map(e => ({ nome: e.nome.trim(), ...map[e.id] }))
    return { linhas, total: linhas.reduce((a, l) => a + l.v, 0) }
  }, [espacos, slots])

  const djConv = useMemo(() => {
    const map = {}
    slots.filter(s => s.tipo_slot === 'convidado').forEach(s => {
      if (!map[s.espaco_id]) map[s.espaco_id] = { n: 0, v: 0 }
      map[s.espaco_id].n++
      map[s.espaco_id].v += parseNum(s.valor)
    })
    const linhas = espacos.filter(e => map[e.id]).map(e => ({ nome: e.nome.trim(), ...map[e.id] }))
    return { linhas, total: linhas.reduce((a, l) => a + l.v, 0) }
  }, [espacos, slots])

  const apoio = useMemo(() => {
    const map = {}
    agendTec.forEach(x => {
      map[x.espaco_id] = (map[x.espaco_id] ?? 0) + parseNum(x.valor)
    })
    eventos.forEach(e => {
      if (e.espaco_id) map[e.espaco_id] = (map[e.espaco_id] ?? 0) + parseNum(e.valor_apoio_tecnico)
    })
    // aplicar override dos cards
    Object.entries(cards).forEach(([eid, card]) => {
      if (card.apoioOverride !== null) map[eid] = parseNum(card.apoioOverride)
    })
    const linhas = espacos.filter(e => map[e.id]).map(e => ({ nome: e.nome.trim(), n: 0, v: map[e.id] }))
    return { linhas, total: linhas.reduce((a, l) => a + l.v, 0) }
  }, [espacos, agendTec, eventos, cards])

  const avencas = useMemo(() => {
    const linhas = espacos
      .filter(e => parseNum(e.valor_avenca) > 0)
      .map(e => ({ nome: e.nome.trim(), n: 0, v: parseNum(e.valor_avenca) }))
    return { linhas, total: linhas.reduce((a, l) => a + l.v, 0) }
  }, [espacos])

  const totalGeral = djRes.total + djConv.total + apoio.total + avencas.total

  return (
    <div className="p-5 flex flex-col gap-5">
      {/* Total geral */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border border-border rounded-xl">
        <p className="text-xs font-bold text-accent-subtle uppercase tracking-widest">Total Geral do Mês</p>
        <p className="text-xl font-bold text-status-confirmado tabular-nums">{formatarEuro(totalGeral)}</p>
      </div>

      {/* Grid 2×2 */}
      <div className="grid grid-cols-2 gap-4">
        <DashboardBloco titulo="DJs Residentes"  linhas={djRes.linhas}  total={djRes.total}  comUnidades />
        <DashboardBloco titulo="DJs Convidados"  linhas={djConv.linhas} total={djConv.total} comUnidades />
        <DashboardBloco titulo="Apoio Técnico"   linhas={apoio.linhas}  total={apoio.total} />
        <DashboardBloco titulo="Avenças"         linhas={avencas.linhas} total={avencas.total} />
      </div>
    </div>
  )
}

// ── Card por Cliente ───────────────────────────────────────────────────────────
function SpaceCard({ espaco, slots, eventos, agendTec, cardState, onCardChange, onSave, saving }) {
  const [editApoio, setEditApoio] = useState(false)
  const [mostrarDetalheRes,  setMostrarDetalheRes]   = useState(false)
  const [mostrarDetalheConv, setMostrarDetalheConv]  = useState(false)
  const [mostrarDetalheEsp,  setMostrarDetalheEsp]   = useState(false)

  const djsRes = useMemo(() => {
    const residentes = slots.filter(s => s.tipo_slot !== 'convidado')
    const n = residentes.length
    const v = residentes.reduce((a,s) => a + parseNum(s.valor), 0)
    // Agrupar por turno
    const turnoMap = {}
    ;(espaco.turnos_espaco ?? []).forEach(t => { turnoMap[t.id] = t.nome })
    const porTurno = {}
    residentes.forEach(s => {
      const key  = s.turno_id ?? '__sem_turno__'
      const nome = s.turno_id ? (turnoMap[s.turno_id] ?? 'Turno desconhecido') : 'Sem turno'
      if (!porTurno[key]) porTurno[key] = { nome, n: 0, v: 0 }
      porTurno[key].n++
      porTurno[key].v += parseNum(s.valor)
    })
    const turnos = Object.values(porTurno).filter(t => t.n > 0)
    return { n, v, turnos }
  }, [slots, espaco])

  const djsConv = useMemo(() => ({
    n: slots.filter(s => s.tipo_slot === 'convidado').length,
    v: slots.filter(s => s.tipo_slot === 'convidado').reduce((a,s) => a + parseNum(s.valor), 0),
    lista: slots.filter(s => s.tipo_slot === 'convidado').map(s => ({
      nome:  s.dj_nome || s.djs?.nome_artistico || s.djs?.nome || 'DJ Convidado',
      data:  s.data, inicio: s.hora_inicio, fim: s.hora_fim,
      valor: parseNum(s.valor),
    })),
  }), [slots])

  const espetaculos = useMemo(() => {
    const n = eventos.length
    const v = eventos.reduce((a,e) => a + parseNum(e.valor_artistico ?? e.valor), 0)
    // Contagem por tipo para sub-detalhe
    const porTipo = {}
    eventos.forEach(e => {
      const t = e.tipo || 'Outro'
      porTipo[t] = (porTipo[t] ?? 0) + 1
    })
    const resumo = Object.entries(porTipo)
      .map(([tipo, cnt]) => `${cnt} ${tipo}${cnt > 1 && !tipo.endsWith('s') ? 's' : ''}`)
      .join(' · ')
    return { n, v, resumo }
  }, [eventos])

  const apoioEventos    = useMemo(() => eventos.reduce((a,e) => a + parseNum(e.valor_apoio_tecnico), 0), [eventos])
  const apoioEventosN   = useMemo(() => eventos.filter(e => parseNum(e.valor_apoio_tecnico) > 0).length, [eventos])
  const apoioAuto       = useMemo(() => agendTec.reduce((a,x) => a + parseNum(x.valor), 0) + apoioEventos, [agendTec, apoioEventos])
  const apoioTotalN     = agendTec.length + apoioEventosN
  const apoioValor   = cardState.apoioOverride !== null ? parseNum(cardState.apoioOverride) : apoioAuto
  const totalEquip = cardState.equipamentos.reduce((a,r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
  const totalExtra = cardState.extras.reduce((a,r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
  const avenca     = parseNum(espaco.valor_avenca)
  const totalGeral = avenca + djsRes.v + djsConv.v + espetaculos.v + apoioValor + totalEquip + totalExtra

  const updEquip = (i, row) => onCardChange(espaco.id, { ...cardState, equipamentos: cardState.equipamentos.map((r,idx) => idx===i ? row : r), dirty: true })
  const updExtra = (i, row) => onCardChange(espaco.id, { ...cardState, extras:        cardState.extras.map((r,idx)        => idx===i ? row : r), dirty: true })

  const handleApoioEdit = (open) => {
    setEditApoio(open)
    if (open && cardState.apoioOverride === null)
      onCardChange(espaco.id, { ...cardState, apoioOverride: String(apoioAuto), dirty: true })
  }
  const resetApoio = () => {
    setEditApoio(false)
    onCardChange(espaco.id, { ...cardState, apoioOverride: null, dirty: true })
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden flex flex-col">

      {/* Cabeçalho */}
      <div className="px-4 py-3 bg-surface-2 border-b border-border flex items-center justify-between">
        <p className="text-sm font-bold text-accent uppercase tracking-wide">{espaco.nome}</p>
        <div className="flex items-center gap-3">
          {cardState.dirty && (
            <button onClick={() => onSave(espaco.id)} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-status-confirmado/90 hover:bg-status-confirmado text-black text-xs font-semibold disabled:opacity-50">
              <Save size={11} />{saving ? 'A guardar…' : 'Guardar'}
            </button>
          )}
          <p className="text-lg font-bold text-status-confirmado tabular-nums">{formatarEuro(totalGeral)}</p>
        </div>
      </div>

      {/* Linhas fixas */}
      <table className="w-full text-xs border-collapse">
        <colgroup>
          <col className="w-[45%]" />
          <col className="w-[25%]" />
          <col className="w-[30%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border/40 bg-surface-0/30">
            <th className="text-left pl-4 py-1.5 text-[10px] font-semibold text-accent-subtle uppercase tracking-widest">Descrição</th>
            <th className="text-center py-1.5 text-[10px] font-semibold text-accent-subtle uppercase tracking-widest">Unidades</th>
            <th className="text-right pr-4 py-1.5 text-[10px] font-semibold text-accent-subtle uppercase tracking-widest">Total</th>
          </tr>
        </thead>
        <tbody>
          {/* Avença */}
          <tr className="border-b border-border/20">
            <td className="py-2 pl-4 pr-2 text-sm font-medium text-accent">Avença</td>
            <td className="py-2 px-2 text-xs text-accent-subtle text-center">—</td>
            <td className="py-2 pl-2 pr-4 text-right text-sm font-semibold tabular-nums">
              {avenca > 0
                ? <span className="text-accent">{formatarEuro(avenca)}</span>
                : <span className="text-accent-subtle/40 text-xs italic">definir no Cliente</span>}
            </td>
          </tr>

          <LinhaInfo
            label={
              djsRes.turnos.length > 0
                ? <button onClick={() => setMostrarDetalheRes(v => !v)} className="hover:text-accent transition-colors cursor-pointer">
                    DJs Residentes
                  </button>
                : 'DJs Residentes'
            }
            unidades={djsRes.n} unidLabel="atuações" valor={djsRes.v}
          />

          {djsRes.turnos.length > 0 && mostrarDetalheRes && (
            <>
              {djsRes.turnos.map((t, i) => (
                <tr key={i} className="border-b border-border/10 bg-surface-0/40">
                  <td className="py-1.5 pl-8 pr-2 text-[11px] text-accent-muted">{t.nome}</td>
                  <td className="py-1.5 px-2 text-[11px] text-accent-subtle tabular-nums text-center">
                    {t.n} <span className="text-accent-subtle/60">atuações</span>
                  </td>
                  <td className="py-1.5 pl-2 pr-4 text-right text-[11px] tabular-nums font-medium text-accent">
                    {t.v > 0 ? formatarEuro(t.v) : <span className="text-border/30">—</span>}
                  </td>
                </tr>
              ))}
            </>
          )}
          <LinhaInfo
            label={
              djsConv.lista.length > 0
                ? <button onClick={() => setMostrarDetalheConv(v => !v)} className="hover:text-accent transition-colors cursor-pointer">
                    DJs Convidados
                  </button>
                : 'DJs Convidados'
            }
            unidades={djsConv.n} unidLabel="atuações" valor={djsConv.v}
          />

          {djsConv.lista.length > 0 && mostrarDetalheConv && (
            <tr className="border-b border-border/10 bg-surface-0/40">
              <td colSpan={3} className="px-6 pb-2 pt-0">
                <span className="text-[11px] text-accent-muted">
                  {djsConv.lista.map(c => c.nome).join(' · ')}
                </span>
              </td>
            </tr>
          )}

          <LinhaInfo
            label={
              espetaculos.n > 0
                ? <button onClick={() => setMostrarDetalheEsp(v => !v)} className="hover:text-accent transition-colors cursor-pointer">
                    Espetáculos
                  </button>
                : 'Espetáculos'
            }
            unidades={espetaculos.n} unidLabel="eventos" valor={espetaculos.v}
          />

          {espetaculos.n > 0 && espetaculos.resumo && mostrarDetalheEsp && (
            <tr className="border-b border-border/10 bg-surface-0/40">
              <td colSpan={3} className="px-6 pb-2 pt-0">
                <span className="text-[11px] text-accent-muted">{espetaculos.resumo}</span>
              </td>
            </tr>
          )}

          <LinhaInfo
            label={<span className="flex items-center gap-1">Apoio Técnico{cardState.apoioOverride !== null && <span className="text-[10px] text-accent-subtle">(editado)</span>}</span>}
            unidades={apoioTotalN} unidLabel="entradas"
            valor={apoioValor}
            editavel
            editando={editApoio}
            valorEdit={cardState.apoioOverride ?? ''}
            onEdit={handleApoioEdit}
            onChangeEdit={v => onCardChange(espaco.id, { ...cardState, apoioOverride: v, dirty: true })}
            onReset={cardState.apoioOverride !== null ? resetApoio : null}
          />
        </tbody>
      </table>

      {/* Equipamentos + Extras lado a lado */}
      <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40">
        <div>
          <div className="px-3 py-1.5 bg-surface-0/30 border-b border-border/30 flex items-center justify-between">
            <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Equipamentos</p>
            <p className="text-xs font-semibold tabular-nums text-accent">
              {totalEquip > 0 ? formatarEuro(totalEquip) : <span className="text-border/30">—</span>}
            </p>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/20">
                <th className="text-center pl-2 pr-1 py-1 text-[10px] text-accent-subtle font-medium w-10">Unid.</th>
                <th className="text-left px-1 py-1 text-[10px] text-accent-subtle font-medium">Descrição</th>
                <th className="text-right px-1 py-1 text-[10px] text-accent-subtle font-medium w-16">V.Unit</th>
                <th className="text-right pr-2 py-1 text-[10px] text-accent-subtle font-medium w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {cardState.equipamentos.map((row, i) => (
                <LinhaManual key={i} row={row} onChange={r => updEquip(i, r)} />
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="px-3 py-1.5 bg-surface-0/30 border-b border-border/30 flex items-center justify-between">
            <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Extras</p>
            <p className="text-xs font-semibold tabular-nums text-accent">
              {totalExtra > 0 ? formatarEuro(totalExtra) : <span className="text-border/30">—</span>}
            </p>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/20">
                <th className="text-center pl-2 pr-1 py-1 text-[10px] text-accent-subtle font-medium w-10">Unid.</th>
                <th className="text-left px-1 py-1 text-[10px] text-accent-subtle font-medium">Descrição</th>
                <th className="text-right px-1 py-1 text-[10px] text-accent-subtle font-medium w-16">V.Unit</th>
                <th className="text-right pr-2 py-1 text-[10px] text-accent-subtle font-medium w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {cardState.extras.map((row, i) => (
                <LinhaManual key={i} row={row} onChange={r => updExtra(i, r)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total rodapé */}
      <div className="px-4 py-2.5 border-t border-border bg-surface-2 flex items-center justify-between">
        <p className="text-xs font-bold text-accent-subtle uppercase tracking-widest">Total a faturar</p>
        <p className="text-base font-bold text-status-confirmado tabular-nums">{formatarEuro(totalGeral)}</p>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function ContasClientes() {
  const { anoMes } = useMesStore()
  const { espacos, loading: loadingEspacos } = useEspacos()
  const [slots, setSlots]       = useState([])
  const [eventos, setEventos]   = useState([])
  const [agendTec, setAgendTec] = useState([])
  const [loading, setLoading]   = useState(true)
  const [cards, setCards]       = useState({})
  const [saving, setSaving]     = useState({})
  const [espacoAtivo, setEspacoAtivo] = useState(null)
  const [pesquisa, setPesquisa]       = useState('')

  const { dataInicio, dataFim, mes } = useMemo(() => {
    const [ano, mesN] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mesN - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
      mes: anoMes,
    }
  }, [anoMes])

  const carregar = useCallback(async () => {
    setLoading(true)
    const [sRes, eRes, tRes, cRes] = await Promise.all([
      supabase.from('agenda')
        .select('id, dj_id, espaco_id, turno_id, valor, estado, tipo_slot, dj_nome, hora_inicio, hora_fim, data, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim)
        .not('estado', 'in', '("cancelado","faltou","sem_efeito")'),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, tipo, data_evento, valor, valor_artistico, valor_apoio_tecnico, status')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim)
        .neq('status', 'cancelado'),
      supabase.from('agendamentos_tecnicos')
        .select('id, espaco_id, valor, confirmado')
        .gte('data', dataInicio).lte('data', dataFim),
      supabase.from('contas_clientes')
        .select('*').eq('mes', mes),
    ])
    if (!sRes.error) setSlots(sRes.data ?? [])
    if (!eRes.error) setEventos(eRes.data ?? [])
    if (!tRes.error) setAgendTec(tRes.data ?? [])
    if (!cRes.error) {
      const data = cRes.data ?? []
      const newCards = {}
      espacos.forEach(esp => { newCards[esp.id] = initCard(data.filter(s => s.espaco_id === esp.id)) })
      setCards(newCards)
    }
    setLoading(false)
  }, [dataInicio, dataFim, mes, espacos])

  useEffect(() => { if (!loadingEspacos) carregar() }, [carregar, loadingEspacos])

  const handleCardChange = useCallback((id, state) => setCards(p => ({ ...p, [id]: state })), [])

  const handleSave = useCallback(async (espacoId) => {
    const card = cards[espacoId]; if (!card) return
    setSaving(p => ({ ...p, [espacoId]: true }))
    try {
      await supabase.from('contas_clientes').delete()
        .eq('espaco_id', espacoId).eq('mes', mes)
        .in('tipo', ['equipamento','extra','apoio_tecnico'])
      const inserts = []
      if (card.apoioOverride !== null && card.apoioOverride !== '') {
        inserts.push({ espaco_id: espacoId, mes, tipo: 'apoio_tecnico',
          valor: parseNum(card.apoioOverride), unidades: 1, valor_unitario: parseNum(card.apoioOverride) })
      }
      ;[...card.equipamentos.map(r => ({ ...r, tipo: 'equipamento' })),
        ...card.extras.map(r => ({ ...r, tipo: 'extra' }))
      ].forEach(r => {
        const val = parseNum(r.unidades) * parseNum(r.valor_unitario)
        if (val > 0 || r.descricao) inserts.push({
          espaco_id: espacoId, mes, tipo: r.tipo,
          descricao: r.descricao || null,
          unidades: Number(r.unidades) || 1,
          valor_unitario: parseNum(r.valor_unitario),
          valor: val,
        })
      })
      if (inserts.length > 0) await supabase.from('contas_clientes').insert(inserts)
      setCards(p => ({ ...p, [espacoId]: { ...p[espacoId], dirty: false } }))
    } catch (e) { console.error('Erro ao guardar:', e) }
    finally { setSaving(p => ({ ...p, [espacoId]: false })) }
  }, [cards, mes])

  const espacosFiltrados = useMemo(() => {
    if (!pesquisa.trim()) return espacos
    const q = pesquisa.trim().toLowerCase()
    return espacos.filter(e => e.nome.toLowerCase().includes(q))
  }, [espacos, pesquisa])

  const espacoDetalhe = useMemo(
    () => espacos.find(e => e.id === espacoAtivo) ?? null,
    [espacos, espacoAtivo]
  )

  if (loading || loadingEspacos) return <LoadingPage />

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Chips: Dashboard + Clientes + pesquisa */}
      <div className="shrink-0 px-5 py-2 border-b border-border/50 bg-surface-0/40 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setEspacoAtivo(null); setPesquisa('') }}
          className={clsx(
            'px-3 py-1.5 rounded text-xs transition-colors border',
            espacoAtivo === null
              ? 'bg-surface-3 text-accent border-white/20 font-medium'
              : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
          )}
        >
          Dashboard
        </button>
        {espacos.map(e => (
          <button key={e.id}
            onClick={() => { setEspacoAtivo(e.id); setPesquisa('') }}
            className={clsx(
              'px-3 py-1.5 rounded text-xs transition-colors border',
              espacoAtivo === e.id
                ? 'bg-surface-3 text-accent border-white/20 font-medium'
                : 'bg-surface-2 text-accent-muted border-border hover:text-accent'
            )}
          >
            {e.nome.trim()}
          </button>
        ))}

        {espacoAtivo === null && (
          <div className="relative ml-auto">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
            <input type="text" value={pesquisa}
              onChange={e => setPesquisa(e.target.value)}
              placeholder="Pesquisar cliente…"
              className="pl-7 pr-7 py-1.5 text-xs bg-surface-2 border border-border rounded text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 w-44"
            />
            {pesquisa && (
              <button onClick={() => setPesquisa('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent">
                <X size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto">

        {/* Dashboard */}
        {espacoAtivo === null && (
          <Dashboard
            espacos={espacos}
            slots={slots}
            eventos={eventos}
            agendTec={agendTec}
            cards={cards}
          />
        )}

        {/* Detalhe Cliente — card centrado */}
        {espacoAtivo !== null && espacoDetalhe && (
          <div className="p-5 flex justify-center">
            <div className="w-full max-w-4xl">
              <SpaceCard
                espaco={espacoDetalhe}
                slots={slots.filter(s => s.espaco_id === espacoAtivo)}
                eventos={eventos.filter(e => e.espaco_id === espacoAtivo)}
                agendTec={agendTec.filter(a => a.espaco_id === espacoAtivo)}
                cardState={cards[espacoAtivo] ?? initCard([])}
                onCardChange={handleCardChange}
                onSave={handleSave}
                saving={!!saving[espacoAtivo]}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
