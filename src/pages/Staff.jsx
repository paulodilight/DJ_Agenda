import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { clsx } from 'clsx'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'

const CARGOS = ['Técnico', 'Gestor', 'Comercial', 'Administrativo', 'Produção', 'Outro']

const VAZIO = { nome: '', cargo: 'Técnico', valor_mensal: '', ativo: true }

function LinhaStaff({ s, onSave, onApagar }) {
  const [modo, setModo] = useState('ver') // ver | editar
  const [form, setForm] = useState({ nome: s.nome, cargo: s.cargo, valor_mensal: s.valor_mensal ?? '', ativo: s.ativo })
  const [salvando, setSalvando] = useState(false)
  const [confirmApagar, setConfirmApagar] = useState(false)

  async function gravar() {
    setSalvando(true)
    await onSave(s.id, { ...form, valor_mensal: form.valor_mensal === '' ? 0 : Number(form.valor_mensal) })
    setSalvando(false)
    setModo('ver')
  }

  if (modo === 'editar') {
    return (
      <tr className="border-b border-border/30">
        <td className="px-4 py-2">
          <input
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            className="w-full rounded bg-surface-2 border border-border px-2 py-1 text-sm text-accent"
          />
        </td>
        <td className="px-4 py-2">
          <select
            value={form.cargo}
            onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
            className="rounded bg-surface-2 border border-border px-2 py-1 text-sm text-accent"
          >
            {CARGOS.map(c => <option key={c}>{c}</option>)}
          </select>
        </td>
        <td className="px-4 py-2">
          <input
            type="number"
            value={form.valor_mensal}
            onChange={e => setForm(f => ({ ...f, valor_mensal: e.target.value }))}
            placeholder="0"
            className="w-28 rounded bg-surface-2 border border-border px-2 py-1 text-sm text-accent"
          />
        </td>
        <td className="px-4 py-2">
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
            className={clsx('px-2 py-0.5 rounded text-[11px] font-bold border transition-all', f => f.ativo
              ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
              : 'bg-surface-3 border-border text-accent-subtle')}
          >
            {form.ativo ? 'Ativo' : 'Inativo'}
          </button>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button onClick={gravar} disabled={salvando}
              className="flex items-center gap-1 rounded bg-status-confirmado/15 border border-status-confirmado/30 px-2 py-1 text-[11px] font-semibold text-status-confirmado hover:bg-status-confirmado/25 transition-all">
              <Check size={12} /> Guardar
            </button>
            <button onClick={() => setModo('ver')}
              className="rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-accent-subtle hover:text-accent transition-all">
              <X size={12} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border/30 hover:bg-surface-2/50 transition-colors">
      <td className="px-4 py-3 text-sm font-semibold text-accent">{s.nome}</td>
      <td className="px-4 py-3">
        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-accent-muted">
          {s.cargo}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-accent-muted tabular-nums">
        {s.valor_mensal > 0 ? `${Number(s.valor_mensal).toLocaleString('pt-PT')} €` : '—'}
      </td>
      <td className="px-4 py-3">
        <span className={clsx('rounded-full px-2.5 py-0.5 text-[11px] font-bold border', s.ativo
          ? 'bg-status-confirmado/15 border-status-confirmado/30 text-status-confirmado'
          : 'bg-surface-3 border-border text-accent-subtle')}>
          {s.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <button onClick={() => setModo('editar')}
            className="flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-accent-subtle hover:text-accent transition-all">
            <Pencil size={11} /> Editar
          </button>
          {!confirmApagar ? (
            <button onClick={() => setConfirmApagar(true)}
              className="rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-accent-subtle hover:text-red-400 transition-all">
              <Trash2 size={11} />
            </button>
          ) : (
            <div className="flex gap-1 items-center">
              <span className="text-[11px] text-red-400">Confirmar?</span>
              <button onClick={() => { onApagar(s.id); setConfirmApagar(false) }}
                className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/20 transition-all">
                Sim
              </button>
              <button onClick={() => setConfirmApagar(false)}
                className="rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-accent-subtle hover:text-accent transition-all">
                Não
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

export function Staff() {
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [novoAberto, setNovoAberto] = useState(false)
  const [novo, setNovo] = useState(VAZIO)
  const [adicionando, setAdicionando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('staff').select('*').order('nome')
    setLista(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function salvar(id, campos) {
    await supabase.from('staff').update(campos).eq('id', id)
    await carregar()
  }

  async function apagar(id) {
    await supabase.from('staff').delete().eq('id', id)
    await carregar()
  }

  async function adicionar() {
    if (!novo.nome.trim()) return
    setAdicionando(true)
    await supabase.from('staff').insert({
      nome: novo.nome.trim(),
      cargo: novo.cargo,
      valor_mensal: novo.valor_mensal === '' ? 0 : Number(novo.valor_mensal),
      ativo: novo.ativo,
    })
    setNovo(VAZIO)
    setNovoAberto(false)
    setAdicionando(false)
    await carregar()
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-accent">Staff</h1>
          <p className="text-sm text-accent-subtle mt-0.5">Equipa LMD — cargos e valores mensais</p>
        </div>
        <button
          onClick={() => setNovoAberto(v => !v)}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-semibold text-accent-muted hover:text-accent hover:border-accent/30 transition-all"
        >
          <Plus size={15} /> Adicionar
        </button>
      </div>

      {novoAberto && (
        <div className="mb-4 rounded-xl border border-border bg-surface-1 p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle">Nome</label>
            <input
              value={novo.nome}
              onChange={e => setNovo(f => ({ ...f, nome: e.target.value }))}
              placeholder="Nome"
              className="rounded bg-surface-2 border border-border px-3 py-1.5 text-sm text-accent w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle">Cargo</label>
            <select
              value={novo.cargo}
              onChange={e => setNovo(f => ({ ...f, cargo: e.target.value }))}
              className="rounded bg-surface-2 border border-border px-3 py-1.5 text-sm text-accent"
            >
              {CARGOS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-accent-subtle">Valor mensal €</label>
            <input
              type="number"
              value={novo.valor_mensal}
              onChange={e => setNovo(f => ({ ...f, valor_mensal: e.target.value }))}
              placeholder="0"
              className="rounded bg-surface-2 border border-border px-3 py-1.5 text-sm text-accent w-28"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={adicionar} disabled={adicionando || !novo.nome.trim()}
              className="flex items-center gap-1.5 rounded-xl border border-status-confirmado/40 bg-status-confirmado/10 px-4 py-2 text-sm font-semibold text-status-confirmado hover:bg-status-confirmado/20 disabled:opacity-40 transition-all">
              <Check size={14} /> Adicionar
            </button>
            <button onClick={() => setNovoAberto(false)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-accent-subtle hover:text-accent transition-all">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-accent-subtle">A carregar…</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-1">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-accent-subtle">Nome</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-accent-subtle">Cargo</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-accent-subtle">Valor mensal</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-accent-subtle">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lista.map(s => (
                <LinhaStaff key={s.id} s={s} onSave={salvar} onApagar={apagar} />
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-accent-subtle">Sem staff registado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
