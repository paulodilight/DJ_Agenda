import { useState, useEffect, useCallback, Fragment } from 'react'
import { Package, Plus, Search, X, QrCode, Pencil, Trash2, RefreshCw, ChevronDown, ChevronUp, LogIn, Clock } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { equipamentosApi } from '@/lib/equipamentosApi'
import { QrScannerModal } from '@/components/equipamentos/QrScannerModal'

const VAZIO = { nome: '', categoria: '', qr_code: '', valor_custo: '', valor_aluguer_dia: '', notas: '' }

const inpCls = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20'
const labelCls = 'block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1'

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

function fmtData(iso) {
  if (!iso) return '—'
  return format(new Date(iso), 'dd/MM HH:mm', { locale: pt })
}

export function Equipamentos() {
  const [equipamentos, setEquipamentos]   = useState([])
  const [movimentacoes, setMovimentacoes] = useState([])
  const [loading, setLoading]             = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState('Todos')
  const [busca, setBusca]                 = useState('')
  const [mostrarMovs, setMostrarMovs]     = useState(false)
  const [modal, setModal]                 = useState(null)
  const [form, setForm]                   = useState(VAZIO)
  const [a_guardar, setAGuardar]          = useState(false)
  const [erro, setErro]                   = useState(null)
  const [scanner, setScanner]             = useState(false)

  // Entrada inline
  const [entradaAberta, setEntradaAberta] = useState(null) // eq.id
  const [retornoPor, setRetornoPor]       = useState('')
  const [notasEntrada, setNotasEntrada]   = useState('')
  const [a_entrando, setAEntrando]        = useState(false)

  // Histórico expansível
  const [historicoAberto, setHistoricoAberto] = useState(null) // eq.id
  const [historicoData, setHistoricoData]     = useState({})  // { [id]: records[] }
  const [historicoLoading, setHistoricoLoading] = useState(false)

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

  // ── Entrada inline ──────────────────────────────────────────
  const abrirEntrada = (eq) => {
    setEntradaAberta(eq.id)
    setRetornoPor('')
    setNotasEntrada('')
  }
  const fecharEntrada = () => setEntradaAberta(null)

  const submeterEntrada = async (eq) => {
    if (!eq.movimento_id) return
    setAEntrando(true)
    try {
      await equipamentosApi.registarEntrada(eq.movimento_id, retornoPor || null, notasEntrada || null)
      fecharEntrada()
      await carregar()
    } catch (e) {
      console.error(e)
    } finally {
      setAEntrando(false)
    }
  }

  // ── Histórico ───────────────────────────────────────────────
  const toggleHistorico = async (eq) => {
    if (historicoAberto === eq.id) { setHistoricoAberto(null); return }
    setHistoricoAberto(eq.id)
    if (!historicoData[eq.id]) {
      setHistoricoLoading(true)
      try {
        const rows = await equipamentosApi.historico(eq.id)
        setHistoricoData(d => ({ ...d, [eq.id]: rows }))
      } catch (e) { console.error(e) }
      finally { setHistoricoLoading(false) }
    }
  }

  // ── Modal CRUD ──────────────────────────────────────────────
  const abrirCriar = () => { setForm(VAZIO); setErro(null); setModal({ modo: 'criar' }) }
  const abrirEditar = (eq) => {
    setForm({ nome: eq.nome ?? '', categoria: eq.categoria ?? '', qr_code: eq.qr_code ?? '',
              valor_custo: eq.valor_custo ?? '', valor_aluguer_dia: eq.valor_aluguer_dia ?? '', notas: eq.notas ?? '' })
    setErro(null)
    setModal({ modo: 'editar', id: eq.id })
  }
  const fecharModal = () => setModal(null)
  const gerarQr = () => { if (form.nome) setForm(f => ({ ...f, qr_code: equipamentosApi.gerarQrCode(form.nome) })) }

  const guardar = async () => {
    if (!form.nome.trim()) { setErro('O nome é obrigatório.'); return }
    setAGuardar(true); setErro(null)
    try {
      const dados = { ...form,
        valor_custo: form.valor_custo ? parseFloat(String(form.valor_custo).replace(',', '.')) : 0,
        valor_aluguer_dia: form.valor_aluguer_dia ? parseFloat(String(form.valor_aluguer_dia).replace(',', '.')) : 0 }
      if (modal.modo === 'criar') await equipamentosApi.criar(dados)
      else await equipamentosApi.actualizar(modal.id, dados)
      fecharModal(); carregar()
    } catch (e) { setErro(e.message ?? 'Erro ao guardar.') }
    finally { setAGuardar(false) }
  }

  const apagar = async (eq) => {
    if (!window.confirm(`Apagar "${eq.nome}"?`)) return
    await equipamentosApi.apagar(eq.id); carregar()
  }

  // ── Filtros ─────────────────────────────────────────────────
  const categorias = ['Todos', ...equipamentosApi.categorias]
  const filtrados = equipamentos.filter(e => {
    const matchCat   = filtroCategoria === 'Todos' || e.categoria === filtroCategoria
    const matchBusca = !busca || e.nome.toLowerCase().includes(busca.toLowerCase())
    return matchCat && matchBusca
  })
  const total      = equipamentos.length
  const emUso      = equipamentos.filter(e => e.em_uso).length
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
          <button onClick={() => setScanner(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors">
            <QrCode size={14} /> Scan QR
          </button>
          <button onClick={abrirCriar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors">
            <Plus size={14} /> Novo Equipamento
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

      {/* ── Filtros ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {categorias.map(c => (
            <button key={c} onClick={() => setFiltroCategoria(c)}
              className={clsx('px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                filtroCategoria === c
                  ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
                  : 'border-border text-accent-muted hover:text-accent hover:bg-surface-2')}>
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
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar…"
            className="pl-8 pr-3 py-1.5 bg-surface-1 border border-border rounded-lg text-xs text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 w-48" />
        </div>
        <button onClick={carregar} className="p-1.5 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Listas ── */}
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
      ) : (() => {
        const fora   = filtrados.filter(e => e.em_uso)
        const dentro = filtrados.filter(e => !e.em_uso)
        const thCls  = 'text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px]'

        const qrCell = (eq) => eq.qr_code
          ? <span className="font-mono text-[10px] text-accent-subtle">{eq.qr_code}</span>
          : <button onClick={() => abrirEditar(eq)} className="text-[10px] text-accent-subtle hover:text-status-confirmado transition-colors flex items-center gap-1"><QrCode size={10} />Gerar</button>

        const histBtn = (eq, cor = 'text-accent-muted') => (
          <button
            onClick={() => toggleHistorico(eq)}
            title="Histórico"
            className={clsx('p-1 rounded hover:bg-surface-3 transition-colors', cor,
              historicoAberto === eq.id ? 'text-blue-400' : 'hover:text-blue-400')}>
            <Clock size={12} />
          </button>
        )

        // ── Linha de histórico ───────────────────────────────
        const histRow = (eq, cols) => {
          if (historicoAberto !== eq.id) return null
          const rows = historicoData[eq.id]
          return (
            <tr key={`hist-${eq.id}`} className="bg-surface-0">
              <td colSpan={cols} className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400/70 mb-2">
                  Histórico — {eq.nome}
                </p>
                {historicoLoading && !rows ? (
                  <p className="text-[10px] text-accent-subtle">A carregar…</p>
                ) : !rows || rows.length === 0 ? (
                  <p className="text-[10px] text-accent-subtle italic">Sem movimentos registados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="text-accent-subtle border-b border-border/40">
                          <th className="text-left py-1 pr-4 font-semibold">Data saída</th>
                          <th className="text-left py-1 pr-4 font-semibold">Por</th>
                          <th className="text-left py-1 pr-4 font-semibold">Qtd</th>
                          <th className="text-left py-1 pr-4 font-semibold">Notas saída</th>
                          <th className="text-left py-1 pr-4 font-semibold">Data entrada</th>
                          <th className="text-left py-1 pr-4 font-semibold">Devolvido por</th>
                          <th className="text-left py-1 font-semibold">Obs. retorno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className="border-b border-border/20 hover:bg-surface-1/50">
                            <td className="py-1.5 pr-4 tabular-nums text-accent-muted">{fmtData(r.saida_at)}</td>
                            <td className="py-1.5 pr-4 text-accent-muted">{r.registado_por ?? '—'}</td>
                            <td className="py-1.5 pr-4 tabular-nums text-accent-muted">{r.quantidade ?? 1}</td>
                            <td className="py-1.5 pr-4 text-accent-muted max-w-[120px] truncate" title={r.observacoes}>{r.observacoes ?? '—'}</td>
                            <td className={clsx('py-1.5 pr-4 tabular-nums', r.retorno_at ? 'text-status-confirmado' : 'text-amber-400/60')}>
                              {r.retorno_at ? fmtData(r.retorno_at) : <span className="italic opacity-60">Em uso</span>}
                            </td>
                            <td className="py-1.5 pr-4 text-accent-muted">{r.retorno_por ?? '—'}</td>
                            <td className="py-1.5 text-accent-muted max-w-[120px] truncate" title={r.notas_retorno}>{r.notas_retorno ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </td>
            </tr>
          )
        }

        // ── Linha de form de entrada ─────────────────────────
        const entradaRow = (eq) => {
          if (entradaAberta !== eq.id) return null
          return (
            <tr key={`entrada-${eq.id}`} className="bg-blue-500/5 border-b border-blue-500/15">
              <td colSpan={6} className="px-4 py-3">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <label className={labelCls}>Devolvido por</label>
                    <input value={retornoPor} onChange={e => setRetornoPor(e.target.value)}
                      placeholder="Nome de quem devolve…" className={inpCls} />
                  </div>
                  <div className="flex-[2] min-w-[180px]">
                    <label className={labelCls}>Observações de retorno</label>
                    <input value={notasEntrada} onChange={e => setNotasEntrada(e.target.value)}
                      placeholder="Estado do equipamento, danos…" className={inpCls} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => submeterEntrada(eq)} disabled={a_entrando}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      <LogIn size={12} />
                      {a_entrando ? 'A registar…' : 'Confirmar Entrada'}
                    </button>
                    <button onClick={fecharEntrada} className="p-1.5 rounded hover:bg-surface-3 text-accent-subtle hover:text-accent transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )
        }

        return (
          <div className="flex flex-col gap-6 mb-8">

            {/* ── FORA ── */}
            <div className="rounded-xl overflow-hidden border border-amber-500/25">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Fora — Em uso
                  <span className="ml-2 font-normal text-amber-400/60">({fora.length})</span>
                </p>
              </div>
              {fora.length === 0 ? (
                <p className="text-center py-6 text-xs text-accent-subtle/40 italic">Nenhum equipamento fora.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[640px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-0">
                        <th className={clsx(thCls, 'text-amber-400/60')}>Nome</th>
                        <th className={clsx(thCls, 'text-amber-400/60')}>QR</th>
                        <th className={clsx(thCls, 'text-amber-400/60')}>Evento</th>
                        <th className={clsx(thCls, 'text-amber-400/60')}>Saída por</th>
                        <th className={clsx(thCls, 'text-amber-400/60')}>Data saída</th>
                        <th className="px-3 py-2.5 w-36" />
                      </tr>
                    </thead>
                    <tbody>
                      {fora.map(eq => (
                        <Fragment key={eq.id}>
                          <tr className="border-b border-border/40 hover:bg-amber-500/5 transition-colors group">
                            <td className="px-4 py-2.5 font-semibold text-accent">{eq.nome}</td>
                            <td className="px-4 py-2.5">{qrCell(eq)}</td>
                            <td className="px-4 py-2.5 text-amber-400/80 max-w-[180px] truncate" title={eq.evento_atual?.evento}>
                              {eq.evento_atual?.evento ?? <span className="text-accent-subtle/30">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-accent-muted">{eq.registado_por ?? <span className="text-accent-subtle/30">—</span>}</td>
                            <td className="px-4 py-2.5 text-accent-muted tabular-nums">{fmtData(eq.saida_at)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => entradaAberta === eq.id ? fecharEntrada() : abrirEntrada(eq)}
                                  className={clsx(
                                    'flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-colors',
                                    entradaAberta === eq.id
                                      ? 'bg-blue-500/25 border-blue-500/50 text-blue-300'
                                      : 'bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25'
                                  )}>
                                  <LogIn size={11} />
                                  Entrada
                                </button>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {histBtn(eq, 'text-accent-muted')}
                                  <button onClick={() => abrirEditar(eq)} className="p-1 rounded hover:bg-surface-3 text-accent-muted hover:text-accent transition-colors"><Pencil size={12} /></button>
                                  <button onClick={() => apagar(eq)} className="p-1 rounded hover:bg-surface-3 text-accent-muted hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {entradaRow(eq)}
                          {histRow(eq, 6)}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── DENTRO ── */}
            <div className="rounded-xl overflow-hidden border border-status-confirmado/20">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-status-confirmado/8 border-b border-status-confirmado/15">
                <span className="w-2 h-2 rounded-full bg-status-confirmado shrink-0" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-status-confirmado">
                  Dentro — Disponível
                  <span className="ml-2 font-normal text-status-confirmado/50">({dentro.length})</span>
                </p>
              </div>
              {dentro.length === 0 ? (
                <p className="text-center py-6 text-xs text-accent-subtle/40 italic">Nenhum equipamento disponível.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[400px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-0">
                        <th className={clsx(thCls, 'text-accent-subtle')}>Nome</th>
                        <th className={clsx(thCls, 'text-accent-subtle')}>Categoria</th>
                        <th className={clsx(thCls, 'text-accent-subtle')}>QR</th>
                        <th className="px-3 py-2.5 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {dentro.map(eq => (
                        <Fragment key={eq.id}>
                          <tr className="border-b border-border/40 hover:bg-surface-2 transition-colors group">
                            <td className="px-4 py-2.5 font-semibold text-accent">{eq.nome}</td>
                            <td className="px-4 py-2.5">
                              {eq.categoria
                                ? <span className={clsx('px-1.5 py-0.5 rounded border font-medium text-[10px]', badgeCategoria(eq.categoria))}>{eq.categoria}</span>
                                : <span className="text-accent-subtle/30">—</span>}
                            </td>
                            <td className="px-4 py-2.5">{qrCell(eq)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {histBtn(eq, 'text-accent-muted')}
                                <button onClick={() => abrirEditar(eq)} className="p-1 rounded hover:bg-surface-3 text-accent-muted hover:text-accent transition-colors"><Pencil size={12} /></button>
                                <button onClick={() => apagar(eq)} className="p-1 rounded hover:bg-surface-3 text-accent-muted hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                          {histRow(eq, 4)}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )
      })()}

      {/* ── Movimentações ── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <button onClick={() => setMostrarMovs(m => !m)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface-2 transition-colors">
          <span className="text-xs font-semibold text-accent uppercase tracking-widest">Últimas movimentações</span>
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
                        <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          m.tipo === 'proprio' ? 'bg-surface-3 text-accent-muted border-border' :
                          m.tipo === 'alugado' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                          'bg-orange-500/10 text-orange-300 border-orange-500/20')}>
                          {m.tipo === 'proprio' ? 'Próprio' : m.tipo === 'alugado' ? 'Alugado' : 'Comprado'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {m.retorno_at
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-status-confirmado/10 text-status-confirmado border-status-confirmado/20">Devolvido</span>
                          : m.saida_at
                          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-500/10 text-amber-300 border-amber-500/20">Em uso</span>
                          : <span className="text-accent-subtle">—</span>}
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider">
                {modal.modo === 'criar' ? 'Novo Equipamento' : 'Editar Equipamento'}
              </h3>
              <button onClick={fecharModal} className="p-1 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Nome *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome do equipamento"
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Categoria</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent focus:outline-none focus:border-white/20">
                  <option value="">— Selecionar —</option>
                  {equipamentosApi.categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">QR Code</label>
                <div className="flex gap-2">
                  <input value={form.qr_code} onChange={e => setForm(f => ({ ...f, qr_code: e.target.value }))}
                    placeholder="EQ-XXXX-XXXX"
                    className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm font-mono text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20" />
                  <button type="button" onClick={gerarQr}
                    className="px-3 py-2 rounded-lg border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors flex items-center gap-1.5">
                    <QrCode size={13} /> Gerar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Custo/uso (€)</label>
                  <input type="number" step="0.01" min="0" value={form.valor_custo}
                    onChange={e => setForm(f => ({ ...f, valor_custo: e.target.value }))} placeholder="0,00"
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 text-right" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Aluguer/dia (€)</label>
                  <input type="number" step="0.01" min="0" value={form.valor_aluguer_dia}
                    onChange={e => setForm(f => ({ ...f, valor_aluguer_dia: e.target.value }))} placeholder="0,00"
                    className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 text-right" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Notas internas sobre este equipamento…" rows={3}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 resize-none" />
              </div>
              {erro && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={fecharModal}
                className="px-4 py-2 rounded-lg border border-border text-xs text-accent-muted hover:text-accent hover:bg-surface-2 transition-colors">
                Cancelar
              </button>
              <button onClick={guardar} disabled={a_guardar}
                className="px-5 py-2 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors disabled:opacity-50">
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
