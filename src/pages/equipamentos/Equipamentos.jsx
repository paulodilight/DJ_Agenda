import { useState, useEffect, useCallback } from 'react'
import { Package, Plus, Search, X, QrCode, Pencil, Trash2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { equipamentosApi } from '@/lib/equipamentosApi'
import { QrScannerModal } from '@/components/equipamentos/QrScannerModal'

const VAZIO = { nome: '', categoria: '', qr_code: '', valor_custo: '', valor_aluguer_dia: '', notas: '' }

function badgeCategoria(cat) {
  const mapa = {
    'Som': 'bg-blue-500/15 text-blue-300 border-blue-500/25',
    'Iluminação': 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
    'DJ': 'bg-purple-500/15 text-purple-300 border-purple-500/25',
    'Vídeo': 'bg-pink-500/15 text-pink-300 border-pink-500/25',
    'Estrutura': 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  }
  return mapa[cat] ?? 'bg-surface-3 text-accent-muted border-border'
}

export function Equipamentos() {
  const [equipamentos, setEquipamentos] = useState([])
  const [movimentacoes, setMovimentacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState('Todos')
  const [busca, setBusca] = useState('')
  const [mostrarMovs, setMostrarMovs] = useState(false)
  const [modal, setModal] = useState(null) // null | { modo: 'criar'|'editar', dados }
  const [form, setForm] = useState(VAZIO)
  const [a_guardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState(null)
  const [scanner, setScanner] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [equip, movs] = await Promise.all([
        equipamentosApi.listar(),
        equipamentosApi.listarMovimentacoes(),
      ])
      setEquipamentos(equip)
      setMovimentacoes(movs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirCriar = () => {
    setForm(VAZIO)
    setErro(null)
    setModal({ modo: 'criar' })
  }

  const abrirEditar = (eq) => {
    setForm({
      nome: eq.nome ?? '',
      categoria: eq.categoria ?? '',
      qr_code: eq.qr_code ?? '',
      valor_custo: eq.valor_custo ?? '',
      valor_aluguer_dia: eq.valor_aluguer_dia ?? '',
      notas: eq.notas ?? '',
    })
    setErro(null)
    setModal({ modo: 'editar', id: eq.id })
  }

  const fecharModal = () => setModal(null)

  const gerarQr = () => {
    if (!form.nome) return
    setForm(f => ({ ...f, qr_code: equipamentosApi.gerarQrCode(form.nome) }))
  }

  const guardar = async () => {
    if (!form.nome.trim()) { setErro('O nome é obrigatório.'); return }
    setAGuardar(true)
    setErro(null)
    try {
      const dados = {
        ...form,
        valor_custo: form.valor_custo ? parseFloat(String(form.valor_custo).replace(',', '.')) : 0,
        valor_aluguer_dia: form.valor_aluguer_dia ? parseFloat(String(form.valor_aluguer_dia).replace(',', '.')) : 0,
      }
      if (modal.modo === 'criar') await equipamentosApi.criar(dados)
      else await equipamentosApi.actualizar(modal.id, dados)
      fecharModal()
      carregar()
    } catch (e) {
      setErro(e.message ?? 'Erro ao guardar.')
    } finally {
      setAGuardar(false)
    }
  }

  const apagar = async (eq) => {
    if (!window.confirm(`Apagar "${eq.nome}"?`)) return
    await equipamentosApi.apagar(eq.id)
    carregar()
  }

  const categorias = ['Todos', ...equipamentosApi.categorias]
  const filtrados = equipamentos.filter(e => {
    const matchCat = filtroCategoria === 'Todos' || e.categoria === filtroCategoria
    const matchBusca = !busca || e.nome.toLowerCase().includes(busca.toLowerCase())
    return matchCat && matchBusca
  })

  const total = equipamentos.length
  const emUso = equipamentos.filter(e => e.em_uso).length
  const disponiveis = total - emUso

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-accent tracking-wide flex items-center gap-2">
            <Package size={18} className="text-status-confirmado" />
            Equipamentos
          </h2>
          <p className="text-xs text-accent-subtle mt-0.5">Catálogo com QR codes · Histórico de movimentações</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanner(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors"
          >
            <QrCode size={14} />
            Scan QR
          </button>
          <button
            onClick={abrirCriar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors"
          >
            <Plus size={14} />
            Novo Equipamento
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total', valor: total, cor: 'text-accent' },
          { label: 'Disponíveis', valor: disponiveis, cor: 'text-status-confirmado' },
          { label: 'Em uso', valor: emUso, cor: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-surface-1 border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mb-1">{s.label}</p>
            <p className={clsx('text-2xl font-bold tabular-nums', s.cor)}>{loading ? '—' : s.valor}</p>
          </div>
        ))}
      </div>

      {/* ── Filtros + busca ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {categorias.map(c => (
            <button
              key={c}
              onClick={() => setFiltroCategoria(c)}
              className={clsx(
                'px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                filtroCategoria === c
                  ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
                  : 'border-border text-accent-muted hover:text-accent hover:bg-surface-2'
              )}
            >
              {c}
              {c !== 'Todos' && (
                <span className="ml-1.5 text-[10px] opacity-60">
                  {equipamentos.filter(e => e.categoria === c).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Pesquisar…"
            className="pl-8 pr-3 py-1.5 bg-surface-1 border border-border rounded-lg text-xs text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 w-48"
          />
        </div>
        <button onClick={carregar} className="p-1.5 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Grelha ── */}
      {loading ? (
        <div className="text-center py-16 text-accent-subtle text-sm">A carregar…</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-accent-subtle">
          <Package size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum equipamento encontrado.</p>
          <button onClick={abrirCriar} className="mt-3 text-xs text-status-confirmado hover:underline">
            + Criar primeiro equipamento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {filtrados.map(eq => (
            <div
              key={eq.id}
              className="bg-surface-1 border border-border rounded-xl overflow-hidden hover:border-white/15 transition-colors group"
            >
              {/* ícone / foto */}
              <div className="bg-surface-2 h-20 flex items-center justify-center relative border-b border-border">
                <Package size={28} className="text-accent-subtle" />
                <div className="absolute top-2 right-2">
                  <span className={clsx(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                    eq.em_uso
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                      : 'bg-status-confirmado/12 text-status-confirmado border-status-confirmado/25'
                  )}>
                    {eq.em_uso ? 'Em uso' : 'Disponível'}
                  </span>
                </div>
                {/* ações hover */}
                <div className="absolute top-2 left-2 hidden group-hover:flex gap-1">
                  <button
                    onClick={() => abrirEditar(eq)}
                    className="p-1 rounded bg-surface-1/80 text-accent-muted hover:text-accent transition-colors"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => apagar(eq)}
                    className="p-1 rounded bg-surface-1/80 text-accent-muted hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              <div className="p-3">
                <p className="text-xs font-semibold text-accent leading-tight mb-1 truncate" title={eq.nome}>
                  {eq.nome}
                </p>
                {eq.categoria && (
                  <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', badgeCategoria(eq.categoria))}>
                    {eq.categoria}
                  </span>
                )}
                {eq.em_uso && eq.evento_atual && (
                  <p className="text-[10px] text-amber-400 mt-1.5 truncate" title={eq.evento_atual.evento}>
                    → {eq.evento_atual.evento}
                  </p>
                )}
                {eq.qr_code ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <QrCode size={10} className="text-accent-subtle shrink-0" />
                    <span className="text-[10px] font-mono text-accent-subtle truncate">{eq.qr_code}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => abrirEditar(eq)}
                    className="mt-2 text-[10px] text-accent-subtle hover:text-status-confirmado transition-colors flex items-center gap-1"
                  >
                    <QrCode size={10} /> Gerar QR code
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* card "novo" */}
          <button
            onClick={abrirCriar}
            className="border-2 border-dashed border-border rounded-xl h-36 flex flex-col items-center justify-center gap-2 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors"
          >
            <Plus size={20} />
            <span className="text-xs">Novo equipamento</span>
          </button>
        </div>
      )}

      {/* ── Movimentações ── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setMostrarMovs(m => !m)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface-2 transition-colors"
        >
          <span className="text-xs font-semibold text-accent uppercase tracking-widest">
            Últimas movimentações
          </span>
          {mostrarMovs ? <ChevronUp size={14} className="text-accent-subtle" /> : <ChevronDown size={14} className="text-accent-subtle" />}
        </button>
        {mostrarMovs && (
          movimentacoes.length === 0 ? (
            <p className="text-center py-8 text-xs text-accent-subtle">Nenhuma movimentação registada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-t border-b border-border bg-surface-0">
                    <th className="text-left px-4 py-2.5 font-medium text-accent-muted">Equipamento</th>
                    <th className="text-left px-3 py-2.5 font-medium text-accent-muted">Evento</th>
                    <th className="text-left px-3 py-2.5 font-medium text-accent-muted">Cliente</th>
                    <th className="text-left px-3 py-2.5 font-medium text-accent-muted">Tipo</th>
                    <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacoes.map(m => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{m.equipamentos?.nome ?? '—'}</td>
                      <td className="px-3 py-2.5 text-accent-muted">{m.supa_eventos?.evento ?? '—'}</td>
                      <td className="px-3 py-2.5 text-accent-muted">{m.supa_eventos?.espacos?.nome ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          m.tipo === 'proprio' ? 'bg-surface-3 text-accent-muted border-border' :
                          m.tipo === 'alugado' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                          'bg-orange-500/10 text-orange-300 border-orange-500/20'
                        )}>
                          {m.tipo === 'proprio' ? 'Próprio' : m.tipo === 'alugado' ? 'Alugado' : 'Comprado'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {m.retorno_at ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-status-confirmado/10 text-status-confirmado border-status-confirmado/20">Devolvido</span>
                        ) : m.saida_at ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-500/10 text-amber-300 border-amber-500/20">Em uso</span>
                        ) : (
                          <span className="text-accent-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Modal criar/editar ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={fecharModal} />
          <div className="relative ml-auto w-full max-w-md bg-surface-1 border-l border-border flex flex-col h-full shadow-2xl">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider">
                {modal.modo === 'criar' ? 'Novo Equipamento' : 'Editar Equipamento'}
              </h3>
              <button onClick={fecharModal} className="p-1 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* campos */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Nome *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome do equipamento"
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Categoria</label>
                <select
                  value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent focus:outline-none focus:border-white/20"
                >
                  <option value="">— Selecionar —</option>
                  {equipamentosApi.categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">QR Code</label>
                <div className="flex gap-2">
                  <input
                    value={form.qr_code}
                    onChange={e => setForm(f => ({ ...f, qr_code: e.target.value }))}
                    placeholder="EQ-XXXX-XXXX"
                    className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm font-mono text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20"
                  />
                  <button
                    type="button"
                    onClick={gerarQr}
                    className="px-3 py-2 rounded-lg border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors flex items-center gap-1.5"
                  >
                    <QrCode size={13} /> Gerar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Custo/uso (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor_custo}
                    onChange={e => setForm(f => ({ ...f, valor_custo: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 text-right"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Aluguer/dia (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor_aluguer_dia}
                    onChange={e => setForm(f => ({ ...f, valor_aluguer_dia: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Notas internas sobre este equipamento…"
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 resize-none"
                />
              </div>

              {erro && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>
              )}
            </div>

            {/* footer */}
            <div className="shrink-0 px-5 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={fecharModal}
                className="px-4 py-2 rounded-lg border border-border text-xs text-accent-muted hover:text-accent hover:bg-surface-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={a_guardar}
                className="px-5 py-2 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors disabled:opacity-50"
              >
                {a_guardar ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {scanner && <QrScannerModal onClose={() => { setScanner(false); carregar() }} />}
    </div>
  )
}
