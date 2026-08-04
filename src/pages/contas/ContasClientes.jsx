import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import {
  Save, Search, X, Plus, Trash2, ChevronRight, ChevronsDown,
  MessageSquare, Link2, Check, Calendar, ExternalLink, Printer, AlertTriangle,
  Eye, EyeOff, Mail,
} from 'lucide-react'
import { useMesStore } from '@/store'
import { useEspacos } from '@/hooks/useEspacos'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'
import { useUndo } from '@/contexts/UndoContext'
import { EmailAgendaModal } from '@/components/contas/EmailAgendaModal'

const parseNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n }
const uid = () => Math.random().toString(36).slice(2)
const emptyLinha = () => ({ _key: uid(), id: null, descricao: '', unidades: 1, valor_unitario: '', margem: '', margem_tipo: 'eur', notas: '', evento_id: null, imprimir: false, dirty: false })
const TIPO_EQUIP_MAP = { proprio: 'equipamento_alugado', alugado: 'equipamento_alugado', comprado: 'equipamento_comprado', extra: 'extra' }
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

  if (row.fromEquip) {
    return (
      <tr className="border-b border-border/25 bg-surface-0/10">
        <td className="py-1.5 pl-4 pr-1 text-[13px] text-accent/70">{row.descricao || '—'}</td>
        <td className="py-1.5 px-2 w-14 text-center text-[13px] text-accent/70 tabular-nums">{row.unidades}</td>
        <td className="py-1.5 px-1 w-20 text-right text-[13px] text-accent/70 tabular-nums">{formatarEuro(parseNum(row.valor_unitario))}</td>
        <td className="py-1.5 px-1 w-20 text-right text-[13px] text-accent/50 tabular-nums">
          {parseNum(row.margem) > 0 ? `+${formatarEuro(parseNum(row.margem))}` : '—'}
        </td>
        <td className="py-1.5 pr-1 w-20 text-right text-[13px] font-bold tabular-nums">
          {total > 0 ? <span className="text-accent">{formatarEuro(total)}</span> : <span className="text-border/15">—</span>}
        </td>
        <td className="py-1.5 pr-3 w-14 text-right">
          <Link2 size={10} className="inline text-accent-subtle/30" title="Do evento" />
        </td>
      </tr>
    )
  }

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

