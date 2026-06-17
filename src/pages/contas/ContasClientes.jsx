import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import {
  Save, Search, X, Plus, Trash2, ChevronDown, ChevronRight,
  MessageSquare, Link2, Check, Calendar, ExternalLink, Printer, AlertTriangle
} from 'lucide-react'
import { useMesStore } from '@/store'
import { useEspacos } from '@/hooks/useEspacos'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'
import { useUndo } from '@/contexts/UndoContext'

const parseNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n }
const uid = () => Math.random().toString(36).slice(2)
const emptyLinha = () => ({ _key: uid(), id: null, descricao: '', unidades: 1, valor_unitario: '', margem: '', margem_tipo: 'eur', notas: '', evento_id: null, imprimir: false, dirty: false })
const itemTotal  = (r) => {
  const sub = parseNum(r.unidades) * parseNum(r.valor_unitario)
  const m = parseNum(r.margem)
  if (m <= 0) return sub
  return r.margem_tipo === 'pct' ? sub * (1 + m / 100) : sub + m
}

const safeParse = (s, fb) => { try { return s ? JSON.parse(s) : fb } catch { return fb } }

const TIPO_SLOT_MAP = {
  'residente anl': 'residente_anl',
  'residente st':  'residente_st',
  'residente':     'residente',
  'convidado int': 'convidado_int',
  'convidado ext': 'convidado_ext',
  'convidado':     'convidado_ext',
  'premium':       'premium',
}
const mapTipoSlot = t => t ? (TIPO_SLOT_MAP[t.trim().toLowerCase()] ?? null) : null

const DJ_CAT_KEYS = ['residente_anl', 'residente', 'residente_st', 'convidado_int', 'convidado_ext', 'premium']
const CAT_DEFS = [
  { key: 'residente_anl', label: 'Residente ANL', grupo: 'Residentes', conflito: true },
  { key: 'residente',     label: 'Residente',     grupo: 'Residentes', conflito: true },
  { key: 'residente_st',  label: 'Residente ST',  grupo: 'Residentes', conflito: true },
  { key: 'convidado_int', label: 'Convidado INT', grupo: null,          conflito: true },
  { key: 'convidado_ext', label: 'Convidado EXT', grupo: null,          conflito: false },
  { key: 'premium',       label: 'Premium',       grupo: null,          conflito: false },
]

// ── Helpers visuais do documento ──────────────────────────────────────────────
const evLabel = (ev) =>
  [ev.evento, ev.data_evento
    ? new Date(ev.data_evento + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
    : null].filter(Boolean).join(' · ')

function DocSectionTitle({ titulo, onSave, saving }) {
  return (
    <div className="px-4 py-2 border-b border-border bg-surface-2 flex items-center gap-2">
      <span className="w-0.5 h-3 rounded-full bg-status-confirmado/60 shrink-0" />
      <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest flex-1">{titulo}</p>
      {onSave && (
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-border/40 text-[10px] text-accent-subtle hover:text-accent hover:border-border transition-colors disabled:opacity-40">
          <Save size={9} className={saving ? 'animate-spin' : ''} />
          {saving ? 'A guardar…' : 'Guardar'}
        </button>
      )}
    </div>
  )
}

function ColsHeader({ cols }) {
  return (
    <tr className="border-b border-border/40 bg-surface-0/30">
      {cols.map((c, i) => (
        <th key={i} className={clsx(
          'py-1.5 text-[13px] font-bold text-white/65 uppercase tracking-wider',
          c.right ? 'text-right pr-4' : c.center ? 'text-center px-2' : 'text-left pl-4 pr-2'
        )}>{c.l}</th>
      ))}
    </tr>
  )
}

function NotaExpandRow({ nota, eventoId, eventos, onChange, colSpan }) {
  return (
    <tr className="bg-surface-0/40 border-b border-border/20">
      <td colSpan={colSpan} className="px-5 py-3">
        <p className="text-[10px] font-bold text-accent-subtle/50 uppercase tracking-widest mb-1.5">
          Nota ou associar a evento
        </p>
        <div className="flex gap-2 flex-wrap items-start">
          <textarea
            rows={1}
            value={nota ?? ''}
            onChange={e => onChange({ nota: e.target.value, evento_id: eventoId })}
            onClick={e => e.stopPropagation()}
            placeholder="Nota…"
            className="flex-1 min-w-[120px] resize-none bg-surface-2 border border-border/40 rounded-lg px-3 py-1.5 text-xs text-accent placeholder:text-border/30 focus:outline-none focus:border-accent/30 transition-colors"
          />
          {eventos?.length > 0 && (
            <select
              value={eventoId ?? ''}
              onChange={e => onChange({ nota, evento_id: e.target.value || null })}
              onClick={e => e.stopPropagation()}
              className="bg-surface-2 border border-border/40 rounded-lg px-2 py-1.5 text-xs text-accent focus:outline-none focus:border-accent/30 transition-colors"
            >
              <option value="">— nenhum evento —</option>
              {eventos.map(ev => <option key={ev.id} value={ev.id}>{evLabel(ev)}</option>)}
            </select>
          )}
        </div>
      </td>
    </tr>
  )
}

function LinhaManualDoc({ row, onChange, onRemove, eventos, numCols = 6 }) {
  const [notaAberta, setNotaAberta] = useState(false)
  const total = itemTotal(row)
  const temNota = row.notas?.trim() || row.evento_id

  return (
    <>
      <tr onClick={() => setNotaAberta(v => !v)}
        className="border-b border-border/25 group hover:bg-surface-0/30 cursor-pointer transition-colors">
        <td className="py-1.5 pl-4 pr-1">
          <input type="text" value={row.descricao}
            onChange={e => { e.stopPropagation(); onChange({ ...row, descricao: e.target.value }) }}
            onClick={e => e.stopPropagation()}
            placeholder="Item…"
            className="w-full bg-transparent border-b border-transparent group-hover:border-border/20 focus:border-accent/30 py-0.5 text-[13px] text-accent placeholder:text-border/20 focus:outline-none transition-colors" />
        </td>
        <td className="py-1.5 px-2 w-14">
          <input type="number" min="0" step="1" value={row.unidades}
            onChange={e => { e.stopPropagation(); onChange({ ...row, unidades: e.target.value }) }}
            onClick={e => e.stopPropagation()}
            className="w-full bg-transparent border-b border-transparent group-hover:border-border/20 focus:border-accent/30 py-0.5 text-[13px] text-accent text-center focus:outline-none transition-colors" />
        </td>
        <td className="py-1.5 px-1 w-20">
          <input type="number" min="0" step="0.01" value={row.valor_unitario}
            onChange={e => { e.stopPropagation(); onChange({ ...row, valor_unitario: e.target.value }) }}
            onClick={e => e.stopPropagation()}
            placeholder="0,00"
            className="w-full bg-transparent border-b border-transparent group-hover:border-border/20 focus:border-accent/30 py-0.5 text-[13px] text-accent text-right placeholder:text-border/15 focus:outline-none transition-colors" />
        </td>
        <td className="py-1.5 px-1 w-20">
          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            <input type="number" min="0" step="0.1" value={row.margem ?? ''}
              onChange={e => { e.stopPropagation(); onChange({ ...row, margem: e.target.value }) }}
              onClick={e => e.stopPropagation()}
              placeholder="0"
              className="w-full bg-transparent border-b border-transparent group-hover:border-border/20 focus:border-accent/30 py-0.5 text-[13px] text-accent text-right placeholder:text-border/15 focus:outline-none transition-colors" />
            <button
              onClick={e => { e.stopPropagation(); onChange({ ...row, margem_tipo: row.margem_tipo === 'pct' ? 'eur' : 'pct', dirty: true }) }}
              title="Alternar €/%"
              className="shrink-0 text-[9px] font-bold w-6 text-center rounded transition-colors text-accent-subtle/50 hover:text-accent">
              {row.margem_tipo === 'pct' ? '%' : '€'}
            </button>
          </div>
        </td>
        <td className="py-1.5 pr-1 w-20 text-right text-[13px] font-bold tabular-nums">
          {total > 0 ? <span className="text-accent">{formatarEuro(total)}</span> : <span className="text-border/15">—</span>}
        </td>
        <td className="py-1.5 pr-3 w-14">
          <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
            {temNota && <MessageSquare size={10} className="text-status-confirmado/50 mr-0.5" />}
            <button onClick={e => { e.stopPropagation(); onChange({ ...row, imprimir: !row.imprimir, dirty: true }) }}
              title={row.imprimir ? 'Não imprimir detalhes' : 'Imprimir detalhes'}
              className={`p-1 rounded transition-colors ${row.imprimir ? 'text-accent' : 'text-border/20 hover:text-border/50'}`}>
              <Printer size={10} />
            </button>
            <button onClick={e => { e.stopPropagation(); onRemove() }}
              className="p-1 rounded text-border/25 hover:text-red-400/60 transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 size={10} />
            </button>
          </div>
        </td>
      </tr>
      {notaAberta && (
        <NotaExpandRow nota={row.notas} eventoId={row.evento_id} eventos={eventos}
          onChange={({ nota, evento_id }) => onChange({ ...row, notas: nota, evento_id })}
          colSpan={numCols} />
      )}
    </>
  )
}

function LinhaAutoDoc({ notaKey, label, n, v, sub, notasMap, onNotaChange, eventos, numCols = 3 }) {
  const [notaAberta, setNotaAberta] = useState(false)
  const [subAberto, setSubAberto] = useState(false)
  const temNota = notasMap?.[notaKey]?.trim()

  return (
    <>
      <tr onClick={() => setNotaAberta(p => !p)}
        className="border-b border-border/25 hover:bg-surface-0/30 cursor-pointer group transition-colors">
        <td className="py-2 pl-4 pr-2">
          <div className="flex items-center gap-1.5">
            {sub?.length > 0
              ? <button onClick={e => { e.stopPropagation(); setSubAberto(p => !p) }}
                  className="p-0.5 text-border/30 hover:text-accent-subtle transition-colors shrink-0">
                  <ChevronRight size={10} className={clsx('transition-transform', subAberto && 'rotate-90')} />
                </button>
              : <span className="w-[18px] shrink-0" />}
            <span className="text-[13px] text-accent">{label}</span>
            {temNota && <MessageSquare size={9} className="text-status-confirmado/50" />}
          </div>
        </td>
        <td className="py-2 px-2 text-center text-[13px] text-accent-subtle/60 tabular-nums">
          <span className={n > 0 ? 'text-accent-subtle/60' : 'text-accent-subtle/30'}>{n}</span>
        </td>
        <td className="py-2 pr-4 text-right text-[13px] font-bold tabular-nums">
          <span className={v > 0 ? 'text-accent' : 'text-accent-subtle/30'}>{formatarEuro(v)}</span>
        </td>
      </tr>
      {subAberto && sub?.map((s, i) => (
        <tr key={i} className="border-b border-border/5 bg-surface-0/25">
          <td className="py-1.5 pl-10 pr-2 text-xs text-accent-muted">{s.label}</td>
          <td className="py-1.5 px-2 text-center text-xs text-accent-subtle/50 tabular-nums">{s.n > 0 ? s.n : '—'}</td>
          <td className="py-1.5 pr-4 text-right text-xs font-medium text-accent tabular-nums">
            {s.v > 0 ? formatarEuro(s.v) : <span className="text-border/15">—</span>}
          </td>
        </tr>
      ))}
      {notaAberta && (
        <NotaExpandRow nota={notasMap?.[notaKey] ?? ''} eventoId={null} eventos={eventos}
          onChange={({ nota }) => onNotaChange(notaKey, nota)} colSpan={numCols} />
      )}
    </>
  )
}

// ── Secções do documento ──────────────────────────────────────────────────────

function SecAvencas({ espaco, avenca, notasMap, onNotaChange, eventos, onSave, saving }) {
  const [notaAberta, setNotaAberta] = useState(false)
  return (
    <div className="flex flex-col border border-white/8 rounded-lg overflow-hidden">
      <DocSectionTitle titulo="Avenças" onSave={onSave} saving={saving} />
      <table className="w-full text-xs border-collapse">
        <thead><ColsHeader cols={[{ l: 'Item' }, { l: 'Unid.', center: true }, { l: 'Valor', right: true }, { l: 'Subtotal', right: true }]} /></thead>
        <tbody>
          {avenca > 0 ? (
            <>
              <tr onClick={() => setNotaAberta(v => !v)}
                className="border-b border-border/25 hover:bg-surface-0/30 cursor-pointer group transition-colors">
                <td className="py-2 pl-4 pr-2 text-[13px] text-accent">
                  <div className="flex items-center gap-1.5">
                    <span>Avença {espaco.nome}</span>
                    {notasMap['avenca']?.trim() && <MessageSquare size={9} className="text-status-confirmado/50" />}
                  </div>
                </td>
                <td className="py-2 px-2 text-center text-[13px] text-accent-subtle/60 tabular-nums">1</td>
                <td className="py-2 px-1 text-right text-[13px] text-accent tabular-nums">{formatarEuro(avenca)}</td>
                <td className="py-2 pr-4 text-right text-[13px] font-bold text-accent tabular-nums">{formatarEuro(avenca)}</td>
              </tr>
              {notaAberta && (
                <NotaExpandRow nota={notasMap['avenca']} eventoId={null} eventos={eventos}
                  onChange={({ nota }) => onNotaChange('avenca', nota)} colSpan={4} />
              )}
            </>
          ) : (
            <tr><td colSpan={4} className="py-5 pl-4 text-[11px] text-border/20 italic">Sem avença configurada</td></tr>
          )}
        </tbody>
      </table>
      <div className="mt-auto border-t border-border bg-surface-2 px-4 py-2.5 flex justify-between items-center">
        <span className="text-[10px] font-bold text-accent-subtle/60 uppercase tracking-widest">Total</span>
        <span className={clsx('text-sm font-black tabular-nums', avenca > 0 ? 'text-status-confirmado' : 'text-border/20')}>{formatarEuro(avenca)}</span>
      </div>
    </div>
  )
}

// formata lista de datas/horas inline: "06 jun 21h, 07 jun 17h e 23 jun 21h"
function fmtDates(items, dateKey = 'data_evento', horaKey = 'hora_inicio') {
  const parts = items.map(x => {
    const d = x[dateKey] ? new Date(x[dateKey] + 'T12:00:00') : null
    const dia = d ? d.getDate() + ' ' + d.toLocaleDateString('pt-PT', { month: 'short' }) : ''
    const hora = x[horaKey] ? x[horaKey].slice(0, 5) + 'h' : ''
    return [dia, hora].filter(Boolean).join(' ')
  }).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  return parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1]
}

