import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Star, ExternalLink, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'

// Categorias de convidados (INT excluído — é tratado como residente interno)
const CAT_IDS = [4, 5] // DJ Convidado EXT, Premium
const CAT_NOMES = { 4: 'Convidado EXT', 5: 'Premium' }

function EstrelasInteresse({ valor }) {
  if (!valor) return <span className="text-xs text-accent-subtle">—</span>
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map((n) => (
        <Star key={n} size={11} className={n <= valor ? 'text-yellow-400' : 'text-accent-subtle'}
          fill={n <= valor ? 'currentColor' : 'none'} strokeWidth={1.5} />
      ))}
      <span className="ml-1 text-[10px] text-accent-subtle">{valor}/5</span>
    </span>
  )
}

export function DJConvidados() {
  const navigate = useNavigate()
  const [djs, setDjs] = useState([])
  const [loading, setLoading] = useState(true)
  const [pesquisa, setPesquisa] = useState('')
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [mostrarFormNovo, setMostrarFormNovo] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      // DJs com categorias convidado/premium + interesse médio dos gestores
      const { data: cats } = await supabase
        .from('dj_categorias')
        .select('dj_id, categoria_id')
        .in('categoria_id', CAT_IDS)

      if (!cats?.length) { setDjs([]); return }
      const djIds = [...new Set(cats.map((c) => c.dj_id))]

      const { data: djsData } = await supabase
        .from('djs')
        .select('id, nome, nome_artistico, foto_url, estado, instagram_url')
        .in('id', djIds)
        .neq('estado', 'banido')
        .order('nome_artistico', { nullsFirst: false })
        .order('nome')

      // Interesse médio dos gestores (espaco_dj_preferencias)
      const { data: prefs } = await supabase
        .from('espaco_dj_preferencias')
        .select('dj_id, interesse')
        .in('dj_id', djIds)
        .not('interesse', 'is', null)

      const interesseMap = {}
      const cntMap = {}
      ;(prefs ?? []).forEach(({ dj_id, interesse }) => {
        interesseMap[dj_id] = (interesseMap[dj_id] ?? 0) + interesse
        cntMap[dj_id] = (cntMap[dj_id] ?? 0) + 1
      })

      // Contagem de actuações
      const { data: atuacoes } = await supabase
        .from('agenda')
        .select('dj_id')
        .in('dj_id', djIds)
        .neq('estado', 'cancelado')

      const atuacoesMap = {}
      ;(atuacoes ?? []).forEach(({ dj_id }) => { atuacoesMap[dj_id] = (atuacoesMap[dj_id] ?? 0) + 1 })

      const catMap = {}
      cats.forEach(({ dj_id, categoria_id }) => { catMap[dj_id] = categoria_id })

      const lista = (djsData ?? []).map((d) => ({
        ...d,
        categoria_id: catMap[d.id],
        interesseMedio: cntMap[d.id] ? Math.round((interesseMap[d.id] / cntMap[d.id]) * 10) / 10 : null,
        totalAtuacoes: atuacoesMap[d.id] ?? 0,
      })).sort((a, b) => (b.interesseMedio ?? 0) - (a.interesseMedio ?? 0))

      setDjs(lista)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function criarNovoDJ() {
    if (!novoNome.trim() || criando) return
    setCriando(true)
    try {
      const { data, error } = await supabase
        .from('djs')
        .insert({
          nome: novoNome.trim(),
          estado: 'activo',
          qualidade_artistica: 0, assiduidade: 0, profissionalismo: 0, adaptacao_espaco: 0,
          prioridade_admin: 0, excluido_admin: false,
        })
        .select()
        .single()
      if (error) throw error
      await supabase.from('dj_categorias').insert({ dj_id: data.id, categoria_id: 4 }) // EXT
      setNovoNome('')
      setMostrarFormNovo(false)
      navigate(`/djs/${data.id}`)
    } catch (e) {
      alert('Erro: ' + e.message)
    } finally {
      setCriando(false)
    }
  }

  const djsFiltrados = djs.filter((d) => {
    const q = pesquisa.toLowerCase()
    return !q || (d.nome_artistico || d.nome || '').toLowerCase().includes(q)
  })

  if (loading) return <LoadingPage />

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-accent">DJ Convidados</h1>
          <p className="text-xs text-accent-muted mt-0.5">
            DJs Convidado EXT · Premium — {djs.length} no total
          </p>
        </div>
        <Button variante="primario" tamanho="sm" onClick={() => setMostrarFormNovo(true)}>
          <Plus size={14} /> Novo DJ Convidado
        </Button>
      </div>

      {/* Form novo DJ */}
      {mostrarFormNovo && (
        <Card>
          <CardBody>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-accent-muted uppercase tracking-wider">Nome do DJ</label>
                <input
                  autoFocus
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && criarNovoDJ()}
                  placeholder="Nome artístico..."
                  className="mt-1 w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-accent focus:outline-none focus:border-white/20"
                />
              </div>
              <Button variante="primario" tamanho="sm" onClick={criarNovoDJ} loading={criando}>
                Criar e editar perfil
              </Button>
              <Button variante="secundario" tamanho="sm" onClick={() => { setMostrarFormNovo(false); setNovoNome('') }}>
                Cancelar
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-accent-subtle">
              O DJ será criado com categoria <strong>Convidado EXT</strong> e abrirá o perfil para completar.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Pesquisa */}
      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-subtle" />
        <input
          type="text"
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          placeholder="Pesquisar…"
          className="w-full rounded border border-border bg-surface-2 pl-8 pr-3 py-2 text-sm text-accent placeholder:text-accent-subtle focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Lista */}
      {djsFiltrados.length === 0 ? (
        <EmptyState mensagem="Sem DJs convidados." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">DJ</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Categoria</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Actuações</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Interesse médio</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {djsFiltrados.map((dj) => (
                  <tr key={dj.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {dj.foto_url
                          ? <img src={dj.foto_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                          : <div className="h-7 w-7 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold text-accent-subtle shrink-0">
                              {(dj.nome_artistico || dj.nome || '?').slice(0, 2).toUpperCase()}
                            </div>
                        }
                        <span className="font-medium text-accent">{dj.nome_artistico || dj.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-accent-muted">{CAT_NOMES[dj.categoria_id] ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-accent-muted text-xs">
                      {dj.totalAtuacoes}
                    </td>
                    <td className="px-4 py-3">
                      <EstrelasInteresse valor={dj.interesseMedio} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/djs/${dj.id}`)}
                        className="flex items-center gap-1 text-xs text-accent-subtle hover:text-accent transition-colors ml-auto"
                      >
                        Perfil <ExternalLink size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
