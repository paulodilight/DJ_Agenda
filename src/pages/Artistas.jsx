import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music2, Plus, Trash2, Pencil, Search, Instagram, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Alerta } from '@/components/ui/Alerta'
import { Badge } from '@/components/ui/Badge'
import { artistasApi } from '@/lib/api'
import { useUndo } from '@/contexts/UndoContext'
import { clsx } from 'clsx'

export function Artistas() {
  const navigate = useNavigate()
  const { pushUndo } = useUndo()

  const [artistas, setArtistas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState(null)
  const [apagando, setApagando] = useState(null)

  const [pesquisa, setPesquisa]         = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')

  const carregar = () => {
    setLoading(true)
    setErro(null)
    artistasApi.listar()
      .then(setArtistas)
      .catch(e => setErro(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  const apagar = async (artista) => {
    if (!confirm(`Apagar "${artista.nome}"?`)) return
    setApagando(artista.id)
    try {
      const backup = { ...artista }
      await artistasApi.apagar(artista.id)
      carregar()
      pushUndo({
        label: `Artista "${artista.nome}" apagado`,
        undo: async () => { await artistasApi.criar(backup); carregar() },
      })
    } catch (e) {
      alert(e.message)
    } finally {
      setApagando(null)
    }
  }

  const listaFiltrada = useMemo(() => {
    let lista = [...artistas]
    if (filtroEstado) lista = lista.filter(a => a.estado === filtroEstado)
    if (pesquisa.trim()) {
      const q = pesquisa.toLowerCase()
      lista = lista.filter(a =>
        (a.nome ?? '').toLowerCase().includes(q) ||
        (a.bio  ?? '').toLowerCase().includes(q)
      )
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome))
  }, [artistas, filtroEstado, pesquisa])

  const temFiltro = filtroEstado !== 'activo' || pesquisa

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-semibold text-accent">Artistas</h1>
          <p className="text-xs text-accent-muted mt-0.5">
            {listaFiltrada.length !== artistas.length
              ? `${listaFiltrada.length} de ${artistas.length}`
              : artistas.length} artista{artistas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variante="primary" tamanho="sm" onClick={() => navigate('/artistas/novo')}>
          <Plus size={14} />Novo Artista
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
          <input
            type="text"
            value={pesquisa}
            onChange={e => setPesquisa(e.target.value)}
            placeholder="Pesquisar artista…"
            className="bg-surface-2 border border-border rounded pl-8 pr-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/60 focus:outline-none focus:border-white/20 transition-colors w-44"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none focus:border-white/20"
        >
          <option value="">Todos</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
        {temFiltro && (
          <button
            onClick={() => { setPesquisa(''); setFiltroEstado('activo') }}
            className="text-[11px] text-accent-subtle hover:text-accent transition-colors underline underline-offset-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {loading && <LoadingPage />}
      {erro    && <Alerta tipo="erro" mensagem={erro} />}

      {!loading && !erro && listaFiltrada.length === 0 && (
        <EmptyState
          icone={artistas.length === 0 ? Music2 : Search}
          titulo={artistas.length === 0 ? 'Nenhum artista registado' : 'Sem resultados'}
          descricao={artistas.length === 0
            ? 'Cria o primeiro artista para associar a eventos Xclusive.'
            : 'Tenta ajustar os filtros.'}
          accao={artistas.length === 0
            ? <Button variante="primary" tamanho="sm" onClick={() => navigate('/artistas/novo')}><Plus size={14} />Novo Artista</Button>
            : null}
        />
      )}

      {!loading && !erro && listaFiltrada.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-accent-muted">Artista</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-accent-muted">Bio</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-accent-muted">Redes</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-accent-muted">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((artista, i) => (
                <tr key={artista.id} className={clsx(
                  i < listaFiltrada.length - 1 && 'border-b border-border/50',
                  'hover:bg-surface-2/30 transition-colors'
                )}>
                  {/* Nome + foto */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {artista.foto_url ? (
                        <img src={artista.foto_url} alt={artista.nome}
                          className="w-8 h-8 rounded-md object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-violet-400/60">
                            {artista.nome.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="font-medium text-accent">{artista.nome}</span>
                    </div>
                  </td>
                  {/* Bio */}
                  <td className="px-4 py-3 text-xs text-accent-subtle max-w-[240px] truncate">
                    {artista.bio || <span className="text-accent-subtle/30">—</span>}
                  </td>
                  {/* Redes */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {artista.instagram_url && (
                        <a href={artista.instagram_url} target="_blank" rel="noopener noreferrer"
                           className="text-pink-400/70 hover:text-pink-400 transition-colors" title="Instagram">
                          <Instagram size={13} />
                        </a>
                      )}
                      {artista.rede_social_url && (
                        <a href={artista.rede_social_url} target="_blank" rel="noopener noreferrer"
                           className="text-blue-400/70 hover:text-blue-400 transition-colors" title="Rede Social">
                          <ExternalLink size={13} />
                        </a>
                      )}
                      {artista.presskit_url && (
                        <a href={artista.presskit_url} target="_blank" rel="noopener noreferrer"
                           className="text-accent-subtle/50 hover:text-accent transition-colors" title="Presskit">
                          <ExternalLink size={13} />
                        </a>
                      )}
                      {!artista.instagram_url && !artista.rede_social_url && !artista.presskit_url && (
                        <span className="text-accent-subtle/30 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  {/* Estado */}
                  <td className="px-4 py-3">
                    <Badge variante={artista.estado === 'activo' ? 'confirmado' : 'default'}>
                      {artista.estado === 'activo' ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  {/* Acções */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variante="ghost" tamanho="sm" onClick={() => navigate(`/artistas/${artista.id}`)} title="Editar perfil">
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variante="ghost" tamanho="sm" loading={apagando === artista.id}
                        onClick={() => apagar(artista)}
                        className="text-status-cancelado/60 hover:text-status-cancelado"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