function fmtDayNums(slots) {
  const days = slots
    .map(s => s.data ? String(new Date(s.data + 'T12:00:00').getDate()).padStart(2, '0') : null)
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b))
  if (!days.length) return ''
  if (days.length === 1) return days[0]
  return days.slice(0, -1).join(', ') + ' e ' + days[days.length - 1]
}

function slotRate(slot, subtiposConfig, catTotals) {
  const tipo = mapTipoSlot(slot.tipo_slot)
  if (!tipo) return 0
  if (subtiposConfig?.length > 0) {
    const doy = slot.data ? new Date(slot.data + 'T12:00:00').getDay() : -1
    const sub = (doy >= 0 ? subtiposConfig.find(s => s.tipo === tipo && s.dias.includes(doy)) : null)
      ?? subtiposConfig.find(s => s.tipo === tipo)
    if (sub?.total > 0) return sub.total
  }
  return catTotals?.[tipo]?.total ?? 0
}

const ADD_BTNS = [
  { label: '+ Aluguer', campo: 'equipamentos_alugado' },
  { label: '+ Compra',  campo: 'equipamentos_comprado' },
  { label: '+ Extra',   campo: 'extras' },
]

function AddItemForm({ descricaoInit, onAdd, onCancel }) {
  const [descricao, setDescricao] = useState(descricaoInit ?? '')
  const [unidades, setUnidades] = useState(1)
  const [valorUnit, setValorUnit] = useState('')
  const [notas, setNotas] = useState('')

  return (
    <div className="flex flex-col gap-2 pt-1" onClick={e => e.stopPropagation()}>
      <div className="grid grid-cols-[1fr_52px_76px] gap-1.5">
        <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
          placeholder="Descrição…" autoFocus
          className="bg-surface-2 border border-border/40 rounded-lg px-2.5 py-1.5 text-xs text-accent placeholder:text-border/30 focus:outline-none focus:border-accent/30 transition-colors" />
        <input type="number" min="0" step="1" value={unidades} onChange={e => setUnidades(e.target.value)}
          className="bg-surface-2 border border-border/40 rounded-lg px-2 py-1.5 text-xs text-accent text-center focus:outline-none focus:border-accent/30 transition-colors" />
        <input type="number" min="0" step="0.01" value={valorUnit} onChange={e => setValorUnit(e.target.value)}
          placeholder="€/un"
          className="bg-surface-2 border border-border/40 rounded-lg px-2 py-1.5 text-xs text-accent text-right placeholder:text-border/30 focus:outline-none focus:border-accent/30 transition-colors" />
      </div>
      <textarea rows={1} value={notas} onChange={e => setNotas(e.target.value)}
        placeholder="Nota…"
        className="w-full resize-none bg-surface-2 border border-border/40 rounded-lg px-2.5 py-1.5 text-xs text-accent placeholder:text-border/30 focus:outline-none focus:border-accent/30 transition-colors" />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel}
          className="px-3 py-1 rounded-lg text-[11px] text-accent-subtle hover:text-accent transition-colors">Cancelar</button>
        <button onClick={() => onAdd({ descricao, unidades: Number(unidades) || 1, valorUnit, notas })}
          className="px-3 py-1 rounded-lg bg-status-confirmado/80 hover:bg-status-confirmado text-black text-[11px] font-bold transition-colors">
          Adicionar
        </button>
      </div>
    </div>
  )
}