function fmtDiasSem(dias) {
  if (!dias.length) return ''
  if (dias.length === 1) return dias[0]
  return dias.slice(0, -1).join(', ') + ' e ' + dias[dias.length - 1]
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
  if (slot.valor != null) {
    return (Number(slot.valor)      || 0)
         + (Number(slot.margem)     || 0)
         + (Number(slot.transporte) || 0)
         + (Number(slot.extras)     || 0)
  }
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

const eventoRate = (ev) =>
  (Number(ev.valor_apoio_tecnico) || 0)
  + (Number(ev.margem)            || 0)
  + (Number(ev.transporte)        || 0)
  + (Number(ev.extras_contas)     || 0)

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
                      <tr className="border-b border-white/4 bg-surface-0/35">
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
                      <tr className="border-b border-white/4 bg-surface-0/35">
                        <td colSpan={3} className="px-5 py-3">
                          <ExpandAddPanel nome={g.nome} onAddItem={onAddItem} />
                        </td>
                      </tr>
                    )}

                    {/* Sub-rows para grupos múltiplos — apenas informação, sem add */}
                    {g.n > 1 && gruposAbertos[g.nome] && g.items.map(ev => (
                      <tr key={ev.id} className="border-b border-white/4 bg-surface-0/30">
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
              <tr className="border-b border-white/4 bg-surface-0/35">
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
                className="border-b border-white/6 bg-surface-1/40 cursor-pointer hover:bg-surface-1/60 transition-colors">
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

function SecManualItems({ titulo, linhas, total, onChange, eventos, onSave, saving, noHeader }) {
  const addLinha = () => onChange([...linhas, emptyLinha()])
  const updLinha = (key, row) => onChange(linhas.map(r => r._key === key ? { ...row, dirty: true } : r))
  const remLinha = (key) => onChange(linhas.filter(r => r._key !== key))
  return (
    <div className="flex flex-col border border-white/8 rounded-lg overflow-hidden">
      {!noHeader && <DocSectionTitle titulo={titulo} onSave={onSave} saving={saving} />}
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
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-white/6 bg-surface-0/20">
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
                <tr key={i} className={clsx('bg-surface-0/25', i < arr.length - 1 ? 'border-b border-white/4' : '')}>
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
    fromEquip: s._fromEquip ?? false,
    dirty: false,
  })
  const pad = (arr, tipo, n = 3) => {
    const rows = arr.filter(s => s.tipo === tipo).map(toRow)
    while (rows.length < n) rows.push(emptyLinha())
    return rows
  }
  const notasRows = servicos.filter(s => s.tipo === 'nota_auto')
  const notasMap = {}
  notasRows.forEach(r => { notasMap[r.descricao] = r.notas ?? '' })
  const psRow = servicos.find(s => s.tipo === 'print_state')
  const printState = psRow ? safeParse(psRow.notas, {}) : {}

  return {
    equipamentos_comprado: pad(servicos, 'equipamento_comprado', 0),
    equipamentos_alugado:  pad(servicos, 'equipamento_alugado', 0),
    musicos_bandas:        pad(servicos, 'musicos_bandas', 0),
    extras:                pad(servicos, 'extra'),
    printState,
    notasAuto: notasMap,
    dirty: false,
  }
}

// ── Card por Cliente ──────────────────────────────────────────────────────────
const TIPO_LABELS = {
  residente_anl: 'DJ Residente ANL',
  residente:     'DJ Residentes',
  residente_st:  'DJ Residentes ST',
  convidado_int: 'DJ Convidados INT',
  convidado_ext: 'DJ Convidados EXT',
  premium:       'Premium',
}
const DIAS_ABR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const PRINT_MAP = {
  'prev':        { comAgenda: false, titulo: 'AGENDA PROPOSTA', docTipo: 'PREVISÃO'    },
  'prev-agenda': { comAgenda: true,  titulo: 'AGENDA PROPOSTA', docTipo: 'PREVISÃO'    },
  'conf':        { comAgenda: false, titulo: 'AGENDA FINAL',    docTipo: 'CONFIRMAÇÃO' },
  'conf-agenda': { comAgenda: true,  titulo: 'AGENDA FINAL',    docTipo: 'CONFIRMAÇÃO' },
}

function PrintToggle({ k, isPrinted, togglePrint }) {
  const on = isPrinted(k)
  return (
    <button onClick={e => { e.stopPropagation(); togglePrint(k) }}
      title={on ? 'Excluir da impressão' : 'Incluir na impressão'}
      className="relative shrink-0 p-1 rounded hover:bg-white/5 transition-colors">
      <Printer size={11} className={on ? 'text-white/40' : 'text-white/15'} />
      {!on && <X size={7} className="absolute bottom-0.5 right-0.5 text-red-400/80" />}
    </button>
  )
}

function SpaceCard({ espaco, slots, slotsExcluidos = [], eventos, cardState, onCardChange, onSave, saving, catTotals, subtiposConfig, turnos, mes, layoutView, onEmail }) {
  // DJ hierarchy: tipo_slot → turno → DJ
  const djHier = useMemo(() => {
    return CAT_DEFS.map(cat => {
      const turnosMap = {}
      let catBilling = 0
      let catN = 0
      slots.forEach(slot => {
        const tipoKey = mapTipoSlot(slot.tipo_slot)
        if (tipoKey !== cat.key) return
        // 1. match by turno_id (com coercão de tipo); 2. fallback: match por hora_inicio+hora_fim
        const turnoRef = slot.turno_id
          ? turnos.find(t => String(t.id) === String(slot.turno_id))
          : turnos.find(t => t.hora_inicio?.slice(0,5) === slot.hora_inicio?.slice(0,5) && t.hora_fim?.slice(0,5) === slot.hora_fim?.slice(0,5))
        const turnoLabel = turnoRef?.nome
          ?? ([slot.hora_inicio?.slice(0,5), slot.hora_fim?.slice(0,5)].filter(Boolean).join('–') || 'Sem horário')
        const horaInicio = turnoRef?.hora_inicio?.slice(0,5) ?? slot.hora_inicio?.slice(0,5) ?? null
        const horaFim    = turnoRef?.hora_fim?.slice(0,5)    ?? slot.hora_fim?.slice(0,5)    ?? null
        const djNome = slot.dj_nome || slot.djs?.nome_artistico || slot.djs?.nome || 'DJ'
        const rate = slotRate(slot, subtiposConfig, catTotals)
        catBilling += rate
        catN++
        const dayNum = slot.data ? String(new Date(slot.data + 'T12:00:00').getDate()).padStart(2, '0') : null
        if (!turnosMap[turnoLabel]) turnosMap[turnoLabel] = { label: turnoLabel, billing: 0, djs: {}, daysSet: new Set(), diasSemana: turnoRef?.dias_semana ?? null, horaInicio, horaFim }
        turnosMap[turnoLabel].billing += rate
        if (dayNum) turnosMap[turnoLabel].daysSet.add(dayNum)
        if (!turnosMap[turnoLabel].djs[djNome]) turnosMap[turnoLabel].djs[djNome] = { nome: djNome, slots: [], billing: 0 }
        turnosMap[turnoLabel].djs[djNome].slots.push(slot)
        turnosMap[turnoLabel].djs[djNome].billing += rate
      })
      const turnosList = Object.values(turnosMap).map(t => {
        const days = [...t.daysSet].sort((a, b) => Number(a) - Number(b))
        const diasSem = Array.isArray(t.diasSemana) && t.diasSemana.length > 0
          ? [...t.diasSemana].sort((a, b) => a - b).map(d => DIAS_ABR[d])
          : []
        return { label: t.label, billing: t.billing, djs: Object.values(t.djs), days, diasSem, horaInicio: t.horaInicio, horaFim: t.horaFim }
      })
      return { key: cat.key, label: TIPO_LABELS[cat.key] ?? cat.label, n: catN, billing: catBilling, turnos: turnosList }
    }).filter(g => g.n > 0)
  }, [slots, turnos, subtiposConfig, catTotals])

  const deducoesHier = useMemo(() => {
    const tipoMap = {}
    slotsExcluidos.forEach(slot => {
      const tipoKey = mapTipoSlot(slot.tipo_slot)
      if (!tipoKey) return
      const rate = slotRate(slot, subtiposConfig, catTotals)
      if (!rate) return
      const dayNum = slot.data ? String(new Date(slot.data + 'T12:00:00').getDate()).padStart(2, '0') : null
      if (!tipoMap[tipoKey]) tipoMap[tipoKey] = { billing: 0, days: new Set() }
      tipoMap[tipoKey].billing += rate
      if (dayNum) tipoMap[tipoKey].days.add(dayNum)
    })
    return Object.fromEntries(
      Object.entries(tipoMap).map(([k, v]) => [k, { billing: v.billing, days: [...v.days].sort((a, b) => Number(a) - Number(b)) }])
    )
  }, [slotsExcluidos, subtiposConfig, catTotals])

  // Build APOIO hierarchy: tipo → nome (merged)
  const apoioHier = useMemo(() => {
    const map = {}
    eventos.forEach(ev => {
      const tipo = ev.tipo ?? 'Sem tipo'
      const nome = (ev.evento ?? 'Sem nome').trim()
      const rate = eventoRate(ev)
      if (!map[tipo]) map[tipo] = { tipo, billing: 0, grupos: {} }
      map[tipo].billing += rate
      if (!map[tipo].grupos[nome]) map[tipo].grupos[nome] = { nome, items: [], billing: 0 }
      map[tipo].grupos[nome].items.push(ev)
      map[tipo].grupos[nome].billing += rate
    })
    return Object.values(map).map(t => {
      const grupos = Object.values(t.grupos).map(g => {
        const days = [...new Set(g.items.map(e => e.data_evento ? String(new Date(e.data_evento+'T12:00:00').getDate()).padStart(2,'0') : null).filter(Boolean))].sort((a,b)=>Number(a)-Number(b))
        return { ...g, n: g.items.length, days }
      })
      const tipodays = [...new Set(grupos.flatMap(g => g.days))].sort((a,b)=>Number(a)-Number(b))
      return { ...t, grupos, n: grupos.reduce((a,g)=>a+g.n,0), days: tipodays }
    })
  }, [eventos])

  const totalDJs      = djHier.reduce((a, g) => a + g.billing, 0)
  const totalDJsN     = djHier.reduce((a, g) => a + g.n, 0)
  const totalApoio    = apoioHier.reduce((a, t) => a + t.billing, 0)
  const totalMusicos  = cardState.musicos_bandas.reduce((a, r) => a + itemTotal(r), 0)
  const totalComprado = cardState.equipamentos_comprado.reduce((a, r) => a + itemTotal(r), 0)
  const totalAlugado  = cardState.equipamentos_alugado.reduce((a, r) => a + itemTotal(r), 0)
  const totalExtras   = cardState.extras.reduce((a, r) => a + itemTotal(r), 0)
  const avenca        = parseNum(espaco.valor_avenca)
  const totalGeral    = avenca + totalDJs + totalMusicos + totalApoio + totalComprado + totalAlugado + totalExtras

  const upd = (campo, val) => onCardChange(espaco.id, { ...cardState, [campo]: val, dirty: true })

  // Print state — opt-out: default=imprime, false=exclui
  const ps = cardState.printState ?? {}
  const isPrinted = (key) => {
    const parts = key.split(':')
    for (let i = 1; i <= parts.length; i++) {
      if (ps[parts.slice(0, i).join(':')] === false) return false
    }
    return true
  }
  const togglePrint = (key) => {
    const newPs = { ...ps }
    if (newPs[key] === false) delete newPs[key]
    else newPs[key] = false
    onCardChange(espaco.id, { ...cardState, printState: newPs, dirty: true })
  }
  const toggle = (k) => <PrintToggle k={k} isPrinted={isPrinted} togglePrint={togglePrint} />

  // Accordion states
  const [artistasAberto, setArtistasAberto] = useState(false)
  const [apoioAberto, setApoioAberto]       = useState(false)
  const [avencaAberto, setAvencaAberto]     = useState(false)
  const [extrasAberto, setExtrasAberto]     = useState(false)
  const [alugadosAberto, setAlugadosAberto] = useState(false)
  const [compradosAberto, setCompradosAberto] = useState(false)
const [gruposAbertos, setGruposAbertos]   = useState({})
  const [turnosAbertos, setTurnosAbertos]   = useState({})
  const [apoioTiposAbertos, setApoioTiposAbertos]   = useState({})
  const [apoioGruposAbertos, setApoioGruposAbertos] = useState({})
  const togGrupo      = k => setGruposAbertos(p => ({ ...p, [k]: !p[k] }))
  const togTurno      = k => setTurnosAbertos(p => ({ ...p, [k]: !p[k] }))
  const togApoioTipo  = k => setApoioTiposAbertos(p => ({ ...p, [k]: !p[k] }))
  const togApoioGrupo = k => setApoioGruposAbertos(p => ({ ...p, [k]: !p[k] }))

  const fmtE = v => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)

  const handlePrint = () => {
    const { comAgenda, titulo: tituloDoc, docTipo } = PRINT_MAP[layoutView] ?? PRINT_MAP['prev']
    const mesFmt = format(new Date(mes + '-02'), 'MMMM yyyy', { locale: pt })
    const mesFmtCap = mesFmt.charAt(0).toUpperCase() + mesFmt.slice(1)

    // Cabeçalho partilhado (logo + PREVISÃO/CONFIRMAÇÃO em destaque)
    const initials = espaco.nome.split(' ').slice(0,2).map(w=>w[0]??'').join('').toUpperCase()
    const logoHtml = espaco.logo_url
      ? `<img src="${espaco.logo_url}" style="width:72px;height:72px;object-fit:contain;display:block;border:1px solid #eee;border-radius:4px" />`
      : `<div style="background:#000;color:#fff;width:72px;height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px;box-sizing:border-box;border-radius:4px"><div style="font-size:14px;font-weight:900;letter-spacing:.04em">${initials}</div><div style="font-size:7px;letter-spacing:.1em;margin-top:4px;opacity:.6;text-transform:uppercase">${espaco.nome.split(' ').slice(1).join(' ')||espaco.nome}</div></div>`
    const tipoCor = docTipo === 'CONFIRMAÇÃO' ? '#2563eb' : '#6b7280'
    const pageHeader = (label) => `
      <div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:16px">
        <div style="flex-shrink:0">${logoHtml}</div>
        <div style="flex:1;padding-top:2px">
          <div style="font-size:22px;font-weight:900;letter-spacing:.01em;line-height:1;margin-bottom:6px">${espaco.nome.toUpperCase()}</div>
          <div style="font-size:16px;font-weight:900;letter-spacing:.14em;color:${tipoCor};text-transform:uppercase">${docTipo}</div>
          <div style="font-size:10px;color:#888;margin-top:5px;text-transform:uppercase;letter-spacing:.06em">${mesFmtCap} · ${label}</div>
        </div>
      </div>
      <hr style="border:none;border-top:1.5px solid #111;margin:0 0 18px">
    `

    // ARTISTAS: tipo DJ → turno → DJ
    const printedTipos = djHier.filter(g => isPrinted(`artistas:${g.key}`))
    const djTotalPrint = printedTipos.reduce((a, g) => a + g.billing, 0)
    const musicosPrint = totalMusicos > 0 && isPrinted('artistas:musicos')
    const artistasTotal = djTotalPrint + (musicosPrint ? totalMusicos : 0)
    const tipoRows = printedTipos.map(tipo => {
      const printedTurnos = tipo.turnos.filter(t => isPrinted(`artistas:${tipo.key}:${t.label}`))
      const turnoBilling = printedTurnos.reduce((a, t) => a + t.billing, 0)
      const turnoHtml = printedTurnos.map(t => {
        const turnoTitle = t.diasSem?.length > 0 ? `${t.label} (${fmtDiasSem(t.diasSem)})` : t.label
        const horaDatas = [t.horaInicio && t.horaFim ? `${t.horaInicio}–${t.horaFim}` : null, t.days.length > 0 ? `dias ${t.days.join(', ')}` : null].filter(Boolean).join(' · ')
        const djRows = tipo.key === 'convidado_ext'
          ? t.djs.map(dj => `<tr><td style="padding-left:20px;font-size:11px;color:#666">${dj.nome}</td><td class="r" style="font-size:11px;color:#666">${fmtE(dj.billing)}</td></tr>`).join('')
          : ''
        return `<tr><td style="padding-left:10px"><div style="font-size:11px;color:#555;font-weight:600">${turnoTitle}</div>${horaDatas ? `<div style="font-size:10px;color:#aaa;margin-top:1px">${horaDatas}</div>` : ''}</td><td class="r" style="font-size:11px;color:#666;vertical-align:top;padding-top:3px">${fmtE(t.billing)}</td></tr>${djRows}`
      }).join('')
      return `<div class="sub-sec"><div class="sub-hdr"><span>${tipo.label}${tipo.n > 0 ? ` <span style="font-weight:normal">${tipo.n}</span>` : ''}</span><span>${fmtE(turnoBilling)}</span></div>${turnoHtml ? `<table class="items"><tbody>${turnoHtml}</tbody></table>` : ''}</div>`
    }).join('')
    const artistasSec = artistasTotal > 0 ? `<div class="sec"><div class="sec-hdr"><span>Artistas</span><span>${fmtE(artistasTotal)}</span></div>${tipoRows}${musicosPrint ? `<div class="item-row"><span style="padding-left:12px">Músicos / Bandas</span><span>${fmtE(totalMusicos)}</span></div>` : ''}</div>` : ''

    // APOIO TÉCNICO: tipos sempre visíveis; grupos dentro seguem toggle
    const apoioSecs = apoioHier.map(at => {
      const printedGs = at.grupos.filter(g => isPrinted(`apoio:${at.tipo}:${g.nome}`))
      const atBilling = printedGs.reduce((a, g) => a + g.billing, 0)
      const diasAt = at.days.length > 0 ? ` <span style="font-weight:normal;font-size:11px;color:#999">(dias ${at.days.join(', ')})</span>` : ''
      const rows = printedGs.map(g => {
        const diasG = g.days.join(', ')
        return `<tr><td>${g.nome}${g.n > 0 ? ` <span style="color:#999;font-size:11px">${g.n}×</span>` : ''}${diasG ? ` <span style="color:#999;font-size:11px">(Dias ${diasG})</span>` : ''}</td><td class="r">${fmtE(g.billing)}</td></tr>`
      }).join('')
      return `<div class="sec"><div class="sec-hdr"><span>Apoio Técnico · ${at.tipo}${at.n > 0 ? ` <span style="font-weight:normal">${at.n}</span>` : ''}${diasAt}</span><span>${fmtE(atBilling)}</span></div>${rows ? `<table class="items"><tbody>${rows}</tbody></table>` : ''}</div>`
    }).join('')

    const avencaSec = avenca > 0 ? `<div class="sec"><div class="sec-hdr"><span>Avença</span><span>${fmtE(avenca)}</span></div></div>` : ''
    const extrasSec = totalExtras  > 0 ? `<div class="sec"><div class="sec-hdr"><span>Extras</span><span>${fmtE(totalExtras)}</span></div></div>` : ''
    const equipSec  = (totalComprado + totalAlugado) > 0 ? `<div class="sec"><div class="sec-hdr"><span>Equipamentos</span><span>${fmtE(totalComprado+totalAlugado)}</span></div>${totalAlugado>0?`<div class="item-row"><span style="padding-left:12px">Alugado</span><span>${fmtE(totalAlugado)}</span></div>`:''}${totalComprado>0?`<div class="item-row"><span style="padding-left:12px">Comprado</span><span>${fmtE(totalComprado)}</span></div>`:''}</div>` : ''

    // Agenda (formato por data com semanas)
    let agendaHtml = ''
    if (comAgenda) {
      const ss = [...slots].filter(s => s.tipo_slot).sort((a, b) => (a.data??'').localeCompare(b.data??'') || (a.hora_inicio??'').localeCompare(b.hora_inicio??''))
      const byDate = {}
      ss.forEach(s => { if (s.data) { if (!byDate[s.data]) byDate[s.data] = []; byDate[s.data].push(s) } })
      const dates = Object.keys(byDate).sort()
      if (dates.length > 0) {
        const semOrd = ['1ª','2ª','3ª','4ª','5ª']
        let lastWeek = null
        const rows = dates.map(date => {
          const d = new Date(date+'T12:00:00')
          const dn = d.getDate()
          const wk = Math.ceil(dn / 7)
          let wRow = ''
          if (wk !== lastWeek) { lastWeek = wk; wRow = `<tr class="week-sep"><td colspan="7">${semOrd[wk-1]??wk+'ª'} SEMANA</td></tr>` }
          const dayName = d.toLocaleDateString('pt-PT',{weekday:'long'})
          const dayNameCap = dayName.charAt(0).toUpperCase()+dayName.slice(1)
          const ds = byDate[date]
          const djN = s => s?.dj_nome || s?.djs?.nome_artistico || s?.djs?.nome || '—'
          const hora = s => s ? `${(s.hora_inicio??'?').slice(0,5)}–${(s.hora_fim??'?').slice(0,5)}` : ''
          const ev = eventos.find(e => e.data_evento === date)
          return wRow + `<tr><td>${dayNameCap}</td><td class="num">${String(dn).padStart(2,'0')}</td><td>${djN(ds[0])}</td><td class="hora">${hora(ds[0])}</td><td>${ds[1]?djN(ds[1]):''}</td><td class="hora">${ds[1]?hora(ds[1]):''}</td><td class="ev">${ev?.evento??''}</td></tr>`
        }).join('')
        agendaHtml = `
          <div style="page-break-before:always">
            ${pageHeader('Programa de Actuações')}
            <table class="agenda">
              <thead><tr><th>DIA</th><th>#</th><th>DJ</th><th>HORA</th><th>DJ</th><th>HORA</th><th>EVENTO</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="created">Created by PauloDiLight</div>
          </div>`
      }
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${espaco.nome}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:40px}
        .sec{margin-bottom:10px}
        .sec-hdr{display:flex;justify-content:space-between;font-weight:700;font-size:13px;background:#f0f0f0;padding:7px 10px;border-radius:4px}
        .sub-sec{margin:2px 0}.sub-hdr{display:flex;justify-content:space-between;font-size:12px;font-weight:600;padding:4px 10px;background:#f8f8f8;border-left:3px solid #ddd}
        table.items{width:100%;border-collapse:collapse}table.items td{padding:3px 10px;border-bottom:1px solid #eee;font-size:12px}
        .item-row{display:flex;justify-content:space-between;padding:3px 10px;font-size:12px;border-bottom:1px solid #eee}
        .total{display:flex;justify-content:space-between;font-weight:900;font-size:16px;border-top:2px solid #111;padding-top:10px;margin-top:8px}
        .r{text-align:right}
        table.agenda{width:100%;border-collapse:collapse;font-size:12px}
        table.agenda th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #ccc;font-weight:700}
        table.agenda td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:middle}
        .num{font-weight:700;color:#333;width:28px}.hora{color:#1d4ed8;font-size:11px;white-space:nowrap}.ev{color:#888;font-size:11px}
        .week-sep td{background:#f0f0f0;font-weight:700;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#555;padding:5px 8px;border-top:2px solid #ccc}
        .created{margin-top:24px;font-size:10px;color:#aaa;text-align:right}
        @media print{body{margin:20px}}
      </style>
    </head><body>
      <div style="${comAgenda ? 'page-break-after:always' : ''}">
        ${pageHeader(tituloDoc)}
        ${artistasSec}${apoioSecs}${avencaSec}${extrasSec}${equipSec}
        <div class="total"><span>Total</span><span>${fmtE(totalGeral)}</span></div>
        <div class="created">Created by PauloDiLight</div>
      </div>
      ${agendaHtml}
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('Permite popups neste site para imprimir.'); return }
    try {
      w.document.write(html)
      w.document.close()
      w.focus()
      setTimeout(() => w.print(), 300)
    } catch (e) {
      console.error('Print error:', e)
      alert('Erro ao imprimir: ' + e.message)
    }
  }

  return (
    <div className="bg-surface-1 border border-border/50 rounded-2xl overflow-hidden shadow-2xl shadow-black/40">

      {/* ══ Cabeçalho ══ */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-surface-2 border-b border-border">
        <div className="flex items-center gap-5">
          <p className="text-sm font-bold text-accent">{espaco.nome.toUpperCase()}</p>
          <span className="text-sm font-bold text-accent tabular-nums">{formatarEuro(totalGeral)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const allOpen = artistasAberto && apoioAberto && avencaAberto && extrasAberto && alugadosAberto && compradosAberto
              const next = !allOpen
              setArtistasAberto(next)
              setApoioAberto(next)
              setAvencaAberto(next)
              setExtrasAberto(next)
              setAlugadosAberto(next)
              setCompradosAberto(next)
              if (!next) setGruposAbertos({})
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors text-xs">
            <ChevronsDown size={12} className={clsx('transition-transform', artistasAberto && apoioAberto && 'rotate-180')} />
            {artistasAberto && apoioAberto && avencaAberto && extrasAberto && alugadosAberto && compradosAberto ? 'Recolher' : 'Expandir'}
          </button>
          <button onClick={onEmail}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors text-xs">
            <Mail size={12} /> Email
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors text-xs">
            <Printer size={12} /> Imprimir
          </button>
          <button onClick={() => onSave(espaco.id)} disabled={saving}
            className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40',
              cardState.dirty ? 'bg-status-confirmado/90 hover:bg-status-confirmado text-black shadow-lg' : 'border border-border/50 text-accent-subtle hover:text-accent hover:border-border'
            )}>
            <Save size={12} />{saving ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ══ ARTISTAS ══ */}
      <div className="border-t border-white/15">
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
          onClick={() => setArtistasAberto(p => !p)}>
          <ChevronRight size={12} className={clsx('text-white/20 transition-transform shrink-0', artistasAberto && 'rotate-90')} />
          <span className="text-sm font-semibold text-white/40 flex-1">ARTISTAS</span>
          <span className="text-sm font-semibold text-white/80 tabular-nums">{formatarEuro(totalDJs + totalMusicos)}</span>
        </div>
        {artistasAberto && (
          <div>
            {djHier.map(tipo => (
              <div key={tipo.key}>
                <div className="flex items-center gap-2 px-6 py-2.5 cursor-pointer hover:bg-white/2 transition-colors"
                  onClick={() => togGrupo(tipo.key)}>
                  <ChevronRight size={10} className={clsx('text-white/20 transition-transform shrink-0', gruposAbertos[tipo.key] && 'rotate-90')} />
                  <div className="flex-1 flex items-baseline gap-1.5 min-w-0">
                    <span className="text-xs font-medium text-white/75">{tipo.label}</span>
                    {tipo.n > 0 && <span className="text-[10px] text-white/35 tabular-nums">{tipo.n}</span>}
                  </div>
                  {toggle(`artistas:${tipo.key}`)}
                  <span className="text-xs text-white/65 tabular-nums">{formatarEuro(tipo.billing)}</span>
                </div>
                {gruposAbertos[tipo.key] && tipo.turnos.map(turno => {
                  const tKey = `${tipo.key}:${turno.label}`
                  return (
                    <div key={turno.label}>
                      <div className="flex items-center gap-2 px-9 py-2 cursor-pointer hover:bg-white/2 transition-colors"
                        onClick={() => togTurno(tKey)}>
                        <ChevronRight size={8} className={clsx('text-white/15 transition-transform shrink-0', turnosAbertos[tKey] && 'rotate-90')} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] text-white/40">
                              {turno.label}{turno.diasSem.length > 0 ? ` (${fmtDiasSem(turno.diasSem)})` : ''}
                            </span>
                          </div>
                          {(turno.horaInicio || turno.days.length > 0) && (
                            <div className="text-[10px] text-white/20 mt-0.5">
                              {[turno.horaInicio && turno.horaFim ? `${turno.horaInicio}–${turno.horaFim}` : null, turno.days.length > 0 ? `dias ${turno.days.join(', ')}` : null].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                        {toggle(`artistas:${tipo.key}:${turno.label}`)}
                        <span className="text-[11px] text-white/30 tabular-nums">{formatarEuro(turno.billing)}</span>
                      </div>
                      {turnosAbertos[tKey] && turno.djs.map(dj => (
                        <div key={dj.nome} className="flex items-center gap-2 px-12 py-1.5">
                          <span className="text-xs text-white/55 flex-1">{dj.nome}</span>
                          <span className="text-xs text-white/50 tabular-nums">{formatarEuro(dj.billing)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
                {deducoesHier[tipo.key]?.billing > 0 && (
                  <div className="flex items-center gap-2 px-6 py-1.5 border-t border-white/[0.06]">
                    <span className="text-[11px] italic flex-1 text-red-400/50">
                      ↓ Faltas/Cancelamentos · dias {deducoesHier[tipo.key].days.join(', ')}
                    </span>
                    <span className="text-[11px] tabular-nums text-red-400/50">
                      −{formatarEuro(deducoesHier[tipo.key].billing)}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {djHier.length === 0 && <p className="px-6 py-3 text-xs text-white/15 italic">Sem atuações DJ</p>}
            {totalMusicos > 0 && (
              <div className="flex items-center gap-2 px-6 py-2.5">
                <span className="text-xs font-medium text-white/75 flex-1">Músicos / Bandas</span>
                {toggle('artistas:musicos')}
                <span className="text-xs text-white/65 tabular-nums">{formatarEuro(totalMusicos)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ APOIO TÉCNICO ══ */}
      <div className="border-t border-white/15">
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
          onClick={() => setApoioAberto(p => !p)}>
          <ChevronRight size={12} className={clsx('text-white/20 transition-transform shrink-0', apoioAberto && 'rotate-90')} />
          <span className="text-sm font-semibold text-white/40 flex-1">APOIO TÉCNICO</span>
          <span className="text-sm font-semibold text-white/80 tabular-nums">{formatarEuro(totalApoio)}</span>
        </div>
        {apoioAberto && (
          <div className="pb-1">
            {apoioHier.length === 0 && <p className="px-6 py-3 text-xs text-white/15 italic">Sem eventos este mês</p>}
            {apoioHier.map(tipo => (
              <div key={tipo.tipo}>
                <div className="flex items-center gap-2 px-6 py-2 cursor-pointer hover:bg-white/2 transition-colors"
                  onClick={() => togApoioTipo(tipo.tipo)}>
                  <ChevronRight size={10} className={clsx('text-white/15 transition-transform shrink-0', apoioTiposAbertos[tipo.tipo] && 'rotate-90')} />
                  <div className="flex-1 flex items-baseline gap-1.5 min-w-0">
                    <span className="text-[11px] font-medium text-white/40 uppercase tracking-widest">{tipo.tipo}</span>
                    {tipo.n > 0 && <span className="text-[10px] text-white/25 tabular-nums">{tipo.n}</span>}
                    {tipo.days.length > 0 && <span className="text-[10px] text-white/20 truncate">(dias {tipo.days.join(', ')})</span>}
                  </div>
                  {toggle(`apoio:${tipo.tipo}`)}
                  <span className="text-[11px] text-white/45 tabular-nums">{formatarEuro(tipo.billing)}</span>
                </div>
                {apoioTiposAbertos[tipo.tipo] && tipo.grupos.map(g => {
                  const gKey = `${tipo.tipo}:${g.nome}`
                  return (
                    <div key={g.nome}>
                      <div className="flex items-center gap-2 px-9 py-2 cursor-pointer hover:bg-white/2 transition-colors"
                        onClick={() => togApoioGrupo(gKey)}>
                        <ChevronRight size={9} className={clsx('text-white/15 transition-transform shrink-0', apoioGruposAbertos[gKey] && 'rotate-90')} />
                        <div className="flex-1 flex items-baseline gap-1.5 min-w-0">
                          <span className="text-xs text-white/65">{g.nome}</span>
                          {g.n > 0 && <span className="text-[10px] text-white/35 tabular-nums">{g.n}</span>}
                          {g.days.length > 0 && <span className="text-[10px] text-white/25 truncate">(dias {g.days.join(', ')})</span>}
                        </div>
                        {toggle(`apoio:${tipo.tipo}:${g.nome}`)}
                        <span className="text-xs text-white/55 tabular-nums">{formatarEuro(g.billing)}</span>
                      </div>
                      {apoioGruposAbertos[gKey] && g.items.map(ev => {
                        const dt = ev.data_evento ? new Date(ev.data_evento+'T12:00:00').toLocaleDateString('pt-PT',{day:'2-digit',month:'short'}) : '—'
                        return (
                          <div key={ev.id} className="flex items-center gap-3 px-12 py-1.5">
                            <span className="text-[11px] text-white/25 flex-1">{dt}</span>
                            <span className="text-[11px] text-white/45 tabular-nums">{formatarEuro(eventoRate(ev))}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ AVENÇA ══ mesmo nível que EXTRAS / EQUIPAMENTOS */}
      {avenca > 0 && (
        <div className="border-t border-white/15">
          <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
            onClick={() => setAvencaAberto(p => !p)}>
            <ChevronRight size={12} className={clsx('text-white/20 transition-transform shrink-0', avencaAberto && 'rotate-90')} />
            <span className="text-sm font-semibold text-white/40 flex-1">AVENÇA</span>
            <span className="text-sm font-semibold text-white/80 tabular-nums">{formatarEuro(avenca)}</span>
          </div>
          {avencaAberto && (
            <div className="pb-3">
              <div className="flex items-center justify-between px-9 py-1.5">
                <span className="text-xs text-white/55">{espaco.nome}</span>
                <span className="text-xs text-white/50 tabular-nums">{formatarEuro(avenca)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ EQUIPAMENTOS ALUGADOS ══ */}
      <div className="border-t border-white/15">
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
          onClick={() => setAlugadosAberto(p => !p)}>
          <ChevronRight size={12} className={clsx('text-white/20 transition-transform shrink-0', alugadosAberto && 'rotate-90')} />
          <span className="text-sm font-semibold text-white/40 flex-1">EQUIPAMENTOS ALUGADOS</span>
          <span className="text-sm font-semibold text-white/80 tabular-nums">{formatarEuro(totalAlugado)}</span>
        </div>
        {alugadosAberto && (
          <div className="px-4 pb-3">
            <SecManualItems titulo="EQUIPAMENTOS ALUGADOS" noHeader
              linhas={cardState.equipamentos_alugado} total={totalAlugado}
              onChange={val => upd('equipamentos_alugado', val)} eventos={eventos} />
          </div>
        )}
      </div>

      {/* ══ EQUIPAMENTOS COMPRADOS ══ */}
      <div className="border-t border-white/15">
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
          onClick={() => setCompradosAberto(p => !p)}>
          <ChevronRight size={12} className={clsx('text-white/20 transition-transform shrink-0', compradosAberto && 'rotate-90')} />
          <span className="text-sm font-semibold text-white/40 flex-1">EQUIPAMENTOS COMPRADOS</span>
          <span className="text-sm font-semibold text-white/80 tabular-nums">{formatarEuro(totalComprado)}</span>
        </div>
        {compradosAberto && (
          <div className="px-4 pb-3">
            <SecManualItems titulo="EQUIPAMENTOS COMPRADOS" noHeader
              linhas={cardState.equipamentos_comprado} total={totalComprado}
              onChange={val => upd('equipamentos_comprado', val)} eventos={eventos} />
          </div>
        )}
      </div>

      {/* ══ EXTRAS ══ */}
      <div className="border-t border-white/15">
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
          onClick={() => setExtrasAberto(p => !p)}>
          <ChevronRight size={12} className={clsx('text-white/20 transition-transform shrink-0', extrasAberto && 'rotate-90')} />
          <span className="text-sm font-semibold text-white/40 flex-1">EXTRAS</span>
          <span className="text-sm font-semibold text-white/80 tabular-nums">{formatarEuro(totalExtras)}</span>
        </div>
        {extrasAberto && (
          <div className="px-4 pb-3">
            <SecManualItems titulo="EXTRAS" noHeader
              linhas={cardState.extras} total={totalExtras}
              onChange={val => upd('extras', val)} eventos={eventos} />
          </div>
        )}
      </div>

    </div>
  )
}

// ── Layout 2: Resumo + Agenda ─────────────────────────────────────────────────
const ESTADO_COR = {
  confirmado:      'text-status-confirmado',
  presente:        'text-status-confirmado',
  'pré-confirmado':'text-sky-400',
  aceite:          'text-teal-400',
  proposta:        'text-status-proposta',
  cancelado:       'text-red-400',
  faltou:          'text-red-400',
  trocado:         'text-[#fc03c6]',
  sem_efeito:      'text-accent-subtle/40',
}
function SpaceResumoAgenda({ espaco, slots, eventos, agendTec, cardState, catTotals, subtiposConfig, mes }) {
  const totalDJs   = slots.filter(s => s.tipo_slot).reduce((a, s) => a + slotRate(s, subtiposConfig, catTotals), 0)
  const apoioAuto  = eventos.reduce((a, e) => a + parseNum(e.valor_apoio_tecnico), 0)
  const apoio      = cardState?.apoioOverride !== null ? parseNum(cardState?.apoioOverride) : apoioAuto
  const comprado   = (cardState?.equipamentos_comprado ?? []).reduce((a, r) => a + itemTotal(r), 0)
  const alugado    = (cardState?.equipamentos_alugado  ?? []).reduce((a, r) => a + itemTotal(r), 0)
  const musicos    = (cardState?.musicos_bandas        ?? []).reduce((a, r) => a + itemTotal(r), 0)
  const extras     = (cardState?.extras                ?? []).reduce((a, r) => a + itemTotal(r), 0)
  const avenca     = parseNum(espaco.valor_avenca)
  const totalGeral = avenca + totalDJs + musicos + apoio + comprado + alugado + extras

  const slotsSorted = [...slots].sort((a, b) => a.data?.localeCompare(b.data) || a.hora_inicio?.localeCompare(b.hora_inicio))
  const slotsComDJ  = slotsSorted.filter(s => s.tipo_slot)

  const handlePrint = () => {
    const fmtE = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)
    const mesFmt = mes ? format(new Date(mes + '-02'), 'MMMM yyyy', { locale: pt }) : ''
    const resumoRows = [
      { l: 'DJs', v: totalDJs },
      { l: 'Apoio Técnico', v: apoio },
      { l: 'Músicos / Bandas', v: musicos },
      { l: 'Equipamentos', v: comprado + alugado },
      { l: 'Extras', v: extras },
      { l: 'Avença', v: avenca },
    ].filter(r => r.v > 0)
    const agendaRows = slotsComDJ.map(s => {
      const nome = s.dj_nome || s.djs?.nome_artistico || s.djs?.nome || '—'
      const v = Number(s.valor)||0, m = Number(s.margem)||0, tr = Number(s.transporte)||0, ex = Number(s.extras)||0
      const dt = s.data ? new Date(s.data+'T12:00:00').toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'}) : '—'
      return `<tr><td>${dt}</td><td>${nome}</td><td>${s.tipo_slot||'—'}</td><td class="r">${v>0?fmtE(v):'—'}</td><td class="r">${m>0?fmtE(m):'—'}</td><td class="r">${tr>0?fmtE(tr):'—'}</td><td class="r">${ex>0?fmtE(ex):'—'}</td><td class="r"><b>${(v+m+tr+ex)>0?fmtE(v+m+tr+ex):'—'}</b></td><td>${s.estado_pagamento||'—'}</td></tr>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${espaco.nome} — ${mesFmt}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:28px}
      h1{font-size:17px;margin:0 0 2px}
      .sub{font-size:11px;color:#555;margin-bottom:20px}
      .resumo{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
      .resumo-item{background:#f5f5f5;border-radius:6px;padding:8px 14px;min-width:120px}
      .resumo-item .lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em}
      .resumo-item .val{font-size:14px;font-weight:700;margin-top:2px}
      .total-row{display:flex;justify-content:space-between;font-weight:900;font-size:15px;border-top:2px solid #111;padding:10px 0 20px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f0f0f0;padding:5px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #ddd}
      td{padding:4px 8px;border-bottom:1px solid #eee}
      .r{text-align:right}
      tfoot td{font-weight:700;border-top:2px solid #111;background:#f9f9f9}
      @media print{body{margin:14px}}
    </style></head><body>
    <h1>${espaco.nome.toUpperCase()}</h1>
    <p class="sub">${mesFmt} · ${slotsComDJ.length} atuações</p>
    <div class="resumo">${resumoRows.map(r=>`<div class="resumo-item"><div class="lbl">${r.l}</div><div class="val">${fmtE(r.v)}</div></div>`).join('')}</div>
    <div class="total-row"><span>Total Geral</span><span>${fmtE(totalGeral)}</span></div>
    <table><thead><tr><th>Data</th><th>DJ</th><th>Tipo</th><th class="r">Valor</th><th class="r">Margem</th><th class="r">Transp.</th><th class="r">Extras</th><th class="r">Total Cliente</th><th>Estado Pag.</th></tr></thead>
    <tbody>${agendaRows}</tbody>
    <tfoot><tr><td colspan="3">Total</td>
      <td class="r">${fmtE(slotsComDJ.reduce((a,s)=>a+(Number(s.valor)||0),0))}</td>
      <td class="r">${fmtE(slotsComDJ.reduce((a,s)=>a+(Number(s.margem)||0),0))}</td>
      <td class="r">${fmtE(slotsComDJ.reduce((a,s)=>a+(Number(s.transporte)||0),0))}</td>
      <td class="r">${fmtE(slotsComDJ.reduce((a,s)=>a+(Number(s.extras)||0),0))}</td>
      <td class="r">${fmtE(totalDJs)}</td><td></td></tr></tfoot>
    </table></body></html>`
    const w = window.open('','_blank'); w.document.write(html); w.document.close(); w.focus(); w.print()
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Resumo totais */}
      <div className="bg-surface-1 border border-border/50 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
        <div className="px-5 py-3.5 bg-surface-2 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-accent-subtle/50 uppercase tracking-widest mb-0.5">Resumo Financeiro</p>
            <p className="text-sm font-bold text-accent">{espaco.nome.toUpperCase()}</p>
          </div>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/50 text-accent-subtle hover:text-accent hover:border-border transition-colors text-xs">
            <Printer size={12} /> Imprimir
          </button>
        </div>
        <div className="grid grid-cols-4 divide-x divide-border/30">
          {[
            { label: 'DJs', valor: totalDJs },
            { label: 'Apoio Técnico', valor: apoio },
            { label: 'Músicos / Bandas', valor: musicos },
            { label: 'Equipamentos', valor: comprado + alugado },
            { label: 'Extras', valor: extras },
            { label: 'Avença', valor: avenca },
          ].filter(r => r.valor > 0).map(r => (
            <div key={r.label} className="px-4 py-3 flex flex-col gap-0.5">
              <p className="text-[10px] text-accent-subtle uppercase tracking-widest">{r.label}</p>
              <p className="text-sm font-semibold text-accent tabular-nums">{formatarEuro(r.valor)}</p>
            </div>
          ))}
          <div className="px-4 py-3 flex flex-col gap-0.5 bg-surface-2/60 col-span-full flex-row items-center justify-between" style={{display:'flex',flexDirection:'row',alignItems:'center'}}>
            <p className="text-xs font-bold text-accent-subtle uppercase tracking-widest">Total Geral</p>
            <p className="text-lg font-bold text-status-confirmado tabular-nums">{formatarEuro(totalGeral)}</p>
          </div>
        </div>
      </div>

      {/* Tabela agenda */}
      <div className="bg-surface-1 border border-border/50 rounded-2xl overflow-hidden shadow-xl shadow-black/30">
        <div className="px-5 py-3 bg-surface-2 border-b border-border">
          <p className="text-[10px] font-bold text-accent-subtle/50 uppercase tracking-widest">Agenda · {slotsSorted.filter(s => s.tipo_slot).length} atuações</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-surface-2/40">
                {['Data', 'DJ', 'Tipo', 'Valor', 'Margem', 'Transp.', 'Extras', 'Total Cliente', 'Estado Pag.', 'Estado'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-accent-subtle/60 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotsSorted.filter(s => s.tipo_slot).map((s, i) => {
                const nome  = s.dj_nome || s.djs?.nome_artistico || s.djs?.nome || '—'
                const v     = Number(s.valor)     || 0
                const m     = Number(s.margem)    || 0
                const tr    = Number(s.transporte)|| 0
                const ex    = Number(s.extras)    || 0
                const total = v + m + tr + ex
                const dt    = s.data ? new Date(s.data + 'T12:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : '—'
                const cor   = ESTADO_COR[s.estado] ?? 'text-accent-subtle'
                return (
                  <tr key={s.id} className={clsx('border-b border-border/20 hover:bg-surface-2/30 transition-colors', i % 2 === 0 ? '' : 'bg-surface-0/10')}>
                    <td className="px-3 py-2 tabular-nums text-accent-subtle">{dt}</td>
                    <td className="px-3 py-2 text-accent font-medium">{nome}</td>
                    <td className="px-3 py-2 text-accent-subtle capitalize">{s.tipo_slot}</td>
                    <td className="px-3 py-2 tabular-nums text-accent">{v > 0 ? formatarEuro(v) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-status-confirmado">{m > 0 ? formatarEuro(m) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-accent-subtle">{tr > 0 ? formatarEuro(tr) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-accent-subtle">{ex > 0 ? formatarEuro(ex) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-accent">{total > 0 ? formatarEuro(total) : '—'}</td>
                    <td className="px-3 py-2 capitalize text-accent-subtle">{s.estado_pagamento ?? '—'}</td>
                    <td className={clsx('px-3 py-2 capitalize font-medium', cor)}>{s.estado ?? '—'}</td>
                  </tr>
                )
              })}
              {slotsSorted.filter(s => s.tipo_slot).length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-accent-subtle/40 italic">Sem atuações</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/40 bg-surface-2/40">
                <td colSpan={3} className="px-3 py-2 text-[10px] font-bold text-accent-subtle/60 uppercase tracking-wider">Total</td>
                <td className="px-3 py-2 tabular-nums font-semibold text-accent">{formatarEuro(slotsSorted.filter(s=>s.tipo_slot).reduce((a,s)=>a+(Number(s.valor)||0),0))}</td>
                <td className="px-3 py-2 tabular-nums font-semibold text-status-confirmado">{formatarEuro(slotsSorted.filter(s=>s.tipo_slot).reduce((a,s)=>a+(Number(s.margem)||0),0))}</td>
                <td className="px-3 py-2 tabular-nums font-semibold text-accent-subtle">{formatarEuro(slotsSorted.filter(s=>s.tipo_slot).reduce((a,s)=>a+(Number(s.transporte)||0),0))}</td>
                <td className="px-3 py-2 tabular-nums font-semibold text-accent-subtle">{formatarEuro(slotsSorted.filter(s=>s.tipo_slot).reduce((a,s)=>a+(Number(s.extras)||0),0))}</td>
                <td className="px-3 py-2 tabular-nums font-bold text-accent">{formatarEuro(totalDJs)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard resumo ──────────────────────────────────────────────────────────
function Dashboard({ espacos, slots, eventos, cards, catTotals, subtiposConfig }) {
  const linhas = useMemo(() => espacos.map(esp => {
    const slotEsp  = slots.filter(s => s.espaco_id === esp.id)
    const evEsp    = eventos.filter(e => e.espaco_id === esp.id)
    const card     = cards[esp.id]
    const djs      = slotEsp.reduce((sum, s) => sum + slotRate(s, subtiposConfig, catTotals), 0)
    const apoio    = evEsp.reduce((a, e) => a + eventoRate(e), 0)
    const comprado = (card?.equipamentos_comprado ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const alugado  = (card?.equipamentos_alugado  ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const musicos  = (card?.musicos_bandas         ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const extras   = (card?.extras                 ?? []).reduce((a, r) => a + parseNum(r.unidades) * parseNum(r.valor_unitario), 0)
    const avenca   = parseNum(esp.valor_avenca)
    const total    = avenca + djs + musicos + apoio + comprado + alugado + extras
    return { id: esp.id, nome: esp.nome.trim(), djs, avenca, musicos, apoio, comprado, alugado, extras, total }
  }), [espacos, slots, eventos, cards, catTotals, subtiposConfig])

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
  const [slots, setSlots]             = useState([])
  const [slotsExcluidos, setSlotsExcluidos] = useState([])
  const [eventos, setEventos]         = useState([])
  const [agendTec, setAgendTec]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [cards, setCards]       = useState({})
  const [catTotals, setCatTotals]       = useState({})
  const [subtiposConfig, setSubtiposConfig] = useState([])
  const [turnos, setTurnos]     = useState([])
  const [saving, setSaving]     = useState({})
  const [espacoAtivo, setEspacoAtivo] = useState(null)
  const [pesquisa, setPesquisa]       = useState('')
  const [layoutView, setLayoutView]   = useState(() => localStorage.getItem('contasClientes_layout') ?? 'prev')
  const [mostrarPrevisao, setMostrarPrevisao]   = useState({})
  const [verOcorrencias,  setVerOcorrencias]    = useState({})
  const [emailModal, setEmailModal] = useState(false)

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
    const [sRes, eRes, tRes, cRes, cfgRes, turnosRes, fRes] = await Promise.all([
      supabase.from('agenda')
        .select('id, dj_id, espaco_id, turno_id, valor, margem, transporte, extras, estado, estado_pagamento, tipo_slot, dj_nome, hora_inicio, hora_fim, data, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim)
        .not('estado', 'in', '("cancelado","faltou","sem_efeito")'),
      supabase.from('supa_eventos')
        .select('id, espaco_id, evento, tipo, data_evento, hora_inicio, hora_fim, valor, valor_artistico, valor_apoio_tecnico, margem, transporte, extras_contas, status, notas_faturacao')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim)
        .neq('status', 'cancelado'),
      supabase.from('agendamentos_tecnicos')
        .select('id, espaco_id, valor, confirmado')
        .gte('data', dataInicio).lte('data', dataFim),
      supabase.from('contas_clientes')
        .select('*').eq('mes', mes),
      supabase.from('configuracoes').select('chave, valor'),
      supabase.from('turnos_espaco').select('id, espaco_id, nome, ordem, hora_inicio, hora_fim, dias_semana').order('ordem'),
      supabase.from('agenda')
        .select('id, dj_id, espaco_id, turno_id, valor, margem, transporte, extras, estado, tipo_slot, dj_nome, hora_inicio, hora_fim, data, djs(nome, nome_artistico)')
        .gte('data', dataInicio).lte('data', dataFim)
        .in('estado', ['faltou', 'cancelado']),
    ])
    if (!sRes.error)      setSlots(sRes.data ?? [])
    if (!eRes.error)      setEventos(eRes.data ?? [])
    if (!tRes.error)      setAgendTec(tRes.data ?? [])
    if (!turnosRes.error) setTurnos(turnosRes.data ?? [])
    if (!fRes.error)      setSlotsExcluidos(fRes.data ?? [])
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
    // Fetch evento_equipamentos para os eventos deste mês (com valor)
    const eventoIds = (eRes.data ?? []).map(e => e.id)
    const eeRes = eventoIds.length > 0
      ? await supabase.from('evento_equipamentos')
          .select('id, evento_id, descricao_manual, tipo, quantidade, valor_custo, margem, observacoes')
          .in('evento_id', eventoIds)
          .gt('valor_custo', 0)
      : { data: [], error: null }

    if (!cRes.error) {
      const data = cRes.data ?? []
      const equipBilling = (eeRes.data ?? []).map(r => {
        const ev = (eRes.data ?? []).find(e => e.id === r.evento_id)
        return {
          id: `ee_${r.id}`,
          tipo: TIPO_EQUIP_MAP[r.tipo] ?? 'equipamento_alugado',
          descricao: r.descricao_manual || '',
          unidades: r.quantidade ?? 1,
          valor_unitario: Number(r.valor_custo) ?? 0,
          margem: r.margem != null ? Number(r.margem) : 0,
          margem_tipo: 'eur',
          notas: r.observacoes ?? null,
          evento_id: r.evento_id,
          imprimir: false,
          espaco_id: ev?.espaco_id ?? null,
          mes,
          _fromEquip: true,
        }
      })
      const allServicos = [...data, ...equipBilling]
      const newCards = {}
      espacos.forEach(esp => { newCards[esp.id] = initCard(allServicos.filter(s => s.espaco_id === esp.id)) })
      setCards(newCards)
    }
    setLoading(false)
  }, [dataInicio, dataFim, mes, espacos])

  useEffect(() => { if (!loadingEspacos) carregar() }, [carregar, loadingEspacos])

  useEffect(() => {
    if (espacos.length === 0) return
    setMostrarPrevisao(prev => {
      const next = {}
      espacos.forEach(e => { next[e.id] = e.mostrar_previsao ?? false })
      return next
    })
    setVerOcorrencias(prev => {
      const next = {}
      espacos.forEach(e => { next[e.id] = e.operator_ver_ocorrencias ?? false })
      return next
    })
  }, [espacos])

  const handleCardChange = useCallback((id, state) => setCards(p => ({ ...p, [id]: state })), [])

  const togglePrevisao = useCallback(async (id) => {
    const atual = mostrarPrevisao[id] ?? false
    setMostrarPrevisao(prev => ({ ...prev, [id]: !atual }))
    await supabase.from('espacos').update({ mostrar_previsao: !atual }).eq('id', id)
  }, [mostrarPrevisao])

  const toggleVerOcorrencias = useCallback(async (id) => {
    const atual = verOcorrencias[id] ?? false
    setVerOcorrencias(prev => ({ ...prev, [id]: !atual }))
    await supabase.from('espacos').update({ operator_ver_ocorrencias: !atual }).eq('id', id)
  }, [verOcorrencias])

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

      // Secções manuais
      const secoes = [
        { tipo: 'equipamento_comprado', linhas: card.equipamentos_comprado },
        { tipo: 'equipamento_alugado',  linhas: card.equipamentos_alugado },
        { tipo: 'musicos_bandas',       linhas: card.musicos_bandas },
        { tipo: 'extra',                linhas: card.extras },
      ]
      secoes.forEach(({ tipo, linhas }) => {
        linhas.forEach(r => {
          if (r.evento_id) return
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

      // Estado de impressão
      if (card.printState && Object.keys(card.printState).length > 0) {
        inserts.push({
          espaco_id: espacoId, mes, tipo: 'print_state',
          notas: JSON.stringify(card.printState), valor: 0, unidades: 1,
          imprimir: false, margem_tipo: 'eur',
        })
      }

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

        {espacoAtivo !== null && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => togglePrevisao(espacoAtivo)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium border transition-colors',
                mostrarPrevisao[espacoAtivo]
                  ? 'bg-surface-3 border-white/20 text-accent'
                  : 'bg-surface-2 border-border text-accent-muted hover:text-accent'
              )}>
              {mostrarPrevisao[espacoAtivo] ? <Eye size={12} /> : <EyeOff size={12} />}
              {mostrarPrevisao[espacoAtivo] ? 'Financeiro visível' : 'Financeiro oculto'}
            </button>
            <button
              onClick={() => toggleVerOcorrencias(espacoAtivo)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium border transition-colors',
                verOcorrencias[espacoAtivo]
                  ? 'bg-amber-400/15 border-amber-400/30 text-amber-400'
                  : 'bg-surface-2 border-border text-accent-muted hover:text-accent'
              )}>
              <AlertTriangle size={12} />
              {verOcorrencias[espacoAtivo] ? 'Ocorrências on' : 'Ocorrências off'}
            </button>
            <div className="flex items-center gap-0.5 bg-surface-2 border border-border rounded p-0.5">
              {[
                { id: 'prev',        label: 'Previsão' },
                { id: 'prev-agenda', label: 'Prev. + Agenda' },
                { id: 'conf',        label: 'Confirmação' },
                { id: 'conf-agenda', label: 'Conf. + Agenda' },
              ].map(opt => (
                <button key={opt.id}
                  onClick={() => { setLayoutView(opt.id); localStorage.setItem('contasClientes_layout', opt.id) }}
                  className={clsx('px-2.5 py-1 rounded text-[11px] transition-colors',
                    layoutView === opt.id ? 'bg-surface-3 text-accent font-medium' : 'text-accent-subtle hover:text-accent'
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
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
          <Dashboard espacos={espacos} slots={slots} eventos={eventos} cards={cards} catTotals={catTotals} subtiposConfig={subtiposConfig} />
        )}
        {espacoAtivo !== null && espacoDetalhe && (
          <div className="px-[60px] pt-[60px] pb-8">
            <SpaceCard
              espaco={espacoDetalhe}
              slots={slots.filter(s => s.espaco_id === espacoAtivo)}
              slotsExcluidos={slotsExcluidos.filter(s => s.espaco_id === espacoAtivo)}
              eventos={eventosEspaco}
              cardState={cards[espacoAtivo] ?? initCard([])}
              onCardChange={handleCardChange}
              onSave={handleSave}
              saving={!!saving[espacoAtivo]}
              catTotals={catTotals}
              subtiposConfig={subtiposConfig}
              turnos={turnos.filter(t => t.espaco_id === espacoAtivo)}
              mes={mes}
              layoutView={layoutView}
              onEmail={() => setEmailModal(true)}
            />
          </div>
        )}
      </div>

      {emailModal && espacoDetalhe && (
        <EmailAgendaModal
          espaco={espacoDetalhe}
          slots={slots.filter(s => s.espaco_id === espacoAtivo)}
          eventos={eventosEspaco}
          cards={cards}
          catTotals={catTotals}
          subtiposConfig={subtiposConfig}
          anoMes={anoMes}
          onClose={() => setEmailModal(false)}
        />
      )}
    </div>
  )
}
