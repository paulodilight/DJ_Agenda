import { useState, useEffect, useCallback, Fragment } from 'react'
import { Package, Plus, Search, X, QrCode, Pencil, Trash2, RefreshCw, ChevronDown, ChevronUp, LogIn, LogOut, Clock, Boxes, Handshake, Printer } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { equipamentosApi } from '@/lib/equipamentosApi'
import { alugueresApi } from '@/lib/alugueresApi'
import { QrScannerModal } from '@/components/equipamentos/QrScannerModal'
import { GestaoStocks } from '@/components/equipamentos/GestaoStocks'
import { ContratoAluguer } from '@/pages/alugueres/ContratoAluguer'

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

function fmtDia(iso) {
  if (!iso) return '—'
  return format(new Date(iso), 'dd/MM/yyyy', { locale: pt })
}

const ESTADO_INFO = {
  reserva:   { label: 'Reserva',   cls: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  em_curso:  { label: 'Em curso',  cls: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  concluido: { label: 'Concluído', cls: 'bg-status-confirmado/10 text-status-confirmado border-status-confirmado/20' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
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
  const [mostrarDentro, setMostrarDentro] = useState(false)
  const [modal, setModal]                 = useState(null)
  const [form, setForm]                   = useState(VAZIO)
  const [a_guardar, setAGuardar]          = useState(false)
  const [erro, setErro]                   = useState(null)
  const [scanner, setScanner]             = useState(false)
  const [a_confirmando, setAConfirmando]  = useState(null)
  const [aba, setAba]                     = useState('saidas')

  // Entrada inline
  const [entradaAberta, setEntradaAberta] = useState(null) // eq.id
  const [retornoPor, setRetornoPor]       = useState('')
  const [notasEntrada, setNotasEntrada]   = useState('')
  const [a_entrando, setAEntrando]        = useState(false)

  // Alugueres
  const [alugueres, setAlugueres]           = useState([])
  const [loadingAl, setLoadingAl]           = useState(false)
  const [contrato, setContrato]             = useState(null)
  const [filtroEstadoAl, setFiltroEstadoAl] = useState('todos')

  // Catálogo
  const [editandoGrupo, setEditandoGrupo]      = useState(null)
  const [editFormCat, setEditFormCat]           = useState({})
  const [aGuardarCatalog, setAGuardarCatalog]   = useState(false)
  const [acordeaoAberto, setAcordeaoAberto]     = useState(new Set())
  const [buscaCat, setBuscaCat]                 = useState('')
  const [filtroCatCatalog, setFiltroCatCatalog] = useState('Todos')

  // Histórico expansível
  const [historicoAberto, setHistoricoAberto] = useState(null) // eq.id
  const [historicoData, setHistoricoData]     = useState({})  // { [id]: records[] }
  const [historicoLoading, setHistoricoLoading] = useState(false)

  const carregarAlugueres = useCallback(async () => {
    setLoadingAl(true)
    try { setAlugueres(await alugueresApi.listar()) }
    catch (e) { console.error(e) }
    finally { setLoadingAl(false) }
  }, [])

  useEffect(() => { if (aba === 'alugueres') carregarAlugueres() }, [aba, carregarAlugueres])

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

  const confirmarSaida = async (eq) => {
    if (!eq.reserva_movimento_id) return
    setAConfirmando(eq.id)
    try {
      await equipamentosApi.confirmarSaida(eq.reserva_movimento_id)
      await carregar()
    } finally {
      setAConfirmando(null)
    }
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
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-lg font-bold text-accent tracking-wide flex items-center gap-2">
          <Package size={18} className="text-status-confirmado" />
          Equipamentos
        </h2>
        {aba === 'saidas' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setScanner(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors">
              <QrCode size={13} /> Scan QR
            </button>
            <button onClick={abrirCriar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors">
              <Plus size={13} /> Novo
            </button>
          </div>
        )}
        {aba === 'catalogo' && (
          <button onClick={abrirCriar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors">
            <Plus size={13} /> Novo Equipamento
          </button>
        )}
      </div>

      {/* ── Abas ── */}
      <div className="flex gap-1 border-b border-border mb-4">
        {[
          { id: 'saidas',    label: 'Saídas e entradas' },
          { id: 'stocks',    label: 'Stock Estúdios' },
          { id: 'alugueres', label: 'Alugueres' },
          { id: 'catalogo',  label: 'Equipamentos' },
        ].map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={clsx('px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5',
              aba === a.id ? 'border-status-confirmado text-status-confirmado' : 'border-transparent text-accent-muted hover:text-accent')}>
            {a.id === 'stocks' && <Boxes size={13} />}
            {a.label}
          </button>
        ))}
      </div>

      {/* ── Aba Stock Estúdios ── */}
      {aba === 'stocks' && <GestaoStocks equipamentos={equipamentos} loading={loading} />}

      {/* ── Aba Alugueres ── */}
      {aba === 'alugueres' && (() => {
        const ESTADOS_AL = [
          { id: 'todos',     label: 'Todos' },
          { id: 'reserva',   label: 'Reserva' },
          { id: 'em_curso',  label: 'Em curso' },
          { id: 'concluido', label: 'Concluído' },
          { id: 'cancelado', label: 'Cancelado' },
        ]
        const thAl = 'text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle'
        const listagem = filtroEstadoAl === 'todos' ? alugueres : alugueres.filter(a => a.estado === filtroEstadoAl)

        return (
          <div>
            {/* filtros + refresh */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="flex gap-1 flex-wrap">
                {ESTADOS_AL.map(e => (
                  <button key={e.id} onClick={() => setFiltroEstadoAl(e.id)}
                    className={clsx('px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                      filtroEstadoAl === e.id
                        ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
                        : 'border-border text-accent-muted hover:text-accent hover:bg-surface-2')}>
                    {e.label}
                    {e.id !== 'todos' && (
                      <span className="ml-1.5 text-[10px] opacity-60">
                        {alugueres.filter(a => a.estado === e.id).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button onClick={carregarAlugueres} className="ml-auto p-1.5 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors">
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingAl ? (
              <div className="text-center py-16 text-accent-subtle text-sm">A carregar…</div>
            ) : listagem.length === 0 ? (
              <div className="text-center py-16 text-accent-subtle">
                <Handshake size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum aluguer encontrado.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-0">
                        <th className={thAl}>Nº</th>
                        <th className={thAl}>Cliente</th>
                        <th className={thAl}>Estado</th>
                        <th className={thAl}>Saída prevista</th>
                        <th className={thAl}>Entrada prevista</th>
                        <th className={clsx(thAl, 'text-center')}>Itens</th>
                        <th className={clsx(thAl, 'text-right')}>Total</th>
                        <th className="px-3 py-2.5 w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {listagem.map(al => {
                        const info = ESTADO_INFO[al.estado] ?? { label: al.estado, cls: 'bg-surface-3 text-accent-muted border-border' }
                        return (
                          <tr key={al.id} className="border-b border-border/40 hover:bg-surface-2 transition-colors group">
                            <td className="px-4 py-2.5 font-mono text-[11px] text-accent-muted">{al.numero ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-accent truncate max-w-[160px]" title={al.aluguer_clientes?.nome}>{al.aluguer_clientes?.nome ?? '—'}</div>
                              {al.aluguer_clientes?.telefone && <div className="text-[10px] text-accent-subtle">{al.aluguer_clientes.telefone}</div>}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold border', info.cls)}>{info.label}</span>
                            </td>
                            <td className="px-4 py-2.5 text-accent-muted tabular-nums">{fmtDia(al.data_saida_prevista)}</td>
                            <td className="px-4 py-2.5 text-accent-muted tabular-nums">{fmtDia(al.data_entrada_prevista)}</td>
                            <td className="px-4 py-2.5 text-center text-accent-muted">{al.aluguer_itens?.length ?? 0}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-accent tabular-nums">
                              {al.valor_total != null ? `${Number(al.valor_total).toFixed(2)} €` : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <button onClick={() => setContrato(al)} title="Imprimir contrato"
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-surface-3 text-accent-muted hover:text-accent transition-all">
                                <Printer size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Aba Catálogo de Equipamentos ── */}
      {aba === 'catalogo' && (() => {
        const gruposMap = {}
        equipamentos.forEach(eq => {
          const key = eq.nome
          if (!gruposMap[key]) {
            gruposMap[key] = { nome: eq.nome, categoria: eq.categoria, valor_custo: eq.valor_custo, valor_aluguer_dia: eq.valor_aluguer_dia, notas: eq.notas, extra_estudio: eq.extra_estudio ?? false, chave_estudio: eq.chave_estudio ?? '', unidades: [] }
          }
          gruposMap[key].unidades.push(eq)
        })
        const todosGrupos = Object.values(gruposMap).sort((a, b) => a.nome.localeCompare(b.nome))
        const grupos = todosGrupos.filter(g => {
          const matchBusca = !buscaCat || g.nome.toLowerCase().includes(buscaCat.toLowerCase())
          const matchCat = filtroCatCatalog === 'Todos' || g.categoria === filtroCatCatalog
          return matchBusca && matchCat
        })

        const thCat = 'text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle'

        const toggleAcordeao = (nome) => setAcordeaoAberto(s => {
          const n = new Set(s); n.has(nome) ? n.delete(nome) : n.add(nome); return n
        })

        const guardarCatalog = async (grupo) => {
          setAGuardarCatalog(true)
          try {
            const dados = {
              categoria: editFormCat.categoria,
              valor_custo: editFormCat.valor_custo !== '' ? parseFloat(String(editFormCat.valor_custo).replace(',', '.')) : 0,
              valor_aluguer_dia: editFormCat.valor_aluguer_dia !== '' ? parseFloat(String(editFormCat.valor_aluguer_dia).replace(',', '.')) : 0,
              notas: editFormCat.notas,
              extra_estudio: editFormCat.extra_estudio,
              chave_estudio: editFormCat.chave_estudio || null,
            }
            await Promise.all(grupo.unidades.map(u => equipamentosApi.actualizar(u.id, dados)))
            setEditandoGrupo(null)
            await carregar()
          } catch (e) { console.error(e) }
          finally { setAGuardarCatalog(false) }
        }

        const novaUnidade = (grupo) => {
          setForm({ nome: grupo.nome, categoria: grupo.categoria ?? '', qr_code: '', valor_custo: grupo.valor_custo ?? '', valor_aluguer_dia: grupo.valor_aluguer_dia ?? '', notas: grupo.notas ?? '' })
          setErro(null)
          setModal({ modo: 'criar' })
        }

        const apagarUnidade = async (u) => {
          if (!window.confirm(`Apagar "${u.qr_code || u.nome}"?`)) return
          await equipamentosApi.apagar(u.id)
          await carregar()
        }

        return (
          <div>
            {/* Pesquisa + filtros */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="flex gap-1 flex-wrap">
                {['Todos', ...equipamentosApi.categorias].map(c => (
                  <button key={c} onClick={() => setFiltroCatCatalog(c)}
                    className={clsx('px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                      filtroCatCatalog === c
                        ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
                        : 'border-border text-accent-muted hover:text-accent hover:bg-surface-2')}>
                    {c}
                    {c !== 'Todos' && (
                      <span className="ml-1.5 text-[10px] opacity-60">
                        {todosGrupos.filter(g => g.categoria === c).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle" />
                <input value={buscaCat} onChange={e => setBuscaCat(e.target.value)} placeholder="Pesquisar…"
                  className="pl-8 pr-8 py-1.5 bg-surface-1 border border-border rounded-lg text-xs text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 w-48" />
                {buscaCat && (
                  <button onClick={() => setBuscaCat('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-16 text-accent-subtle text-sm">A carregar…</div>
            ) : grupos.length === 0 ? (
              <div className="text-center py-16 text-accent-subtle">
                <Package size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">{buscaCat || filtroCatCatalog !== 'Todos' ? 'Nenhum resultado.' : 'Nenhum equipamento encontrado.'}</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[840px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-0">
                        <th className={thCat}>Nome</th>
                        <th className={thCat}>Categoria</th>
                        <th className={thCat}>Unidades</th>
                        <th className={clsx(thCat, 'text-right')}>Custo (€)</th>
                        <th className={clsx(thCat, 'text-right')}>Aluguer/dia (€)</th>
                        <th className={thCat}>Notas</th>
                        <th className={thCat}>Estúdio</th>
                        <th className="px-3 py-2.5 w-28" />
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map(grupo => {
                        const editing = editandoGrupo === grupo.nome
                        const multi = grupo.unidades.length > 1
                        const aberto = acordeaoAberto.has(grupo.nome)
                        return (
                          <Fragment key={grupo.nome}>
                            <tr className="border-b border-border/40 hover:bg-surface-2 transition-colors group">
                              <td className="px-4 py-3 font-semibold text-accent max-w-[200px]">
                                <span className="block truncate" title={grupo.nome}>{grupo.nome}</span>
                              </td>
                              <td className="px-4 py-3">
                                {editing ? (
                                  <select value={editFormCat.categoria} onChange={e => setEditFormCat(f => ({ ...f, categoria: e.target.value }))}
                                    className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-accent focus:outline-none focus:border-white/20">
                                    <option value="">—</option>
                                    {equipamentosApi.categorias.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                ) : (
                                  grupo.categoria
                                    ? <span className={clsx('px-1.5 py-0.5 rounded border font-medium text-[10px]', badgeCategoria(grupo.categoria))}>{grupo.categoria}</span>
                                    : <span className="text-accent-subtle/30">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {multi ? (
                                  <button onClick={() => toggleAcordeao(grupo.nome)}
                                    className="flex items-center gap-1 text-[10px] text-accent-muted hover:text-accent transition-colors">
                                    <span className="tabular-nums">{grupo.unidades.length} unidades</span>
                                    {aberto ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                  </button>
                                ) : (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-accent-muted border border-border whitespace-nowrap">
                                    {grupo.unidades[0].qr_code || <span className="italic text-accent-subtle/40">sem QR</span>}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {editing ? (
                                  <input type="number" step="0.01" min="0" value={editFormCat.valor_custo}
                                    onChange={e => setEditFormCat(f => ({ ...f, valor_custo: e.target.value }))}
                                    className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-right text-accent focus:outline-none focus:border-white/20" />
                                ) : (
                                  <span className="text-accent">{grupo.valor_custo != null ? Number(grupo.valor_custo).toFixed(2) : '—'}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {editing ? (
                                  <input type="number" step="0.01" min="0" value={editFormCat.valor_aluguer_dia}
                                    onChange={e => setEditFormCat(f => ({ ...f, valor_aluguer_dia: e.target.value }))}
                                    className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-right text-accent focus:outline-none focus:border-white/20" />
                                ) : (
                                  <span className={grupo.valor_aluguer_dia ? 'text-accent' : 'text-accent-subtle/40'}>
                                    {grupo.valor_aluguer_dia != null ? Number(grupo.valor_aluguer_dia).toFixed(2) : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 max-w-[160px]">
                                {editing ? (
                                  <input value={editFormCat.notas} onChange={e => setEditFormCat(f => ({ ...f, notas: e.target.value }))}
                                    placeholder="Notas…"
                                    className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20" />
                                ) : (
                                  <span className="text-accent-muted truncate block" title={grupo.notas}>{grupo.notas || <span className="text-accent-subtle/30">—</span>}</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {editing ? (
                                  <div className="flex flex-col gap-1">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input type="checkbox" checked={editFormCat.extra_estudio} onChange={e => setEditFormCat(f => ({ ...f, extra_estudio: e.target.checked }))}
                                        className="w-3.5 h-3.5 rounded accent-status-confirmado" />
                                      <span className="text-[10px] text-accent-muted">Extra</span>
                                    </label>
                                    {editFormCat.extra_estudio && (
                                      <input value={editFormCat.chave_estudio} onChange={e => setEditFormCat(f => ({ ...f, chave_estudio: e.target.value }))}
                                        placeholder="CDJ-2000NXS2"
                                        className="w-24 bg-surface-2 border border-border rounded px-2 py-1 text-[10px] text-accent placeholder-accent-subtle/50 focus:outline-none focus:border-white/20" />
                                    )}
                                  </div>
                                ) : (
                                  grupo.extra_estudio
                                    ? <span className="px-1.5 py-0.5 rounded border text-[10px] font-medium bg-blue-500/10 border-blue-500/30 text-blue-400" title={grupo.chave_estudio || ''}>🏢 {grupo.chave_estudio || 'Extra'}</span>
                                    : <span className="text-accent-subtle/30">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {editing ? (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => guardarCatalog(grupo)} disabled={aGuardarCatalog}
                                      className="px-2.5 py-1 rounded bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-[10px] font-semibold hover:bg-status-confirmado/25 disabled:opacity-50 transition-colors">
                                      {aGuardarCatalog ? '…' : 'Guardar'}
                                    </button>
                                    <button onClick={() => setEditandoGrupo(null)}
                                      className="p-1 rounded hover:bg-surface-3 text-accent-subtle hover:text-accent transition-colors">
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => { setEditandoGrupo(grupo.nome); setEditFormCat({ categoria: grupo.categoria ?? '', valor_custo: grupo.valor_custo ?? 0, valor_aluguer_dia: grupo.valor_aluguer_dia ?? 0, notas: grupo.notas ?? '', extra_estudio: grupo.extra_estudio ?? false, chave_estudio: grupo.chave_estudio ?? '' }) }}
                                      className="p-1 rounded hover:bg-surface-3 text-accent-muted hover:text-accent transition-colors" title="Editar">
                                      <Pencil size={12} />
                                    </button>
                                    <button onClick={() => novaUnidade(grupo)}
                                      className="flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-surface-3 text-accent-muted hover:text-status-confirmado text-[10px] transition-colors" title="Nova unidade">
                                      <Plus size={10} /> un.
                                    </button>
                                    {!multi && (
                                      <button onClick={() => apagarUnidade(grupo.unidades[0])}
                                        className="p-1 rounded hover:bg-surface-3 text-accent-subtle hover:text-red-400 transition-colors" title="Apagar">
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                            {/* Acordeão — lista de unidades para grupos múltiplos */}
                            {multi && aberto && (
                              <tr className="border-b border-border/30 bg-surface-0">
                                <td colSpan={8} className="px-6 py-3">
                                  <div className="flex flex-col gap-1.5 pl-4 border-l-2 border-border">
                                    {grupo.unidades.map(u => (
                                      <div key={u.id} className="flex items-center justify-between gap-3 group/unit py-0.5">
                                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-accent-muted border border-border whitespace-nowrap">
                                          {u.qr_code || <span className="italic text-accent-subtle/40">sem QR</span>}
                                        </span>
                                        <button onClick={() => apagarUnidade(u)}
                                          className="opacity-0 group-hover/unit:opacity-100 p-1 rounded hover:bg-surface-3 text-accent-subtle hover:text-red-400 transition-all shrink-0" title="Apagar unidade">
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Aba Saídas e entradas ── */}
      {aba === 'saidas' && <>

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
        const fora      = filtrados.filter(e => e.em_uso)
        const reservado = filtrados.filter(e => e.reservado)
        const dentro    = filtrados.filter(e => !e.em_uso && !e.reservado)
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
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-amber-500/10">
                    {fora.map(eq => (
                      <div key={eq.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-accent text-sm">{eq.nome}</div>
                            {eq.evento_atual?.evento && <div className="text-xs text-amber-400/80 truncate">{eq.evento_atual.evento}</div>}
                            <div className="text-xs text-accent-muted mt-0.5">
                              {eq.registado_por && <span>{eq.registado_por} · </span>}
                              {fmtData(eq.saida_at)}
                            </div>
                          </div>
                          <button onClick={() => entradaAberta === eq.id ? fecharEntrada() : abrirEntrada(eq)}
                            className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors shrink-0',
                              entradaAberta === eq.id
                                ? 'bg-blue-500/25 border-blue-500/50 text-blue-300'
                                : 'bg-blue-500/15 border-blue-500/30 text-blue-400')}>
                            <LogIn size={12}/> Entrada
                          </button>
                        </div>
                        {entradaAberta === eq.id && (
                          <div className="mt-3 flex flex-col gap-2">
                            <input value={retornoPor} onChange={e => setRetornoPor(e.target.value)}
                              placeholder="Devolvido por…" className={inpCls} />
                            <input value={notasEntrada} onChange={e => setNotasEntrada(e.target.value)}
                              placeholder="Observações de retorno…" className={inpCls} />
                            <div className="flex gap-2">
                              <button onClick={() => submeterEntrada(eq)} disabled={a_entrando}
                                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
                                {a_entrando ? 'A registar…' : 'Confirmar Entrada'}
                              </button>
                              <button onClick={fecharEntrada} className="p-2 rounded-lg hover:bg-surface-3 text-accent-subtle">
                                <X size={14}/>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
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
                </>
              )}
            </div>

            {/* ── RESERVADO ── */}
            <div className="rounded-xl overflow-hidden border border-blue-500/25">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 border-b border-blue-500/20">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
                  Reservado — Ainda dentro
                  <span className="ml-2 font-normal text-blue-300/60">({reservado.length})</span>
                </p>
              </div>
              {reservado.length === 0 ? (
                <p className="text-center py-6 text-xs text-accent-subtle/40 italic">Nenhuma reserva em aberto.</p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-blue-500/10">
                    {reservado.map(eq => (
                      <div key={eq.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-accent text-sm">{eq.nome}</div>
                            {eq.reserva_atual?.evento && <div className="text-xs text-blue-300/80 truncate">{eq.reserva_atual.evento}</div>}
                          </div>
                          <button onClick={() => confirmarSaida(eq)} disabled={a_confirmando === eq.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors shrink-0 bg-amber-500/15 border-amber-500/40 text-amber-400 disabled:opacity-40">
                            <LogOut size={12}/> Confirmar saída
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[560px]">
                      <thead>
                        <tr className="border-b border-border bg-surface-0">
                          <th className={clsx(thCls, 'text-blue-300/60')}>Nome</th>
                          <th className={clsx(thCls, 'text-blue-300/60')}>QR</th>
                          <th className={clsx(thCls, 'text-blue-300/60')}>Evento</th>
                          <th className="px-3 py-2.5 w-40" />
                        </tr>
                      </thead>
                      <tbody>
                        {reservado.map(eq => (
                          <Fragment key={eq.id}>
                            <tr className="border-b border-border/40 hover:bg-blue-500/5 transition-colors group">
                              <td className="px-4 py-2.5 font-semibold text-accent">{eq.nome}</td>
                              <td className="px-4 py-2.5">{qrCell(eq)}</td>
                              <td className="px-4 py-2.5 text-blue-300/80 max-w-[220px] truncate" title={eq.reserva_atual?.evento}>
                                {eq.reserva_atual?.evento ?? <span className="text-accent-subtle/30">—</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => confirmarSaida(eq)} disabled={a_confirmando === eq.id}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-colors bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25 disabled:opacity-40">
                                    <LogOut size={11} />
                                    Confirmar saída
                                  </button>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {histBtn(eq, 'text-accent-muted')}
                                    <button onClick={() => abrirEditar(eq)} className="p-1 rounded hover:bg-surface-3 text-accent-muted hover:text-accent transition-colors"><Pencil size={12} /></button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                            {histRow(eq, 4)}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* ── MOVIMENTAÇÕES ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <button onClick={() => setMostrarMovs(m => !m)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface-2 transition-colors">
                <span className="text-xs font-semibold text-accent uppercase tracking-widest">Movimentações</span>
                {mostrarMovs ? <ChevronUp size={14} className="text-accent-subtle" /> : <ChevronDown size={14} className="text-accent-subtle" />}
              </button>
              {mostrarMovs && (
                movimentacoes.length === 0 ? (
                  <p className="text-center py-8 text-xs text-accent-subtle">Nenhuma movimentação registada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[820px]">
                      <thead>
                        <tr className="border-t border-b border-border bg-surface-0">
                          <th className="px-3 py-2.5 w-8" />
                          <th className="text-left px-4 py-2.5 font-medium text-accent-muted">Equipamento</th>
                          <th className="text-left px-3 py-2.5 font-medium text-accent-muted">Evento</th>
                          <th className="text-left px-3 py-2.5 font-medium text-accent-muted">Saída por</th>
                          <th className="text-left px-3 py-2.5 font-medium text-accent-muted">Devolvido por</th>
                          <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movimentacoes.map(m => {
                          const eqMov = { id: m.equipamento_id, nome: m.equipamentos?.nome }
                          return (
                            <Fragment key={m.id}>
                              <tr className="border-b border-border/50 hover:bg-surface-2 transition-colors group">
                                <td className="px-3 py-2.5 text-center">
                                  {histBtn(eqMov, 'text-accent-subtle/40')}
                                </td>
                                <td className="px-4 py-2.5 font-medium text-accent">{m.equipamentos?.nome ?? '—'}</td>
                                <td className="px-3 py-2.5 text-accent-muted max-w-[180px] truncate" title={m.supa_eventos?.evento}>
                                  {m.supa_eventos?.evento ?? <span className="text-accent-subtle/40">—</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="block text-accent-muted">{m.registado_por ?? <span className="text-accent-subtle/40">—</span>}</span>
                                  {m.saida_at && <span className="block text-[10px] tabular-nums text-accent-subtle/60 mt-0.5">{fmtData(m.saida_at)}</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="block text-accent-muted">{m.retorno_por ?? <span className="text-accent-subtle/40">—</span>}</span>
                                  {m.retorno_at && <span className="block text-[10px] tabular-nums text-accent-subtle/60 mt-0.5">{fmtData(m.retorno_at)}</span>}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {m.retorno_at
                                    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-status-confirmado/10 text-status-confirmado border-status-confirmado/20">Devolvido</span>
                                    : m.saida_at
                                    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-500/10 text-amber-300 border-amber-500/20">Em uso</span>
                                    : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-blue-500/10 text-blue-300 border-blue-500/20">Reservado</span>}
                                </td>
                              </tr>
                              {histRow(eqMov, 6)}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* ── DENTRO ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <button onClick={() => setMostrarDentro(m => !m)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface-2 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-status-confirmado shrink-0" />
                  <span className="text-xs font-semibold text-accent uppercase tracking-widest">
                    Dentro — Disponível
                    <span className="ml-2 font-normal normal-case text-accent-subtle text-[11px]">({dentro.length})</span>
                  </span>
                </div>
                {mostrarDentro ? <ChevronUp size={14} className="text-accent-subtle" /> : <ChevronDown size={14} className="text-accent-subtle" />}
              </button>
              {mostrarDentro && (
                dentro.length === 0 ? (
                  <p className="text-center py-6 text-xs text-accent-subtle/40 italic">Nenhum equipamento disponível.</p>
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-border/40">
                      {dentro.map(eq => (
                        <div key={eq.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-accent text-sm">{eq.nome}</div>
                            {eq.categoria
                              ? <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', badgeCategoria(eq.categoria))}>{eq.categoria}</span>
                              : null}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => abrirEditar(eq)} className="p-1.5 rounded hover:bg-surface-3 text-accent-muted hover:text-accent transition-colors"><Pencil size={13}/></button>
                            <button onClick={() => apagar(eq)} className="p-1.5 rounded hover:bg-surface-3 text-accent-muted hover:text-red-400 transition-colors"><Trash2 size={13}/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
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
                  </>
                )
              )}
            </div>

          </div>
        )
      })()}

      </>}

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
      {contrato && <ContratoAluguer aluguer={contrato} onClose={() => setContrato(null)} />}
    </div>
  )
}
