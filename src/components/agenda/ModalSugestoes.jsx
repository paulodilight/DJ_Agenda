import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { agendaApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatarEuro } from '@/utils/formatacao'
import { formatarData } from '@/utils/datas'
import { clsx } from 'clsx'
import { AlertCircle, CheckCircle2, Loader2, UserX, Sparkles } from 'lucide-react'

/**
 * Modal que analisa todos os DJs para um slot específico e sugere o melhor.
 *
 * Props:
 *  aberto       — boolean
 *  slot         — { id, data, espaco_id, turno_id, estado }
 *  espaco       — { id, nome, budget_max, tier_minimo }
 *  turno        — { id, nome } | null
 *  onFechar     — () => void
 *  onAplicado   — () => void  (chamado após atribuir DJ, para refresh)
 */
export function ModalSugestoes({ aberto, slot, espaco, turno, onFechar, onAplicado }) {
  const [loading, setLoading]           = useState(false)
  const [sugestoes, setSugestoes]       = useState([])   // [{ dj, score, destaques }]
  const [excluidos, setExcluidos]       = useState([])   // [{ dj, razoes }]
  const [conflitoDJActual, setConflitoDJActual] = useState(null) // { djNome, razoes } | null
  const [aplicando, setAplicando]       = useState(null) // dj_id em curso
  const [erro, setErro]                 = useState(null)
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false)

  useEffect(() => {
    if (!aberto || !slot) return
    analisar()
  }, [aberto, slot?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const analisar = async () => {
    setLoading(true)
    setErro(null)
    setSugestoes([])
    setExcluidos([])
    setConflitoDJActual(null)
    setMostrarExcluidos(false)
    try {
      // ── Fetch paralelo de todos os dados necessários ─────────────────────────
      const [
        djsRes, dispRes, agendaDiaRes,
        espacoPrefRes, djPrefRes,
        turnoCategRes, djCategRes,
        bloqueiosRes, priorRes,
        contagemRes,
      ] = await Promise.all([
        // DJs activos (exclui administrativamente desactivados)
        supabase.from('djs')
          .select('id, nome, nome_artistico, valor_sessao, prioridade_admin, tier_id')
          .in('estado', ['activo', 'activo_ext'])
          .neq('excluido_admin', true),

        // Disponibilidades nesta data
        supabase.from('disponibilidades')
          .select('dj_id, disponivel')
          .eq('data', slot.data),

        // Agenda deste dia (todos os Clientes) — para cross-Cliente
        supabase.from('agenda')
          .select('dj_id, espaco_id')
          .eq('data', slot.data)
          .neq('estado', 'cancelado')
          .neq('estado', 'sem_efeito')
          .neq('id', slot.id),

        // Preferências do Cliente sobre DJs
        supabase.from('espaco_dj_preferencias')
          .select('dj_id, tipo')
          .eq('espaco_id', slot.espaco_id),

        // Preferências dos DJs sobre este Cliente
        supabase.from('dj_preferencias_espaco')
          .select('dj_id, preferencia')
          .eq('espaco_id', slot.espaco_id),

        // Categorias requeridas pelo turno (se houver)
        turno?.id
          ? supabase.from('turno_categorias').select('categoria_id').eq('turno_id', turno.id)
          : Promise.resolve({ data: [] }),

        // Categorias de todos os DJs
        supabase.from('dj_categorias').select('dj_id, categoria_id'),

        // Bloqueios activos para este Cliente
        supabase.from('bloqueios')
          .select('dj_id, tipo')
          .eq('espaco_id', slot.espaco_id)
          .eq('activo', true),

        // Peso admin por DJ neste Cliente+turno
        turno?.id
          ? supabase.from('admin_dj_espaco_pref')
              .select('dj_id, peso')
              .eq('espaco_id', slot.espaco_id)
              .eq('turno_id', turno.id)
          : Promise.resolve({ data: [] }),

        // Contagem de slots do mês para cada DJ neste Cliente (espaçamento/score)
        supabase.from('agenda')
          .select('dj_id')
          .eq('espaco_id', slot.espaco_id)
          .gte('data', slot.data.slice(0, 7) + '-01')
          .lte('data', slot.data.slice(0, 7) + '-31')
          .neq('estado', 'cancelado')
          .neq('id', slot.id),
      ])

      const djs         = djsRes.data ?? []
      const dispMapa    = Object.fromEntries((dispRes.data ?? []).map(d => [d.dj_id, d.disponivel]))
      const agendaDia   = agendaDiaRes.data ?? []
      const espacoPrefs = Object.fromEntries((espacoPrefRes.data ?? []).map(p => [p.dj_id, p.tipo]))
      const djPrefs     = Object.fromEntries((djPrefRes.data ?? []).map(p => [p.dj_id, p.preferencia]))
      const turnoCats   = new Set((turnoCategRes.data ?? []).map(c => c.categoria_id))
      const djCats      = {}
      ;(djCategRes.data ?? []).forEach(c => {
        if (!djCats[c.dj_id]) djCats[c.dj_id] = new Set()
        djCats[c.dj_id].add(c.categoria_id)
      })
      const bans        = new Set((bloqueiosRes.data ?? []).filter(b => b.tipo === 'BAN').map(b => b.dj_id))
      const prioMap     = Object.fromEntries((priorRes.data ?? []).map(p => [p.dj_id, p.peso]))
      const contagem    = {}
      ;(contagemRes.data ?? []).filter(s => s.dj_id).forEach(s => {
        contagem[s.dj_id] = (contagem[s.dj_id] ?? 0) + 1
      })

      // Sets para verificação rápida
      const jaNesteEspaco = new Set(agendaDia.filter(s => s.espaco_id === slot.espaco_id && s.dj_id).map(s => s.dj_id))
      const jaNoutroEspaco = new Set(agendaDia.filter(s => s.espaco_id !== slot.espaco_id && s.dj_id).map(s => s.dj_id))

      // ── Classificar DJs ──────────────────────────────────────────────────────
      const disponiveis = []
      const excluidosList = []

      for (const dj of djs) {
        const razoes = []

        // Verificações de exclusão
        if (bans.has(dj.id))
          razoes.push('BAN neste Cliente')
        if (espacoPrefs[dj.id] === 'excluido')
          razoes.push('Excluído pelo Cliente')
        if (djPrefs[dj.id] === 'recusa')
          razoes.push('Recusa este Cliente')
        if (dispMapa[dj.id] === false)
          razoes.push('Indisponível nesta data')
        if (jaNesteEspaco.has(dj.id))
          razoes.push('Já atribuído neste Cliente neste dia')
        if (jaNoutroEspaco.has(dj.id))
          razoes.push('Já atribuído noutro Cliente neste dia')
        if (espaco?.budget_max && (dj.valor_sessao ?? 0) > espaco.budget_max)
          razoes.push(`Valor ${formatarEuro(dj.valor_sessao)} acima do budget`)
        if (turnoCats.size > 0) {
          const temCat = [...turnoCats].some(c => djCats[dj.id]?.has(c))
          if (!temCat) razoes.push('Sem categoria compatível com o turno')
        }

        if (razoes.length > 0) {
          excluidosList.push({ dj, razoes })
          continue
        }

        // Score (mesmo algoritmo da distribuição automática)
        const peso = prioMap[dj.id] ?? 10
        let score = (dj.prioridade_admin ?? 5) * 2 + peso
        if (espacoPrefs[dj.id] === 'preferido') score += 15
        if (djPrefs[dj.id]    === 'prefere')    score += 10
        score -= (contagem[dj.id] ?? 0) * 3
        score -= Math.floor((dj.valor_sessao ?? 0) / 20)

        // Destaques positivos para mostrar
        const destaques = []
        if (espacoPrefs[dj.id] === 'preferido') destaques.push('Preferido pelo Cliente')
        if (djPrefs[dj.id]    === 'prefere')    destaques.push('Prefere este Cliente')
        if (dispMapa[dj.id]   === true)          destaques.push('Disponibilidade confirmada')

        disponiveis.push({ dj, score, destaques })
      }

      disponiveis.sort((a, b) => b.score - a.score)
      setSugestoes(disponiveis)
      setExcluidos(excluidosList)

      // ── Conflito do DJ actualmente atribuído ─────────────────────────────────
      if (slot.dj_id) {
        const razoesActual = []
        if (bans.has(slot.dj_id))
          razoesActual.push('BAN neste Cliente')
        if (espacoPrefs[slot.dj_id] === 'excluido')
          razoesActual.push('Excluído pelo Cliente')
        if (djPrefs[slot.dj_id] === 'recusa')
          razoesActual.push('Recusa este Cliente')
        if (dispMapa[slot.dj_id] === false)
          razoesActual.push('Indisponível nesta data')
        if (jaNesteEspaco.has(slot.dj_id))
          razoesActual.push('Já atribuído neste Cliente neste dia')
        if (jaNoutroEspaco.has(slot.dj_id))
          razoesActual.push('Já atribuído noutro Cliente neste dia')
        if (razoesActual.length > 0)
          setConflitoDJActual({ djNome: slot.dj_nome, razoes: razoesActual })
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const aplicar = async (dj) => {
    setAplicando(dj.id)
    try {
      await agendaApi.atribuirDJ(slot.id, dj.id, dj.nome_artistico || dj.nome)
      onAplicado?.()
      onFechar()
    } catch (e) {
      setErro(e.message)
      setAplicando(null)
    }
  }

  const tituloSlot = slot
    ? `${espaco?.nome ?? '—'} · ${formatarData(slot.data)}${turno ? ` · ${turno.nome}` : ''}`
    : ''

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Sugestão de DJ" largura="max-w-md">
      <div className="flex flex-col">
        {/* Sub-título com contexto */}
        <div className="px-6 pt-1 pb-4 border-b border-border">
          <p className="text-xs text-accent-subtle">{tituloSlot}</p>
        </div>

        <div className="px-6 py-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-accent-subtle">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">A analisar disponibilidades…</span>
            </div>
          )}

          {/* Conflito do DJ actual */}
          {!loading && conflitoDJActual && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded border border-red-500/40 bg-red-500/10">
              <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-400">
                  {conflitoDJActual.djNome ?? 'DJ actual'} — conflito detectado
                </p>
                <p className="text-[10px] text-red-400/70 mt-0.5">
                  {conflitoDJActual.razoes.join(' · ')}
                </p>
              </div>
            </div>
          )}

          {/* Erro */}
          {erro && !loading && (
            <div className="flex items-center gap-2 text-red-400 text-sm py-4">
              <AlertCircle size={14} />
              {erro}
            </div>
          )}

          {/* Sem DJs disponíveis */}
          {!loading && !erro && sugestoes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-accent-subtle">
              <UserX size={24} className="opacity-40" />
              <p className="text-sm font-medium text-accent">Sem DJs disponíveis</p>
              <p className="text-xs text-center text-accent-subtle">
                Todos os DJs activos estão excluídos ou indisponíveis para esta data.
              </p>
            </div>
          )}

          {/* Lista de sugestões */}
          {!loading && sugestoes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">
                {sugestoes.length} DJ{sugestoes.length !== 1 ? 's' : ''} disponíve{sugestoes.length !== 1 ? 'is' : 'l'} — ordenados por prioridade
              </p>
              {sugestoes.map(({ dj, score, destaques }, idx) => (
                <div
                  key={dj.id}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded border transition-colors',
                    idx === 0
                      ? 'border-status-confirmado/30 bg-status-confirmado/[0.07]'
                      : 'border-border bg-surface-2 hover:bg-surface-3'
                  )}
                >
                  {/* Posição */}
                  <span className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    idx === 0 ? 'bg-status-confirmado/20 text-status-confirmado' :
                    idx === 1 ? 'bg-white/10 text-accent-muted' :
                                'bg-surface-3 text-accent-subtle'
                  )}>
                    {idx + 1}
                  </span>

                  {/* Info DJ */}
                  <div className="flex-1 min-w-0">
                    <p className={clsx(
                      'text-sm font-semibold truncate',
                      idx === 0 ? 'text-accent' : 'text-accent-muted'
                    )}>
                      {dj.nome_artistico || dj.nome}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {dj.valor_sessao != null && (
                        <span className="text-[10px] text-accent-subtle tabular-nums">
                          {formatarEuro(dj.valor_sessao)}
                        </span>
                      )}
                      {destaques.map((d, i) => (
                        <span key={i} className="text-[10px] text-status-confirmado/80 flex items-center gap-0.5">
                          <CheckCircle2 size={9} />
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Score */}
                  <span className="text-[10px] text-accent-subtle tabular-nums shrink-0">
                    {score} pts
                  </span>

                  {/* Botão Atribuir */}
                  <Button
                    variante={idx === 0 ? 'primary' : 'secondary'}
                    tamanho="sm"
                    loading={aplicando === dj.id}
                    disabled={!!aplicando}
                    onClick={() => aplicar(dj)}
                    className="shrink-0 text-xs px-2.5 py-1"
                  >
                    Atribuir
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Excluídos — collapsible */}
          {!loading && excluidos.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setMostrarExcluidos(v => !v)}
                className="text-[10px] text-accent-subtle hover:text-accent transition-colors flex items-center gap-1"
              >
                <span>{mostrarExcluidos ? '▲' : '▼'}</span>
                {excluidos.length} DJ{excluidos.length !== 1 ? 's' : ''} excluído{excluidos.length !== 1 ? 's' : ''}
              </button>

              {mostrarExcluidos && (
                <div className="mt-2 flex flex-col gap-1">
                  {excluidos.map(({ dj, razoes }) => {
                    const bloqueioAbsoluto =
                      razoes.includes('Indisponível nesta data') ||
                      razoes.includes('Já atribuído noutro Cliente neste dia')
                    return (
                      <div key={dj.id} className="flex items-center gap-2 px-3 py-2 rounded border border-border/40 bg-surface-1/50">
                        <UserX size={12} className="text-accent-subtle/50 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-accent-subtle truncate">{dj.nome_artistico || dj.nome}</p>
                          <p className="text-[10px] text-accent-subtle/60 mt-0.5">{razoes.join(' · ')}</p>
                        </div>
                        {!bloqueioAbsoluto && (
                          <Button
                            variante="secondary"
                            tamanho="sm"
                            loading={aplicando === dj.id}
                            disabled={!!aplicando}
                            onClick={() => aplicar(dj)}
                            className="shrink-0 text-xs px-2.5 py-1 opacity-60 hover:opacity-100"
                          >
                            Atribuir
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
          <button
            onClick={analisar}
            disabled={loading}
            className="text-[10px] text-accent-subtle hover:text-accent transition-colors flex items-center gap-1"
          >
            <Sparkles size={10} />
            Reanalisar
          </button>
          <Button variante="ghost" tamanho="sm" onClick={onFechar}>Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}
