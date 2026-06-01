import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Plus, Pencil, Settings2, Search } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Alerta } from '@/components/ui/Alerta'
import { Badge } from '@/components/ui/Badge'
import { FormEspaco } from '@/components/espacos/FormEspaco'
import { useEspacos } from '@/hooks/useEspacos'
import { espacosApi } from '@/lib/api'
import { formatarEuro, labelTipoEspaco } from '@/utils/formatacao'
import { useMesStore } from '@/store'

export function Espacos() {
  const navigate = useNavigate()
  const { anoMes } = useMesStore()
  const { espacos, loading, erro, recarregar } = useEspacos({ todos: true })
  const [modalAberto, setModalAberto] = useState(false)
  const [espacoSeleccionado, setEspacoSeleccionado] = useState(null)
  const [atividadeMes, setAtividadeMes] = useState({})

  const [pesquisa, setPesquisa] = useState('')

  // Busca actividade (slots DJ + eventos) para o mês seleccionado
  useEffect(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    const inicio = format(startOfMonth(ref), 'yyyy-MM-dd')
    const fim    = format(endOfMonth(ref),   'yyyy-MM-dd')
    espacosApi.atividadeMes(inicio, fim).then(setAtividadeMes).catch(() => {})
  }, [anoMes])

  const abrirCriar = () => { setEspacoSeleccionado(null); setModalAberto(true) }
  const abrirEditar = (e) => { setEspacoSeleccionado(e); setModalAberto(true) }
  const fecharModal = () => { setModalAberto(false); setEspacoSeleccionado(null) }

  const espacosFiltrados = useMemo(() => {
    if (!pesquisa.trim()) return espacos
    const q = pesquisa.toLowerCase()
    return espacos.filter((e) =>
      (e.nome ?? '').toLowerCase().includes(q) ||
      (e.notas ?? '').toLowerCase().includes(q)
    )
  }, [espacos, pesquisa])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-accent">Clientes</h1>
          <p className="text-xs text-accent-muted mt-0.5">
            {pesquisa ? `${espacosFiltrados.length} de ${espacos.length}` : espacos.length} Cliente{espacos.length !== 1 ? 's' : ''} activos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-subtle pointer-events-none" />
            <input
              type="text"
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Pesquisar Cliente…"
              className="bg-surface-2 border border-border rounded pl-8 pr-3 py-1.5 text-xs text-accent placeholder:text-accent-subtle/60 focus:outline-none focus:border-white/20 transition-colors w-48"
            />
          </div>
          <Button variante="primary" tamanho="sm" onClick={abrirCriar}>
            <Plus size={14} />
            Novo Cliente
          </Button>
        </div>
      </div>

      {loading && <LoadingPage />}
      {erro && <Alerta tipo="erro" mensagem={erro} />}

      {!loading && !erro && espacos.length === 0 && (
        <EmptyState
          icone={MapPin}
          titulo="Nenhum Cliente registado"
          descricao="Adiciona o primeiro Cliente para começar."
          accao={<Button variante="primary" tamanho="sm" onClick={abrirCriar}><Plus size={14} />Novo Cliente</Button>}
        />
      )}

      {!loading && !erro && espacos.length > 0 && espacosFiltrados.length === 0 && (
        <EmptyState
          icone={Search}
          titulo="Sem resultados"
          descricao={`Nenhum Cliente encontrado para "${pesquisa}".`}
        />
      )}

      {!loading && !erro && espacosFiltrados.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {espacosFiltrados.map((e) => {
            const turnos = e.turnos_espaco ?? []
            const temCalendario = turnos.some(t => t.dias_semana?.length > 0)
            const ativ = atividadeMes[e.id] ?? { agenda: 0, eventos: 0 }
            const estaAtivo = temCalendario || ativ.agenda > 0 || ativ.eventos > 0
            return (
            <div key={e.id} className="bg-surface-1 border border-border rounded-lg px-4 py-3 flex flex-col gap-2">
              {/* Nome + tipo */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-accent truncate">{e.nome}</p>
                  <Badge variante="default" className="mt-1">{labelTipoEspaco(e.tipo)}</Badge>
                </div>
                <div className="shrink-0">
                  {estaAtivo
                    ? <Badge variante="confirmado">Ativo</Badge>
                    : <Badge variante="cancelado">Desativado</Badge>
                  }
                </div>
              </div>

              {e.notas && (
                <p className="text-[11px] text-accent-subtle truncate">{e.notas}</p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-border/50">
                {e.budget_max && (
                  <span className="text-[11px] text-accent-muted">
                    Budget: <span className="text-accent">{formatarEuro(e.budget_max)}</span>
                  </span>
                )}
                <span className="text-[11px] text-accent-muted">
                  Rep: <span className="text-accent">{e.dias_sem_repeticao}d</span>
                </span>
              </div>

              {/* Acções */}
              <div className="flex items-center gap-1 pt-1">
                <Button variante="ghost" tamanho="sm" onClick={() => abrirEditar(e)} className="flex-1 justify-center">
                  <Pencil size={12} />
                  Editar
                </Button>
                <Button variante="ghost" tamanho="sm" onClick={() => navigate(`/espacos/${e.id}`)} className="flex-1 justify-center">
                  <Settings2 size={12} />
                  Turnos & DJs
                </Button>
              </div>
            </div>
            )
          })}
        </div>
      )}

      <FormEspaco
        aberto={modalAberto}
        espaco={espacoSeleccionado}
        onFechar={fecharModal}
        onGuardado={recarregar}
      />
    </div>
  )
}