function ExpandAddPanel({ nome, onAddItem }) {
  const [ativo, setAtivo] = useState(null)
  return (
    <div className="flex flex-col gap-2" onClick={e => e.stopPropagation()}>
      {!ativo
        ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-border/35 uppercase tracking-widest">Adicionar:</span>
            {ADD_BTNS.map(({ label, campo }) => (
              <button key={campo} onClick={() => setAtivo(campo)}
                className="px-2.5 py-0.5 rounded-lg text-[11px] border border-border/30 text-accent-subtle/60 hover:text-status-confirmado/70 hover:border-status-confirmado/30 transition-colors whitespace-nowrap">
                {label}
              </button>
            ))}
          </div>
        )
        : (
          <AddItemForm
            descricaoInit={nome}
            onCancel={() => setAtivo(null)}
            onAdd={({ descricao, unidades, valorUnit, notas }) => {
              onAddItem(ativo, descricao, unidades, valorUnit, notas)
              setAtivo(null)
            }}
          />
        )
      }
    </div>
  )
}

function InlineAddSection({ nome, onAddItem, className, children }) {
  const [ativo, setAtivo] = useState(null)
  return (
    <>
      <div className={clsx('group flex items-center gap-2 hover:bg-surface-0/25 transition-colors', className)}>
        {children}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {ADD_BTNS.map(({ label, campo }) => (
            <button key={campo}
              onClick={e => { e.stopPropagation(); setAtivo(p => p === campo ? null : campo) }}
              className={clsx(
                'px-1.5 py-0.5 text-[9px] border rounded whitespace-nowrap transition-colors',
                ativo === campo
                  ? 'border-status-confirmado/40 text-status-confirmado/70 bg-status-confirmado/10'
                  : 'border-border/25 text-accent-subtle/50 hover:text-status-confirmado/70 hover:border-status-confirmado/30'
              )}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {ativo && (
        <div className="px-5 py-3 bg-surface-0/25 border-t border-border/10" onClick={e => e.stopPropagation()}>
          <AddItemForm
            descricaoInit={nome}
            onCancel={() => setAtivo(null)}
            onAdd={({ descricao, unidades, valorUnit, notas }) => {
              onAddItem(ativo, descricao, unidades, valorUnit, notas)
              setAtivo(null)
            }}
          />
        </div>
      )}
    </>
  )
}

function BillingIcons({ ev, cardState }) {
  const temNota = ev.notas_faturacao?.trim()
  const temAlug = cardState.equipamentos_alugado.some(r => r.evento_id === ev.id)
  const temComp = cardState.equipamentos_comprado.some(r => r.evento_id === ev.id)
  const temExtra = cardState.extras.some(r => r.evento_id === ev.id)
  if (!temNota && !temAlug && !temComp && !temExtra) return null
  return (
    <div className="flex items-center gap-1 ml-1">
      {temNota  && <span className="px-1 py-px rounded text-[9px] font-bold bg-blue-500/15 text-blue-400/80">N</span>}
      {temAlug  && <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-500/15 text-amber-400/80">A</span>}
      {temComp  && <span className="px-1 py-px rounded text-[9px] font-bold bg-violet-500/15 text-violet-400/80">C</span>}
      {temExtra && <span className="px-1 py-px rounded text-[9px] font-bold bg-status-confirmado/15 text-status-confirmado/80">E</span>}
    </div>
  )
}

function SecApoioTecnico({ eventos, annotatedIds, apoioOverride, onOverrideChange, onOverrideClear, onAddItem, cardState, onSave, saving }) {
  const [expandido, setExpandido] = useState(false)
  const [gruposAbertos, setGruposAbertos] = useState({})
  const [paineis, setPaineis] = useState({})
  const toggleGrupo = k => setGruposAbertos(p => ({ ...p, [k]: !p[k] }))
  const togglePainel = k => setPaineis(p => ({ ...p, [k]: !p[k] }))

  // Separar eventos anotados (isolados) dos restantes (agrupáveis)
  const { grupos, anotados } = useMemo(() => {
    const normais = eventos.filter(ev => !annotatedIds.has(ev.id))
    const anotados = eventos.filter(ev => annotatedIds.has(ev.id))
    const map = {}
    normais.forEach(ev => {
      const nome = (ev.evento ?? 'Sem nome').trim()
      if (!map[nome]) map[nome] = { nome, items: [] }
      map[nome].items.push(ev)
    })
    const grupos = Object.values(map).map(g => ({
      nome: g.nome,
      n: g.items.length,
      valor: g.items.reduce((a, e) => a + parseNum(e.valor_apoio_tecnico), 0),
      items: g.items,
    }))
    return { grupos, anotados }
  }, [eventos, annotatedIds])

  const totalN    = eventos.length
  const totalAuto = [...grupos, ...anotados.map(ev => ({ valor: parseNum(ev.valor_apoio_tecnico) }))]
    .reduce((a, g) => a + g.valor, 0)
  const totalValor = apoioOverride !== null ? parseNum(apoioOverride) : totalAuto

  const fmtData = ev => {
    if (!ev.data_evento) return ''
    const d = new Date(ev.data_evento + 'T12:00:00')
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) +
      (ev.hora_inicio ? ' ' + ev.hora_inicio.slice(0, 5) + 'h' : '')
  }

  return (
    <div className="flex flex-col border border-white/8 rounded-lg overflow-hidden">
      <DocSectionTitle titulo="Apoio Técnico" onSave={onSave} saving={saving} />
      <table className="w-full text-[13px] border-collapse">
        <thead><ColsHeader cols={[{ l: 'Item' }, { l: 'Unid.', center: true }, { l: 'Subtotal', right: true }]} /></thead>
        <tbody>
          {/* Linha-mãe */}
          <tr onClick={() => setExpandido(p => !p)}
            className="border-b border-border/25 hover:bg-surface-0/30 cursor-pointer transition-colors">
            <td className="py-2 pl-4 pr-2">
              <div className="flex items-center gap-1.5">
                <ChevronRight size={10} className={clsx('text-border/30 shrink-0 transition-transform', expandido && 'rotate-90')} />
                <span className="text-[13px] text-accent">Apoio Técnico a Eventos e Espetáculos</span>
              </div>
            </td>
            <td className="py-2 px-2 text-center text-[13px] text-accent-subtle/60 tabular-nums">{totalN}</td>
            <td className="py-2 pr-4 text-right text-[13px] font-bold tabular-nums">
              <span className={totalAuto > 0 ? 'text-accent' : 'text-accent-subtle/30'}>{formatarEuro(totalAuto)}</span>
            </td>
          </tr>

          {expandido && (
            <>
              {/* Eventos anotados — cada um como linha isolada */}
              {anotados.map(ev => {
                const evKey = `ann:${ev.id}`
                return (
                  <React.Fragment key={ev.id}>
                    <tr onClick={() => togglePainel(evKey)}
                      className="border-b border-border/15 bg-surface-0/20 cursor-pointer hover:bg-surface-0/35 transition-colors">
                      <td className="py-1.5 pl-9 pr-2">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight size={9} className={clsx('text-border/25 shrink-0 transition-transform', paineis[evKey] && 'rotate-90')} />
                          <span className="text-xs text-accent">{ev.evento}</span>
                          <span className="text-[10px] text-border/40">{fmtData(ev)}</span>
                          <BillingIcons ev={ev} cardState={cardState} />
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-center text-xs text-accent-subtle/60 tabular-nums">1</td>
                      <td className="py-1.5 pr-4 text-right text-xs font-medium tabular-nums">
                        <span className={parseNum(ev.valor_apoio_tecnico) > 0 ? 'text-accent' : 'text-accent-subtle/30'}>
                          {formatarEuro(parseNum(ev.valor_apoio_tecnico))}
                        </span>
                      </td>
                    </tr>
                    {paineis[evKey] && (
                      <tr className="border-b border-border/10 bg-surface-0/35">
                        <td colSpan={3} className="px-5 py-3">
                          <ExpandAddPanel nome={ev.evento} onAddItem={onAddItem} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}

              {/* Grupos por nome (eventos sem anotações) */}
              {grupos.map(g => {
                const datas = fmtDates(g.items)
                const label = g.n > 1 ? `${g.nome} (${datas})` : `${g.nome}${datas ? ' · ' + datas : ''}`
                const gKey = `g:${g.nome}`
                const isOpen = g.n > 1 ? gruposAbertos[g.nome] : paineis[gKey]
                return (
                  <React.Fragment key={g.nome}>
                    <tr onClick={() => g.n > 1 ? toggleGrupo(g.nome) : togglePainel(gKey)}
                      className="border-b border-border/15 bg-surface-0/20 cursor-pointer hover:bg-surface-0/35 transition-colors">
                      <td className="py-1.5 pl-9 pr-2">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight size={9} className={clsx('text-border/25 shrink-0 transition-transform', isOpen && 'rotate-90')} />
                          <span className="text-xs text-accent">{label}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-center text-xs text-accent-subtle/60 tabular-nums">{g.n}</td>
                      <td className="py-1.5 pr-4 text-right text-xs font-medium tabular-nums">
                        <span className={g.valor > 0 ? 'text-accent' : 'text-accent-subtle/30'}>{formatarEuro(g.valor)}</span>
                      </td>
                    </tr>

                    {/* Painel add — apenas para eventos únicos (n=1) */}
                    {g.n === 1 && paineis[gKey] && (
                      <tr className="border-b border-border/10 bg-surface-0/35">
                        <td colSpan={3} className="px-5 py-3">
                          <ExpandAddPanel nome={g.nome} onAddItem={onAddItem} />
                        </td>
                      </tr>
                    )}

                    {/* Sub-rows para grupos múltiplos — apenas informação, sem add */}
                    {g.n > 1 && gruposAbertos[g.nome] && g.items.map(ev => (
                      <tr key={ev.id} className="border-b border-border/10 bg-surface-0/30">
                        <td colSpan={3} className="py-1.5 pl-14 pr-3">
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-px bg-border/20 shrink-0" />
                            <span className="text-[11px] text-border/50 shrink-0">{fmtData(ev)}</span>
                            {parseNum(ev.valor_apoio_tecnico) > 0 && (
                              <span className="text-[11px] text-accent-subtle/35 tabular-nums">
                                {formatarEuro(parseNum(ev.valor_apoio_tecnico))}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}

              {grupos.length === 0 && anotados.length === 0 && (
                <tr><td colSpan={3} className="py-4 pl-9 text-[11px] text-border/15 italic">Sem eventos este mês</td></tr>
              )}
            </>
          )}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-border/15 bg-surface-0/10 flex items-center justify-between gap-2">
        <span className="text-[10px] text-accent-subtle/30 uppercase tracking-widest shrink-0">override</span>
        <div className="flex items-center gap-2">
          {apoioOverride !== null && (
            <button onClick={onOverrideClear}
              className="text-[10px] text-status-confirmado/50 hover:text-status-confirmado/70 transition-colors">repor auto</button>
          )}
          <input type="number" min="0" step="0.01"
            value={apoioOverride ?? totalAuto}
            onChange={e => onOverrideChange(e.target.value)}
            className="w-24 bg-surface-2 border border-border/25 rounded-lg px-2 py-1 text-xs text-accent text-right focus:outline-none focus:border-accent/30 transition-colors" />
        </div>
      </div>
      <div className="mt-auto border-t border-border bg-surface-2 px-4 py-2.5 flex justify-between items-center">
        <span className="text-[10px] font-bold text-accent-subtle/60 uppercase tracking-widest">Total</span>
        <span className={clsx('text-sm font-black tabular-nums', totalValor > 0 ? 'text-status-confirmado' : 'text-border/20')}>{formatarEuro(totalValor)}</span>
      </div>
    </div>
  )
}

function SecAtuacoesDJ({ slots, catTotals, subtiposConfig, totalDJs, onAddItem, djImprimir, onDjImprimirChange, onSave, saving }) {
  const [residAberto, setResidAberto] = useState(true)
  const [abertos, setAbertos] = useState({})
  const [paineis, setPaineis] = useState({})
  const toggle = k => setAbertos(p => ({ ...p, [k]: !p[k] }))
  const togglePainel = k => setPaineis(p => ({ ...p, [k]: !p[k] }))

  const cats = useMemo(() => CAT_DEFS.map(def => {
    const catSlots = slots.filter(s => mapTipoSlot(s.tipo_slot) === def.key)
    const djMap = {}
    let billing = 0
    catSlots.forEach(s => {
      const rate = slotRate(s, subtiposConfig, catTotals)
      billing += rate
      const nome = s.dj_nome || s.djs?.nome_artistico || s.djs?.nome || 'DJ'
      if (!djMap[nome]) djMap[nome] = { nome, slots: [], billing: 0 }
      djMap[nome].slots.push(s)
      djMap[nome].billing += rate
    })
    return { ...def, n: catSlots.length, billing, djs: Object.values(djMap) }
  }), [slots, subtiposConfig, catTotals])

  const residentes = cats.filter(c => c.grupo === 'Residentes' && c.n > 0)
  const standalone = cats.filter(c => !c.grupo && c.n > 0)
  const totalResid = residentes.reduce((a, c) => a + c.billing, 0)
  const nResid     = residentes.reduce((a, c) => a + c.n, 0)

  const renderCatRow = (cat, indented) => (
    <React.Fragment key={cat.key}>
      <tr onClick={() => toggle(cat.key)}
        className="border-b border-border/25 hover:bg-surface-0/30 cursor-pointer transition-colors">
        <td className={clsx('py-2 pr-2', indented ? 'pl-8' : 'pl-4')}>
          <div className="flex items-center gap-1.5">
            <ChevronRight size={10} className={clsx('text-border/30 shrink-0 transition-transform', abertos[cat.key] && 'rotate-90')} />
            <span className="text-[13px] text-accent">{cat.label}</span>
          </div>
        </td>
        <td className="py-2 px-2 text-center text-[13px] text-accent-subtle/60 tabular-nums">{cat.n}</td>
        <td />
        <td className="py-2 pr-2 text-right text-[13px] font-bold tabular-nums">
          <span className={cat.billing > 0 ? 'text-accent' : 'text-accent-subtle/30'}>{formatarEuro(cat.billing)}</span>
        </td>
        <td className="py-2 pr-3 w-8" onClick={e => e.stopPropagation()}>
          <button onClick={e => { e.stopPropagation(); onDjImprimirChange(cat.key, !djImprimir?.[cat.key]) }}
            title={djImprimir?.[cat.key] ? 'Não imprimir detalhes' : 'Imprimir detalhes'}
            className={`p-1 rounded transition-colors ${djImprimir?.[cat.key] ? 'text-accent' : 'text-border/20 hover:text-border/50'}`}>
            <Printer size={10} />
          </button>
        </td>
      </tr>
      {abertos[cat.key] && cat.djs.map(dj => {
        const djKey = `${cat.key}:${dj.nome}`
        const dias = fmtDayNums(dj.slots)
        const label = `${dj.nome}${dias ? ` (Dias ${dias})` : ''}`
        const unico = dj.slots.length === 1
        return (
          <React.Fragment key={dj.nome}>
            <tr onClick={() => unico && togglePainel(djKey)}
              className={clsx('border-b border-border/15 bg-surface-0/20 transition-colors',
                unico ? 'cursor-pointer hover:bg-surface-0/35' : 'cursor-default')}>
              <td className={clsx('py-1.5 pr-2', indented ? 'pl-14' : 'pl-9')}>
                <div className="flex items-center gap-1.5">
                  {unico
                    ? <ChevronRight size={9} className={clsx('text-border/25 shrink-0 transition-transform', paineis[djKey] && 'rotate-90')} />
                    : <span className="w-2.5 h-px bg-border/20 shrink-0 mx-px" />}
                  <span className="text-xs text-accent">{label}</span>
                </div>
              </td>
              <td className="py-1.5 px-2 text-center text-xs text-accent-subtle/60 tabular-nums">{dj.slots.length}</td>
              <td />
              <td className="py-1.5 pr-2 text-right text-xs font-medium tabular-nums">
                <span className={dj.billing > 0 ? 'text-accent' : 'text-accent-subtle/30'}>{formatarEuro(dj.billing)}</span>
              </td>
              <td />
            </tr>
            {unico && paineis[djKey] && (
              <tr className="border-b border-border/10 bg-surface-0/35">
                <td colSpan={5} className="px-5 py-3">
                  <ExpandAddPanel nome={dj.nome} onAddItem={onAddItem} />
                </td>
              </tr>
            )}
          </React.Fragment>
        )
      })}
    </React.Fragment>
  )

  return (
    <div className="flex flex-col border border-white/8 rounded-lg overflow-hidden">
      <DocSectionTitle titulo="Atuações DJ" onSave={onSave} saving={saving} />
      <table className="w-full text-[13px] border-collapse">
        <thead><ColsHeader cols={[{ l: 'DJ' }, { l: 'Unid.', center: true }, { l: 'Valor/un.', right: true }, { l: 'Total', right: true }, { l: '' }]} /></thead>
        <tbody>
          {cats.every(c => c.n === 0) && (
            <tr><td colSpan={5} className="py-5 pl-4 text-[11px] text-border/15 italic">Sem atuações</td></tr>
          )}
          {/* Residentes — grupo colapsável */}
          {residentes.length > 0 && (
            <>
              <tr onClick={() => setResidAberto(p => !p)}
                className="border-b border-border/30 bg-surface-1/40 cursor-pointer hover:bg-surface-1/60 transition-colors">
                <td className="py-1.5 pl-4 pr-2">
                  <div className="flex items-center gap-1.5">
                    <ChevronRight size={10} className={clsx('text-border/40 shrink-0 transition-transform', residAberto && 'rotate-90')} />
                    <span className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Residentes</span>
                  </div>
                </td>
                <td className="py-1.5 px-2 text-center text-[10px] text-accent-subtle/50 tabular-nums">{nResid}</td>
                <td />
                <td className="py-1.5 pr-2 text-right text-[10px] font-bold text-accent-subtle tabular-nums">{formatarEuro(totalResid)}</td>
                <td />
              </tr>
              {residAberto && residentes.map(cat => renderCatRow(cat, true))}
            </>
          )}
          {/* Convidado INT, EXT, Premium */}
          {standalone.map(cat => renderCatRow(cat, false))}
        </tbody>
      </table>
      <div className="mt-auto border-t border-border bg-surface-2 px-4 py-2.5 flex justify-between items-center">
        <span className="text-[10px] font-bold text-accent-subtle/60 uppercase tracking-widest">Total</span>
        <span className={clsx('text-sm font-black tabular-nums', totalDJs > 0 ? 'text-status-confirmado' : 'text-border/20')}>{formatarEuro(totalDJs)}</span>
      </div>
    </div>
  )
}

function SecManualItems({ titulo, linhas, total, onChange, eventos, onSave, saving }) {
  const addLinha = () => onChange([...linhas, emptyLinha()])
  const updLinha = (key, row) => onChange(linhas.map(r => r._key === key ? { ...row, dirty: true } : r))
  const remLinha = (key) => onChange(linhas.filter(r => r._key !== key))
  return (
    <div className="flex flex-col border border-white/8 rounded-lg overflow-hidden">
      <DocSectionTitle titulo={titulo} onSave={onSave} saving={saving} />
      <table className="w-full text-xs border-collapse">
        <thead><ColsHeader cols={[{ l: 'Item' }, { l: 'Unid.', center: true }, { l: 'V.Unit.', right: true }, { l: 'Marg.', right: true }, { l: 'Subtotal', right: true }, { l: '' }]} /></thead>
        <tbody>
          {linhas.map(row => (
            <LinhaManualDoc key={row._key} row={row} eventos={eventos}
              onChange={r => updLinha(row._key, r)}
              onRemove={() => remLinha(row._key)} numCols={6} />
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={6} className="py-5 pl-4 text-[11px] text-border/15 italic">Sem itens</td></tr>
          )}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-border/15">
        <button onClick={addLinha}
          className="flex items-center gap-1 text-[11px] text-accent-subtle/40 hover:text-status-confirmado/60 transition-colors">
          <Plus size={11} />+ Item
        </button>
      </div>
      <div className="mt-auto border-t border-border bg-surface-2 px-4 py-2.5 flex justify-between items-center">
        <span className="text-[10px] font-bold text-accent-subtle/60 uppercase tracking-widest">Total</span>
        <span className={clsx('text-xs font-bold tabular-nums', total > 0 ? 'text-status-confirmado' : 'text-border/20')}>{formatarEuro(total)}</span>
      </div>
    </div>
  )
}

// ── Tabela resumo no topo ─────────────────────────────────────────────────────
function TabelaResumo({ categorias, total }) {
  const [expandidos, setExpandidos] = useState({})
  const toggle = k => setExpandidos(p => ({ ...p, [k]: !p[k] }))

  return (
    <table className="w-full text-xs border-collapse border-b border-border/30">
      <thead>
        <tr className="border-b border-border/30 bg-surface-0/20">
          <th className="py-2 pl-5 text-left text-xs font-bold text-white/70 uppercase tracking-widest">Categoria</th>
          <th className="py-2 px-3 text-center text-xs font-bold text-white/70 uppercase tracking-widest w-14">Qtd.</th>
          <th className="py-2 pr-5 text-right text-xs font-bold text-white/70 uppercase tracking-widest w-28">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {categorias.map(cat => {
          const hasDetail = cat.detail != null || cat.sub?.length > 0
          return (
            <React.Fragment key={cat.key}>
              <tr
                onClick={() => hasDetail && toggle(cat.key)}
                className={clsx('border-b border-border/15 transition-colors', hasDetail ? 'cursor-pointer hover:bg-surface-0/25' : '')}
              >
                <td className="py-2.5 pl-5 pr-2">
                  <div className="flex items-center gap-2">
                    {hasDetail
                      ? <ChevronRight size={10} className={clsx('text-accent-subtle/30 transition-transform shrink-0', expandidos[cat.key] && 'rotate-90')} />
                      : <span className="w-[10px] shrink-0" />}
                    <span className="text-sm text-accent">{cat.label}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-center tabular-nums">
                  <span className={cat.qtd > 0 ? 'text-accent-subtle/60' : 'text-accent-subtle/30'}>{cat.qtd}</span>
                </td>
                <td className="py-2.5 pr-5 text-right tabular-nums">
                  <span className={cat.valor > 0 ? 'text-accent' : 'text-accent-subtle/30'}>{formatarEuro(cat.valor)}</span>
                </td>
              </tr>
              {expandidos[cat.key] && cat.detail != null && (
                <tr>
                  <td colSpan={3} className="p-0 border-b border-border/15">
                    {cat.detail}
                  </td>
                </tr>
              )}
              {expandidos[cat.key] && cat.detail == null && cat.sub?.map((s, i, arr) => (
                <tr key={i} className={clsx('bg-surface-0/25', i < arr.length - 1 ? 'border-b border-border/8' : '')}>
                  <td className="py-1.5 pl-12 pr-2 text-[11px] text-accent-muted">{s.label}</td>
                  <td className="py-1.5 px-3 text-center text-[11px] text-accent-subtle/40 tabular-nums">{s.qtd || '—'}</td>
                  <td className="py-1.5 pr-5 text-right text-[11px] font-medium text-accent tabular-nums">{s.valor > 0 ? formatarEuro(s.valor) : '—'}</td>
                </tr>
              ))}
            </React.Fragment>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-border bg-surface-2">
          <td colSpan={2} className="py-3 pl-5 text-[10px] font-bold text-accent-subtle uppercase tracking-widest">Total Geral</td>
          <td className="py-3 pr-5 text-right text-base font-bold text-status-confirmado tabular-nums">{formatarEuro(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

// ── Inicializar estado do card a partir de DB ─────────────────────────────────
function initCard(servicos) {
  const toRow = (s) => ({
    _key: s.id ?? uid(),
    id: s.id ?? null,
    descricao: s.descricao ?? '',
    unidades: s.unidades ?? 1,
    valor_unitario: s.valor_unitario != null ? String(s.valor_unitario) : '',
    margem: s.margem != null && Number(s.margem) !== 0 ? String(s.margem) : '',
    margem_tipo: s.margem_tipo ?? 'eur',
    notas: s.notas ?? '',
    evento_id: s.evento_id ?? null,
    imprimir: s.imprimir ?? false,
    dirty: false,
  })
  const pad = (arr, tipo, n = 3) => {
    const rows = arr.filter(s => s.tipo === tipo).map(toRow)
    while (rows.length < n) rows.push(emptyLinha())
    return rows
  }
  const apoioEn = servicos.find(s => s.tipo === 'apoio_tecnico')
  const notasRows = servicos.filter(s => s.tipo === 'nota_auto')
  const notasMap = {}
  notasRows.forEach(r => { notasMap[r.descricao] = r.notas ?? '' })
  const djImprimirRows = servicos.filter(s => s.tipo === 'dj_imprimir')
  const djImprimirMap = Object.fromEntries(DJ_CAT_KEYS.map(k => [k, false]))
  djImprimirRows.forEach(r => { if (r.descricao in djImprimirMap) djImprimirMap[r.descricao] = true })

  return {
    equipamentos_comprado: pad(servicos, 'equipamento_comprado', 0),
    equipamentos_alugado:  pad(servicos, 'equipamento_alugado', 0),
    musicos_bandas:        pad(servicos, 'musicos_bandas', 0),
    extras:                pad(servicos, 'extra'),
    apoioOverride: apoioEn != null ? String(apoioEn.valor ?? '') : null,
    apoioId: apoioEn?.id ?? null,
    notasAuto: notasMap,
    djImprimir: djImprimirMap,
    dirty: false,
  }
}

// ── Card por Cliente ──────────────────────────────────────────────────────────
function SpaceCard({ espaco, slots, eventos, agendTec, cardState, onCardChange, onSave, saving, catTotals, subtiposConfig }) {
  const djCats = useMemo(() => CAT_DEFS.map(def => {
    const catSlots = slots.filter(s => mapTipoSlot(s.tipo_slot) === def.key)
    const djMap = {}
    let billing = 0
    catSlots.forEach(s => {
      const rate = slotRate(s, subtiposConfig, catTotals)
      billing += rate
      const nome = s.dj_nome || s.djs?.nome_artistico || s.djs?.nome || 'DJ'
      if (!djMap[nome]) djMap[nome] = { nome, slots: [], billing: 0 }
      djMap[nome].slots.push(s)
      djMap[nome].billing += rate
    })
    return { ...def, n: catSlots.length, billing, djs: Object.values(djMap) }
  }), [slots, subtiposConfig, catTotals])

  const apoioAuto = useMemo(() =>
    eventos.reduce((a, e) => a + parseNum(e.valor_apoio_tecnico), 0),
    [eventos])
  const apoioValor = cardState.apoioOverride !== null ? parseNum(cardState.apoioOverride) : apoioAuto

  // IDs de eventos com anotações de faturação (notas ou itens ligados)
  const annotatedEventIds = useMemo(() => {
    const ids = new Set()
    eventos.forEach(ev => { if (ev.notas_faturacao?.trim()) ids.add(ev.id) })
    ;[...cardState.equipamentos_comprado, ...cardState.equipamentos_alugado, ...cardState.extras]
      .forEach(r => { if (r.evento_id) ids.add(r.evento_id) })
    return ids
  }, [eventos, cardState.equipamentos_comprado, cardState.equipamentos_alugado, cardState.extras])

  const addToSection = useCallback((campo, descricao, unidades = 1, valorUnit = '', notas = '') => {
    const nova = { ...emptyLinha(), descricao, unidades: Number(unidades) || 1, valor_unitario: String(valorUnit), notas }
    onCardChange(espaco.id, { ...cardState, [campo]: [...cardState[campo], nova], dirty: true })
  }, [cardState, espaco.id, onCardChange])

  const totalComprado = cardState.equipamentos_comprado.reduce((a, r) => a + itemTotal(r), 0)
  const totalAlugado  = cardState.equipamentos_alugado.reduce((a, r)  => a + itemTotal(r), 0)
  const totalMusicos  = cardState.musicos_bandas.reduce((a, r)        => a + itemTotal(r), 0)
  const totalExtras   = cardState.extras.reduce((a, r)                => a + itemTotal(r), 0)

  const avenca = parseNum(espaco.valor_avenca)
  const totalDJs = djCats.reduce((a, c) => a + c.billing, 0)
  const totalGeral = avenca + totalDJs + totalMusicos + apoioValor + totalComprado + totalAlugado + totalExtras

  const upd     = (campo, val) => onCardChange(espaco.id, { ...cardState, [campo]: val, dirty: true })
  const updNota = (key, txt)   => onCardChange(espaco.id, { ...cardState, notasAuto: { ...cardState.notasAuto, [key]: txt }, dirty: true })

  const subTotal = (arr) => arr.filter(r => itemTotal(r) > 0 && r.descricao?.trim())
    .map(r => ({ label: r.descricao, qtd: Number(r.unidades), valor: itemTotal(r) }))

  const avencaDetail = avenca > 0 ? (
    <div className="flex items-center gap-3 px-5 py-2 text-xs bg-surface-0/20">
      <span className="text-accent flex-1">{espaco.nome}</span>
      {cardState.notasAuto['avenca']?.trim() && (
        <span className="text-[11px] text-border/45 italic">{cardState.notasAuto['avenca']}</span>
      )}
      <span className="text-accent tabular-nums">{formatarEuro(avenca)}</span>
    </div>
  ) : null

  const apoioDetail = (
    <div className="bg-surface-0/10">
      {eventos.map(ev => (
        <InlineAddSection key={ev.id} nome={ev.evento || 'Apoio Técnico'} onAddItem={addToSection} className="py-1.5 px-5">
          <span className="text-xs text-accent flex-1 min-w-0 truncate">{ev.evento || 'Sem nome'}</span>
          <span className="text-[10px] text-border/40 shrink-0">{fmtDates([ev])}</span>
          <BillingIcons ev={ev} cardState={cardState} />
          <span className="text-xs text-accent tabular-nums shrink-0">
            {parseNum(ev.valor_apoio_tecnico) > 0 ? formatarEuro(parseNum(ev.valor_apoio_tecnico)) : <span className="text-border/20">—</span>}
          </span>
        </InlineAddSection>
      ))}
      {eventos.length === 0 && <p className="py-3 pl-5 text-[11px] text-border/15 italic">Sem eventos</p>}
      <div className="flex items-center justify-between gap-2 px-5 py-1.5 bg-surface-0/10">
        <span className="text-[10px] text-accent-subtle/30 uppercase tracking-widest">override</span>
        <div className="flex items-center gap-2">
          {cardState.apoioOverride !== null && (
            <button onClick={() => onCardChange(espaco.id, { ...cardState, apoioOverride: null, dirty: true })}
              className="text-[10px] text-status-confirmado/50 hover:text-status-confirmado/70 transition-colors">repor auto</button>
          )}
          <input type="number" min="0" step="0.01"
            value={cardState.apoioOverride ?? apoioAuto}
            onChange={e => onCardChange(espaco.id, { ...cardState, apoioOverride: e.target.value, dirty: true })}
            className="w-24 bg-surface-2 border border-border/25 rounded-lg px-2 py-1 text-xs text-accent text-right focus:outline-none focus:border-accent/30 transition-colors" />
        </div>
      </div>
    </div>
  )

  const djDetail = djCats.some(c => c.n > 0) ? (
    <div className="bg-surface-0/10">
      {djCats.filter(c => c.n > 0).map(cat => (
        <React.Fragment key={cat.key}>
          <div className="flex items-center px-5 py-1 bg-surface-1/30 border-b border-border/15">
            <span className="text-[10px] font-bold text-accent-subtle/70 uppercase tracking-widest flex-1">{cat.label}</span>
            <span className="text-[11px] text-accent tabular-nums">{formatarEuro(cat.billing)}</span>
          </div>
          {cat.djs.map(dj => {
            const dias = fmtDayNums(dj.slots)
            return (
              <InlineAddSection key={dj.nome} nome={dj.nome} onAddItem={addToSection} className="py-1.5 px-9">
                <span className="text-xs text-accent flex-1">{dj.nome}{dias ? ` (Dias ${dias})` : ''}</span>
                <span className="text-xs text-accent tabular-nums">{formatarEuro(dj.billing)}</span>
              </InlineAddSection>
            )
          })}
        </React.Fragment>
      ))}
    </div>
  ) : null

  const musicosDetail = cardState.musicos_bandas.some(r => r.descricao?.trim()) ? (
    <div className="bg-surface-0/10">
      {cardState.musicos_bandas.filter(r => r.descricao?.trim()).map(r => (
        <InlineAddSection key={r._key} nome={r.descricao} onAddItem={addToSection} className="py-1.5 px-5">
          <span className="text-xs text-accent flex-1">{r.descricao}</span>
          <span className="text-xs text-accent-subtle/40 tabular-nums">{Number(r.unidades)}x</span>
          <span className="text-xs text-accent tabular-nums">{formatarEuro(itemTotal(r))}</span>
        </InlineAddSection>
      ))}
    </div>
  ) : null

  const categorias = [
    { key: 'djs',     label: 'Atuações DJ',               qtd: djCats.reduce((a,c) => a + c.n, 0),        valor: totalDJs,     detail: djDetail },
    { key: 'musicos', label: 'Atuações Músicos / Bandas', qtd: subTotal(cardState.musicos_bandas).length, valor: totalMusicos, detail: musicosDetail },
    { key: 'apoio',   label: 'Apoio Técnico',             qtd: eventos.length,                            valor: apoioValor,   detail: apoioDetail },
    { key: 'equip_comprado', label: 'Equipamentos Comprado', qtd: subTotal(cardState.equipamentos_comprado).length, valor: totalComprado, sub: subTotal(cardState.equipamentos_comprado) },
    { key: 'equip_alugado',  label: 'Equipamentos Alugado',  qtd: subTotal(cardState.equipamentos_alugado).length,  valor: totalAlugado,  sub: subTotal(cardState.equipamentos_alugado) },
    { key: 'avenca',  label: 'Avenças',                  qtd: avenca > 0 ? 1 : 0,                       valor: avenca,       detail: avencaDetail },
    { key: 'extras',         label: 'Extras',                qtd: subTotal(cardState.extras).length,                valor: totalExtras,   sub: subTotal(cardState.extras) },
  ]

  const dji = cardState.djImprimir ?? Object.fromEntries(DJ_CAT_KEYS.map(k => [k, false]))
  const handlePrint = () => {
    const mesFmt = format(new Date(mes + '-02'), 'MMMM yyyy', { locale: pt })
    const fmtE = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)

    const secs = [
      avenca > 0 ? { titulo: 'Avenças', total: avenca, items: [] } : null,
      apoioValor > 0 ? { titulo: 'Apoio Técnico', total: apoioValor, items: [] } : null,
      totalDJs > 0 ? {
        titulo: 'Atuações DJ', total: totalDJs,
        items: djCats.filter(c => dji[c.key] && c.billing > 0)
          .map(c => ({ label: c.label, qtd: c.n, valor: c.billing })),
      } : null,
      totalMusicos > 0 ? {
        titulo: 'Atuações Músicos / Bandas', total: totalMusicos,
        items: cardState.musicos_bandas.filter(r => r.imprimir && itemTotal(r) > 0)
          .map(r => ({ label: r.descricao || 'Item', qtd: Number(r.unidades), valor: itemTotal(r) })),
      } : null,
      totalComprado > 0 ? {
        titulo: 'Equipamentos Comprado', total: totalComprado,
        items: cardState.equipamentos_comprado.filter(r => r.imprimir && itemTotal(r) > 0)
          .map(r => ({ label: r.descricao || 'Item', qtd: Number(r.unidades), valor: itemTotal(r) })),
      } : null,
      totalAlugado > 0 ? {
        titulo: 'Equipamentos Alugado', total: totalAlugado,
        items: cardState.equipamentos_alugado.filter(r => r.imprimir && itemTotal(r) > 0)
          .map(r => ({ label: r.descricao || 'Item', qtd: Number(r.unidades), valor: itemTotal(r) })),
      } : null,
      totalExtras > 0 ? {
        titulo: 'Extras', total: totalExtras,
        items: cardState.extras.filter(r => r.imprimir && itemTotal(r) > 0)
          .map(r => ({ label: r.descricao || 'Item', qtd: Number(r.unidades), valor: itemTotal(r) })),
      } : null,
    ].filter(Boolean)

    const secHtml = secs.map(s => `
      <div class="sec">
        <div class="sec-header">
          <span>${s.titulo}</span>
          <span>${fmtE(s.total)}</span>
        </div>
        ${s.items.length > 0 ? `<table class="items"><tbody>
          ${s.items.map(it => `<tr><td>${it.label}</td><td class="r">${it.qtd}x</td><td class="r">${fmtE(it.valor)}</td></tr>`).join('')}
        </tbody></table>` : ''}
      </div>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${espaco.nome} — ${mesFmt}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 32px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { font-size: 12px; color: #555; margin-bottom: 24px; }
        .sec { margin-bottom: 12px; }
        .sec-header { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; background: #f0f0f0; padding: 6px 10px; border-radius: 4px; }
        table.items { width: 100%; border-collapse: collapse; margin-top: 2px; }
        table.items td { padding: 3px 10px; border-bottom: 1px solid #e8e8e8; font-size: 12px; }
        .r { text-align: right; }
        .total { display: flex; justify-content: space-between; font-weight: 900; font-size: 15px; border-top: 2px solid #111; padding-top: 10px; margin-top: 8px; }
        @media print { body { margin: 16px; } }
      </style>
    </head><body>
      <h1>${espaco.nome}</h1>
      <div class="sub">${mesFmt.charAt(0).toUpperCase() + mesFmt.slice(1)}</div>
      ${secHtml}
      <div class="total"><span>Total</span><span>${fmtE(totalGeral)}</span></div>
    </body></html>`

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="bg-surface-1 border border-border/50 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">

      {/* ══ Cabeçalho ══ */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-surface-2 border-b border-border">
        <div>
          <p className="text-[10px] font-bold text-accent-subtle/50 uppercase tracking-widest mb-0.5">Total Contas</p>
          <p className="text-sm font-bold text-accent">{espaco.nome.toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors text-xs">
            <Printer size={12} />Imprimir
          </button>
          <button onClick={() => onSave(espaco.id)} disabled={saving}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40',
              cardState.dirty
                ? 'bg-status-confirmado/90 hover:bg-status-confirmado text-black shadow-lg'
                : 'border border-border/50 text-accent-subtle hover:text-accent hover:border-border'
            )}>
            <Save size={12} />{saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ══ Tabela resumo ══ */}
      <TabelaResumo categorias={categorias} total={totalGeral} />

      {/* ══ Equipamentos Comprado ══ */}
      <div className="px-2 py-4 border-t border-border bg-surface-0/15">
        <SecManualItems titulo="Equipamentos Comprado"
          linhas={cardState.equipamentos_comprado} total={totalComprado}
          onChange={val => upd('equipamentos_comprado', val)} eventos={eventos}
          onSave={() => onSave(espaco.id)} saving={saving} />
      </div>

      {/* ══ Equipamentos Alugado ══ */}
      <div className="px-2 py-4 border-t border-border bg-surface-0/15">
        <SecManualItems titulo="Equipamentos Alugado"
          linhas={cardState.equipamentos_alugado} total={totalAlugado}
          onChange={val => upd('equipamentos_alugado', val)} eventos={eventos}
          onSave={() => onSave(espaco.id)} saving={saving} />
      </div>

      {/* ══ Extras ══ */}
      <div className="px-2 py-4 border-t border-border bg-surface-0/15">
        <SecManualItems titulo="Extras"
          linhas={cardState.extras} total={totalExtras}
          onChange={val => upd('extras', val)} eventos={eventos}
          onSave={() => onSave(espaco.id)} saving={saving} />
      </div>

    </div>
  )
}

// ── Dashboard resumo ──────────────────────────────────────────────────────────
function Dashboard({ espacos, slots, eventos, agendTec, cards, catTotals, subtiposConfig }) {
  const linhas = useMemo(() => espacos.map(esp => {
    const slotEsp  = slots.filter(s => s.espaco_id === esp.id)
    const evEsp    = eventos.filter(e => e.espaco_id === esp.id)
    const techEsp  = agendTec.filter(a => a.espaco_id === esp.id)
    const card     = cards[esp.id]
    const djs      = slotEsp.reduce((sum, s) => sum + slotRate(s, subtiposConfig, catTotals), 0)
    const apoioAuto = techEsp.reduce((a, t) => a + parseNum(t.valor), 0) + evEsp.reduce((a, e) => a + parseNum(e.valor_apoio_tecnico), 0)
    const apoio    = card?.apoioOverride !== null ? parseNum(card?.apoioOverride) : apoioAuto
    const comprado = (card?.equipamentos_comprado ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const alugado  = (card?.equipamentos_alugado  ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const musicos  = (card?.musicos_bandas         ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const extras   = (card?.extras                 ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const avenca   = parseNum(esp.valor_avenca)
    const total    = avenca + djs + musicos + apoio + comprado + alugado + extras
    return { id: esp.id, nome: esp.nome.trim(), djs, avenca, musicos, apoio, comprado, alugado, extras, total }
  }), [espacos, slots, eventos, agendTec, cards, catTotals, subtiposConfig])

  const totalGeral = linhas.reduce((a, l) => a + l.total, 0)

  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border border-border rounded-xl">
        <p className="text-xs font-bold text-accent-subtle uppercase tracking-widest">Total Geral do Mês</p>
        <p className="text-xl font-bold text-status-confirmado tabular-nums">{formatarEuro(totalGeral)}</p>
      </div>
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {['Cliente', 'DJ', 'Avença', 'Músicos', 'Apoio', 'Equip.', 'Extras', 'Total'].map(h => (
                <th key={h} className={clsx('py-2 text-[10px] font-bold text-accent-subtle uppercase tracking-widest', h === 'Cliente' ? 'pl-4 text-left' : 'pr-3 text-right')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.id} className={clsx('border-b border-border/20 last:border-0 hover:bg-surface-0/30', i % 2 !== 0 && 'bg-surface-0/20')}>
                <td className="py-2.5 pl-4 pr-2 text-sm font-medium text-accent">{l.nome}</td>
                {[l.djs, l.avenca, l.musicos, l.apoio, l.comprado + l.alugado, l.extras].map((v, j) => (
                  <td key={j} className="py-2.5 pr-3 text-right tabular-nums text-xs">
                    {v > 0 ? <span className="text-accent">{formatarEuro(v)}</span> : <span className="text-border/30">—</span>}
                  </td>
                ))}
                <td className="py-2.5 pr-3 text-right tabular-nums text-sm font-bold">
                  {l.total > 0 ? <span className="text-status-confirmado">{formatarEuro(l.total)}</span> : <span className="text-border/30">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function ContasClientes() {
  const { anoMes } = useMesStore()
  const { espacos, loading: loadingEspacos } = useEspacos()
  const { pushUndo } = useUndo()
  const [slots, setSlots]       = useState([])
  const [eventos, setEventos]   = useState([])
  const [agendTec, setAgendTec] = useState([])
  const [loading, setLoading]   = useState(true)
  const [cards, setCards]       = useState({})
  const [catTotals, setCatTotals]       = useState({})
  const [subtiposConfig, setSubtiposConfig] = useState([])
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
    const [sRes, eRes, tRes, cRes, cfgRes] = await Promise.all([
      supabase.from('agenda')
        .select('id, dj_id, espaco_id, turno_id, valor, estado, tipo_slot, dj_nome, hora_inicio, hora_fim, data, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim)
        .not('estado', 'in', '("cancelado","faltou","sem_efeito")'),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, tipo, data_evento, hora_inicio, hora_fim, valor, valor_artistico, valor_apoio_tecnico, status, notas_faturacao')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim)
        .neq('status', 'cancelado'),
      supabase.from('agendamentos_tecnicos')
        .select('id, espaco_id, valor, confirmado')
        .gte('data', dataInicio).lte('data', dataFim),
      supabase.from('contas_clientes')
        .select('*').eq('mes', mes),
      supabase.from('configuracoes').select('chave, valor'),
    ])
    if (!sRes.error) setSlots(sRes.data ?? [])
    if (!eRes.error) setEventos(eRes.data ?? [])
    if (!tRes.error) setAgendTec(tRes.data ?? [])
    if (!cfgRes.error) {
      const cfg = Object.fromEntries((cfgRes.data ?? []).map(r => [r.chave, r.valor]))
      const cats = safeParse(cfg.contas_categorias, [])
      const transps = safeParse(cfg.contas_transportes, [])
      const transpDefault = transps[0]?.valor ?? 0
      const totals = {}
      cats.forEach(cat => {
        const vc = cat.valorCliente ?? 0
        totals[cat.key] = { custo: cat.valor ?? 0, total: vc + (cat.semTransporte ? 0 : transpDefault) }
      })
      setCatTotals(totals)
      const rawSubs = safeParse(cfg.contas_subtipos, [])
      setSubtiposConfig(rawSubs.map(s => ({
        ...s,
        total: (s.custo ?? 0) + (s.margem ?? 0) + (s.semTransporte ? 0 : transpDefault),
      })))
    }
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
      // Snapshot das linhas manuais actuais antes de apagar (para undo)
      const { data: prevRows } = await supabase.from('contas_clientes')
        .select('*').eq('espaco_id', espacoId).eq('mes', mes).is('evento_id', null)

      // Apagar apenas itens manuais (sem ligação a evento específico)
      await supabase.from('contas_clientes').delete()
        .eq('espaco_id', espacoId).eq('mes', mes).is('evento_id', null)

      const inserts = []

      // Apoio técnico override
      if (card.apoioOverride !== null && card.apoioOverride !== '') {
        inserts.push({ espaco_id: espacoId, mes, tipo: 'apoio_tecnico',
          valor: parseNum(card.apoioOverride), unidades: 1, valor_unitario: parseNum(card.apoioOverride),
          imprimir: false, margem_tipo: 'eur' })
      }

      // Secções manuais
      const secoes = [
        { tipo: 'equipamento_comprado', linhas: card.equipamentos_comprado },
        { tipo: 'equipamento_alugado',  linhas: card.equipamentos_alugado },
        { tipo: 'musicos_bandas',       linhas: card.musicos_bandas },
        { tipo: 'extra',                linhas: card.extras },
      ]
      secoes.forEach(({ tipo, linhas }) => {
        linhas.forEach(r => {
          if (r.evento_id) return // itens ligados a eventos são geridos pelo FormEvento
          const val = itemTotal(r)
          if (val > 0 || r.descricao) inserts.push({
            espaco_id: espacoId, mes, tipo,
            descricao: r.descricao || null,
            unidades: Number(r.unidades) || 1,
            valor_unitario: parseNum(r.valor_unitario),
            margem: parseNum(r.margem) || 0,
            valor: val,
            notas: r.notas || null,
            margem_tipo: r.margem_tipo ?? 'eur',
            imprimir: r.imprimir ?? false,
          })
        })
      })

      // Imprimir DJ por categoria
      const dji = card.djImprimir ?? {}
      DJ_CAT_KEYS.forEach(cat => {
        if (dji[cat]) inserts.push({
          espaco_id: espacoId, mes, tipo: 'dj_imprimir',
          descricao: cat, valor: 0, unidades: 1, valor_unitario: 0,
          imprimir: false, margem_tipo: 'eur',
        })
      })

      // Notas auto-secções
      Object.entries(card.notasAuto).forEach(([key, txt]) => {
        if (txt?.trim()) inserts.push({
          espaco_id: espacoId, mes, tipo: 'nota_auto',
          descricao: key, notas: txt, valor: 0, unidades: 1,
          imprimir: false, margem_tipo: 'eur',
        })
      })

      if (inserts.length > 0) await supabase.from('contas_clientes').insert(inserts)
      setCards(p => ({ ...p, [espacoId]: { ...p[espacoId], dirty: false } }))

      // Registar undo — restaura as linhas anteriores na BD e reinicializa o card
      const nomeMes = mes
      pushUndo({
        label: `Contas revertidas (${espacos.find(e => e.id === espacoId)?.nome ?? espacoId})`,
        undo: async () => {
          await supabase.from('contas_clientes').delete()
            .eq('espaco_id', espacoId).eq('mes', nomeMes).is('evento_id', null)
          const toReinsert = (prevRows ?? []).map(({ id, created_at, updated_at, ...r }) => r)
          if (toReinsert.length > 0) await supabase.from('contas_clientes').insert(toReinsert)
          const { data } = await supabase.from('contas_clientes')
            .select('*').eq('espaco_id', espacoId).eq('mes', nomeMes)
          setCards(p => ({ ...p, [espacoId]: initCard(data ?? []) }))
        },
      })
    } catch (e) { console.error(e) }
    finally { setSaving(p => ({ ...p, [espacoId]: false })) }
  }, [cards, mes, pushUndo, espacos])

  const espacoDetalhe = useMemo(() => espacos.find(e => e.id === espacoAtivo) ?? null, [espacos, espacoAtivo])
  const eventosEspaco = useMemo(() => eventos.filter(e => e.espaco_id === espacoAtivo), [eventos, espacoAtivo])

  const espacosFiltrados = useMemo(() => {
    if (!pesquisa.trim()) return espacos
    const q = pesquisa.toLowerCase()
    return espacos.filter(e => e.nome.toLowerCase().includes(q))
  }, [espacos, pesquisa])

  if (loading || loadingEspacos) return <LoadingPage />

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Tabs */}
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
        {espacosFiltrados.map(e => (
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
        {espacoAtivo === null && (
          <Dashboard espacos={espacos} slots={slots} eventos={eventos} agendTec={agendTec} cards={cards} catTotals={catTotals} subtiposConfig={subtiposConfig} />
        )}
        {espacoAtivo !== null && espacoDetalhe && (
          <div className="px-[60px] pt-[60px] pb-3">
            <SpaceCard
              espaco={espacoDetalhe}
              slots={slots.filter(s => s.espaco_id === espacoAtivo)}
              eventos={eventosEspaco}
              agendTec={agendTec.filter(a => a.espaco_id === espacoAtivo)}
              cardState={cards[espacoAtivo] ?? initCard([])}
              onCardChange={handleCardChange}
              onSave={handleSave}
              saving={!!saving[espacoAtivo]}
              catTotals={catTotals}
              subtiposConfig={subtiposConfig}
            />
          </div>
        )}
      </div>
    </div>
  )
}
