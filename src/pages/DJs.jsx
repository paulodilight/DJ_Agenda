import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Plus, Trash2, Pencil, Search, ArrowDownUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Alerta } from '@/components/ui/Alerta'
import { Badge } from '@/components/ui/Badge'
import { FormDJ } from '@/components/djs/FormDJ'
import { useDJs } from '@/hooks/useDJs'
import { djsApi, agendaApi, categoriasDjApi, djCategoriasApi } from '@/lib/api'
import { formatarEuro, labelEstadoDJ } from '@/utils/formatacao'
import { useUndo } from '@/contexts/UndoContext'
import { clsx } from 'clsx'
import { format, addMonths, startOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'

// Gerar lista de meses: 12 atrás + 6 à frente
function gerarMeses() {
  const lista = []
  const agora = new Date()
  for (let i = -12; i <= 6; i++) {
    const d = addMonths(startOfMonth(agora), i)
    lista.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: pt }) })
  }
  return lista
}
const MESES_OPCOES = gerarMeses()

const ORDENACAO_OPCOES = [
  { value: 'nome',       label: 'Nome' },
  { value: 'valor_desc', label: 'Maior valor' },
  { value: 'datas_desc', label: 'Mais datas' },
]

export function DJs() {
  const navigate = useNavigate()
  const { djs, loading, erro, recarregar } = useDJs()
  const { pushUndo } = useUndo()
  const [modalAberto, setModalAberto]       = useState(false)
  const [djSeleccionado, setDJSeleccionado] = useState(null)
  const [apagando, setApagando]             = useState(null)
  const [counts, setCounts]                 = useState({})
  const [categorias, setCategorias]         = useState([])

  // Filtros
  const [pesquisa, setPesquisa]           = useState('')
  const [filtroEstado, setFiltroEstado]   = useState('activo')   // default: só activo
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [ordenacao, setOrdenacao]         = useState('nome')
  const [filtroMes, setFiltroMes]         = useState(format(new Date(), 'yyyy-MM'))

  // djCatsMap: { dj_id: [categoria_id, ...] }
  const [djCatsMap, setDjCatsMap] = useState({})

  useEffect(() => {
    agendaApi.contarPorDJ(filtroMes).then(setCounts).catch(() => {})
  }, [filtroMes])

  useEffect(() => {
    categoriasDjApi.listar().then(setCategorias).catch(() => {})
  }, [])

  // Carregar categorias de todos os DJs quando a lista carrega
  useEffect(() => {
    if (!djs.length) return
    Promise.all(
      djs.map(d => djCategoriasApi.listar(d.id).then(ids => ({ djId: d.id, ids })))
    ).then(resultados => {
      const map = {}
      resultados.forEach(({ djId, ids }) => { map[djId] = ids })
      setDjCatsMap(map)
    }).catch(() => {})
  }, [djs])

  const abrirCriar  = () => { setDJSeleccionado(null); setModalAberto(true) }
  const fecharModal = () => { setModalAberto(false); setDJSeleccionado(null) }

  const apagar = async (dj) => {
    if (!confirm(`Apagar "${dj.nome_artistico || dj.nome}"?`)) return
    setApagando(dj.id)
    try {
      const backup = { ...dj }
      await djsApi.apagar(dj.id)
      recarregar()
      pushUndo({
        label: `DJ "${dj.nome_artistico || dj.nome}" apagado`,
        undo: async () => {
          const { id: _id, created_at, ...payload } = backup
          await djsApi.criar(payload)
          recarregar()
        },
      })
    } catch (e) {
      alert(e.message)
    } finally {
      setApagando(null)
    }
  }

  const djsFiltrados = useMemo(() => {
    let lista = [...djs]

    // Estado
    if (filtroEstado === 'activos') {
      lista = lista.filter(d => d.estado === 'activo' || d.estado === 'activo_ext')
    } else if (filtroEstado) {
      lista = lista.filter(d => d.estado === filtroEstado)
    }

    // Categoria
    if (filtroCategoria)
      lista = lista.filter(d =>
        (djCatsMap[d.id] ?? []).map(String).includes(filtroCategoria)
      )

    // Pesquisa livre
    if (pesquisa.trim()) {
      const q = pesquisa.toLowerCase()
      lista = lista.filter(d =>
        (d.nome_artistico ?? '').toLowerCase().includes(q) ||
        (d.nome ?? '').toLowerCase().includes(q) ||
        (d.email ?? '').toLowerCase().includes(q) ||
        (d.whatsapp ?? '').toLowerCase().includes(q)
      )
    }

    // Ordenação
    if (ordenacao === 'valor_desc') {
      lista.sort((a, b) => (b.valor_sessao ?? 0) - (a.valor_sessao ?? 0))
    } else if (ordenacao === 'datas_desc') {
      lista.sort((a, b) => (counts[b.id]?.total ?? 0) - (counts[a.id]?.total ?? 0))
    } else {
      lista.sort((a, b) =>
        (a.nome_artistico || a.nome).localeCompare(b.nome_artistico || b.nome)
      )
    }

    return lista
  }, [djs, filtroEstado, filtroCategoria, pesquisa, ordenacao, counts, djCatsMap])

  const mesCorrente = format(new Date(), 'yyyy-MM')
  const temFiltroActivo = filtroEstado !== 'activo' || filtroCategoria || pesquisa || filtroMes !== mesCorrente

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-accent">DJs</h1>
          <p className="text-xs text-accent-muted mt-0.5">
            {djsFiltrados.length !== djs.length
              ? `${djsFiltrados.length} de ${djs.length}`
              : djs.length} DJ{djs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variante="primary" tamanho="sm" onClick={abrirCriar}>
          <Plus size={14} />
          Novo DJ
        </Button>
      </div>

      {/* Toolbar de filtros */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {/* Pesquisa */}
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
          <input
            type="text"
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder="Pesquisar DJ…"
            className="bg-surface-2 border border-border rounded pl-8 pr-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/60 focus:outline-none focus:border-white/20 transition-colors w-44"
          />
        </div>

        {/* Estado */}
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none focus:border-white/20"
        >
          <option value="">Todos os estados</option>
          <option value="activos">Activos (todos)</option>
          <option value="activo">Activo</option>
          <option value="activo_ext">Activo EXT</option>
          <option value="inactivo">Inactivo</option>
          <option value="banido">Banido</option>
        </select>

        {/* Categoria */}
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none focus:border-white/20"
        >
          <option value="">Todas as categorias</option>
          {categorias.map(c => (
            <option key={c.id} value={String(c.id)}>{c.nome}</option>
          ))}
        </select>

        {/* Mês */}
        <select
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none focus:border-white/20"
        >
          {MESES_OPCOES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Ordenação */}
        <div className="flex items-center gap-1 ml-auto">
          <ArrowDownUp size={11} className="text-accent-subtle" />
          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value)}
            className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none focus:border-white/20"
          >
            {ORDENACAO_OPCOES.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Limpar filtros */}
        {temFiltroActivo && (
          <button
            onClick={() => { setPesquisa(''); setFiltroEstado('activo'); setFiltroCategoria(''); setFiltroMes(mesCorrente) }}
            className="text-[11px] text-accent-subtle hover:text-accent transition-colors underline underline-offset-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {loading && <LoadingPage />}
      {erro && <Alerta tipo="erro" mensagem={erro} />}

      {!loading && !erro && djsFiltrados.length === 0 && (
        <EmptyState
          icone={djs.length === 0 ? Users : Search}
          titulo={djs.length === 0 ? 'Nenhum DJ registado' : 'Sem resultados'}
          descricao={djs.length === 0
            ? 'Começa por adicionar o primeiro DJ.'
            : 'Tenta ajustar os filtros.'
          }
          accao={djs.length === 0
            ? <Button variante="primary" tamanho="sm" onClick={abrirCriar}><Plus size={14} />Novo DJ</Button>
            : null
          }
        />
      )}

      {!loading && !erro && djsFiltrados.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-accent-muted">Nome artístico</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-accent-muted">Categoria</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-accent-muted">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-accent-muted">Dist.</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-accent-muted">Total datas</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-accent-muted">
                  Datas <span className="text-accent-subtle/60 font-normal capitalize">{format(new Date(filtroMes + '-01'), 'MMM', { locale: pt })}</span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-accent-muted">
                  Valor <span className="text-accent-subtle/60 font-normal capitalize">{format(new Date(filtroMes + '-01'), 'MMM', { locale: pt })}</span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-accent-muted">Valor/sessão</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {djsFiltrados.map((dj, i) => {
                const c = counts[dj.id] ?? { total: 0, mesCorrente: 0, mesSeguinte: 0 }
                const djCatIds = djCatsMap[dj.id] ?? []
                const djCatObjs = djCatIds.map(id => categorias.find(c => c.id === id)).filter(Boolean)
                return (
                  <tr key={dj.id} className={clsx(
                    i < djsFiltrados.length - 1 && 'border-b border-border/50',
                    'hover:bg-surface-2/30 transition-colors'
                  )}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-accent">{dj.nome_artistico || dj.nome}</p>
                      {dj.nome_artistico && <p className="text-xs text-accent-subtle">{dj.nome}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {djCatObjs.length > 0
                        ? <div className="flex flex-wrap gap-1">
                            {djCatObjs.map(c => (
                              <span key={c.id} className="text-[10px] bg-surface-3 text-accent-muted border border-border rounded px-1.5 py-0.5 whitespace-nowrap">
                                {c.nome}
                              </span>
                            ))}
                          </div>
                        : <span className="text-xs text-accent-subtle/40">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <Badge variante={
                        dj.estado === 'activo'     ? 'confirmado' :
                        dj.estado === 'activo_ext' ? 'proposta'   :
                        dj.estado === 'banido'     ? 'ban'        : 'default'
                      }>
                        {labelEstadoDJ(dj.estado)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {dj.excluido_admin
                        ? <span className="text-[10px] text-status-cancelado bg-status-cancelado/10 border border-status-cancelado/20 rounded px-1.5 py-0.5">Excluído</span>
                        : <span className="text-[11px] text-accent-subtle tabular-nums">{dj.prioridade_admin ?? 5}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-accent text-xs">
                      {c.total > 0 ? c.total : <span className="text-accent-subtle/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-xs">
                      {c.mesCorrente > 0
                        ? <span className="text-accent font-medium">{c.mesCorrente}</span>
                        : <span className="text-accent-subtle/40">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      {c.mesCorrente > 0 && dj.valor_sessao
                        ? <span className="text-status-confirmado font-medium">{formatarEuro(c.mesCorrente * dj.valor_sessao)}</span>
                        : <span className="text-accent-subtle/40">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-accent-muted text-xs">
                      {dj.valor_sessao ? formatarEuro(dj.valor_sessao) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variante="ghost" tamanho="sm" onClick={() => navigate(`/djs/${dj.id}`)} title="Editar perfil">
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variante="ghost" tamanho="sm" loading={apagando === dj.id}
                          onClick={() => apagar(dj)}
                          className="text-status-cancelado/60 hover:text-status-cancelado"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-2/20">
                <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-accent-muted">
                  Total ({djsFiltrados.length})
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-xs font-semibold text-accent">
                  {(() => { const t = djsFiltrados.reduce((s, d) => s + (counts[d.id]?.total ?? 0), 0); return t > 0 ? t : <span className="text-accent-subtle/40 font-normal">—</span> })()}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-xs font-semibold text-accent">
                  {(() => { const t = djsFiltrados.reduce((s, d) => s + (counts[d.id]?.mesCorrente ?? 0), 0); return t > 0 ? t : <span className="text-accent-subtle/40 font-normal">—</span> })()}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold text-status-confirmado">
                  {(() => {
                    const t = djsFiltrados.reduce((s, d) => s + ((counts[d.id]?.mesCorrente ?? 0) * (d.valor_sessao ?? 0)), 0)
                    return t > 0 ? formatarEuro(t) : <span className="text-accent-subtle/40 font-normal">—</span>
                  })()}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <FormDJ
        aberto={modalAberto}
        dj={djSeleccionado}
        onFechar={fecharModal}
        onGuardado={recarregar}
      />
    </div>
  )
}
