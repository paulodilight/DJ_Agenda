import { useState, useEffect, useMemo } from 'react'
import { getDay } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { agendaApi } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatarEuro } from '@/utils/formatacao'
import { formatarData } from '@/utils/datas'
import { clsx } from 'clsx'
import { AlertCircle, CheckCircle2, Loader2, UserX, Sparkles, ShieldOff } from 'lucide-react'

/**
 * Modal que analisa todos os DJs para um slot específico e sugere o melhor.
 *
 * Scoring (F1–F5, acumulativo):
 *  F1  DJ prefere este espaço: +20
 *  F2  Média avaliações (0–10) × 3 → max 30; sem dados → 5×3=15
 *  F3  Peso admin × turno (0–10) + peso admin × dia semana (0–10) → max 20
 *  F4  Quantidade por turno: abaixo do ideal → +10
 *  F5  Equilíbrio: −contagem_neste_espaço×5
 *
 * Props:
 *  aberto       — boolean
 *  slot         — { id, data, espaco_id, turno_id, dj_id?, dj_nome? }
 *  espaco       — { id, nome }
 *  turno        — { id, nome } | null
 *  onFechar     — () => void
 *  onAplicado   — () => void  (chamado após atribuir DJ, para refresh)
 */
export function ModalSugestoes({ aberto, slot, espaco, turno, onFechar, onAplicado }) {
  const [loading, setLoading]         = useState(false)
  const [dadosBrutos, setDadosBrutos] = useState(null)   // cache dos dados fetchados
  const [aplicando, setAplicando]     = useState(null)   // dj_id em curso
  const [erro, setErro]               = useState(null)
  const [ignorarValidacoes, setIgnorarValidacoes] = useState(false)
  const [mostrarExcluidos, setMostrarExcluidos]   = useState(false)

  useEffect(() => {
    if (!aberto || !slot) return
    setIgnorarValidacoes(false)
    setMostrarExcluidos(false)
    analisar()
  }, [aberto, slot?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const analisar = async () => {
    setLoading(true)
    setErro(null)
    setDadosBrutos(null)
    try {
      const diaSemana = getDay(new Date(slot.data + 'T00:00:00'))
      const anoMesPrefixo = slot.data.slice(0, 7)

      const [
        djsRes, dispRes, agendaDiaRes,
        espacoPrefRes, djPrefRes,
        turnoCategRes, djCategRes,
        bloqueiosRes,
        adminTurnoRes, adminDiaSemRes,
        turnoQtdRes,
        contagemEspacoRes, contagemTurnoRes,
        avaliacoesRes,
      ] = await Promise.all([
        supabase.from('djs')
          .select('id, nome, nome_artistico, valor_sessao, prioridade_admin, excluido_admin')
          .in('estado', ['activo', 'activo_ext']),

        supabase.from('disponibilidades')
          .select('dj_id, disponivel')
          .eq('data', slot.data),

        supabase.from('agenda')
          .select('dj_id, espaco_id')
          .eq('data', slot.data)
          .not('dj_id', 'is', null)
          .neq('estado', 'cancelado')
          .neq('estado', 'sem_efeito')
          .neq('id', slot.id),

        supabase.from('espaco_dj_preferencias')
          .select('dj_id, tipo').eq('espaco_id', slot.espaco_id),

        supabase.from('dj_preferencias_espaco')
          .select('dj_id, preferencia').eq('espaco_id', slot.espaco_id),

        turno?.id
          ? supabase.from('turno_categorias').select('categoria_id').eq('turno_id', turno.id)
          : Promise.resolve({ data: [] }),

        supabase.from('dj_categorias').select('dj_id, categoria_id'),

        supabase.from('bloqueios')
          .select('dj_id, tipo').eq('espaco_id', slot.espaco_id).eq('activo', true),

        // F3a: Admin × turno
        turno?.id
          ? supabase.from('admin_dj_turno_pref')
              .select('dj_id, peso')
              .eq('espaco_id', slot.espaco_id)
              .eq('turno_id', turno.id)
          : Promise.resolve({ data: [] }),

        // F3b: Admin × dia semana
        supabase.from('admin_dj_dia_semana_pref')
          .select('dj_id, peso')
          .eq('espaco_id', slot.espaco_id)
          .eq('dia_semana', diaSemana),

        // F4: Quantidade por turno × DJ
        turno?.id
          ? supabase.from('admin_turno_quantidade_pref')
              .select('dj_id, quantidade_ideal')
              .eq('espaco_id', slot.espaco_id)
              .eq('turno_id', turno.id)
          : Promise.resolve({ data: [] }),

        // F5: Contagem neste espaço este mês
        supabase.from('agenda')
          .select('dj_id')
          .eq('espaco_id', slot.espaco_id)
          .gte('data', anoMesPrefixo + '-01')
          .lte('data', anoMesPrefixo + '-31')
          .not('dj_id', 'is', null)
          .neq('estado', 'cancelado')
          .neq('id', slot.id),

        // F4: Contagem neste turno este mês
        turno?.id
          ? supabase.from('agenda')
              .select('dj_id')
              .eq('espaco_id', slot.espaco_id)
              .eq('turno_id', turno.id)
              .gte('data', anoMesPrefixo + '-01')
              .lte('data', anoMesPrefixo + '-31')
              .not('dj_id', 'is', null)
              .neq('estado', 'cancelado')
              .neq('id', slot.id)
          : Promise.resolve({ data: [] }),

        // F2: Avaliações por DJ neste espaço (via join agenda)
        supabase.from('avaliacoes_djs')
          .select('nota, agenda!inner(dj_id)')
          .eq('espaco_id', slot.espaco_id)
          .not('nota', 'is', null),
      ])

      const djs        = (djsRes.data ?? []).filter(d => !d.excluido_admin)
      const dispMapa   = Object.fromEntries((dispRes.data ?? []).map(d => [d.dj_id, d.disponivel]))
      const agendaDia  = agendaDiaRes.data ?? []
      const espPrefs   = Object.fromEntries((espacoPrefRes.data ?? []).map(p => [p.dj_id, p.tipo]))
      const djPrefs    = Object.fromEntries((djPrefRes.data ?? []).map(p => [p.dj_id, p.preferencia]))
      const turnoCats  = new Set((turnoCategRes.data ?? []).map(c => c.categoria_id))
      const djCats     = {}
      ;(djCategRes.data ?? []).forEach(c => {
        if (!djCats[c.dj_id]) djCats[c.dj_id] = new Set()
        djCats[c.dj_id].add(c.categoria_id)
      })
      const bans       = new Set((bloqueiosRes.data ?? []).filter(b => b.tipo === 'BAN').map(b => b.dj_id))
      const adminTurno = Object.fromEntries((adminTurnoRes.data ?? []).map(p => [p.dj_id, p.peso]))
      const adminDia   = Object.fromEntries((adminDiaSemRes.data ?? []).map(p => [p.dj_id, p.peso]))
      const turnoQtd   = Object.fromEntries((turnoQtdRes.data ?? []).map(p => [p.dj_id, p.quantidade_ideal]))

      const contagemEspaco = {}
      ;(contagemEspacoRes.data ?? []).forEach(s => {
        if (s.dj_id) contagemEspaco[s.dj_id] = (contagemEspaco[s.dj_id] ?? 0) + 1
      })
      const contagemTurno = {}
      ;(contagemTurnoRes.data ?? []).forEach(s => {
        if (s.dj_id) contagemTurno[s.dj_id] = (contagemTurno[s.dj_id] ?? 0) + 1
      })

      // F2: Média avaliações por DJ
      const avalSum   = {}
      const avalCount = {}
      ;(avaliacoesRes.data ?? []).forEach(({ nota, agenda }) => {
        const djId = agenda?.dj_id
        if (!djId || nota == null) return
        avalSum[djId]   = (avalSum[djId]   ?? 0) + nota
        avalCount[djId] = (avalCount[djId] ?? 0) + 1
      })
      const avalAvg = {}
      for (const [djId, total] of Object.entries(avalSum)) {
        avalAvg[djId] = total / avalCount[djId]
      }

      const jaNesteEspaco  = new Set(agendaDia.filter(s => s.espaco_id === slot.espaco_id && s.dj_id).map(s => s.dj_id))
      const jaNoutroEspaco = new Set(agendaDia.filter(s => s.espaco_id !== slot.espaco_id && s.dj_id).map(s => s.dj_id))

      setDadosBrutos({
        djs, dispMapa, espPrefs, djPrefs, turnoCats, djCats,
        bans, adminTurno, adminDia, turnoQtd,
        contagemEspaco, contagemTurno, avalAvg,
        jaNesteEspaco, jaNoutroEspaco,
      })
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Classificação derivada dos dados brutos ─────────────────────────────
  const { sugestoes, excluidos, conflitoDJActual } = useMemo(() => {
    if (!dadosBrutos) return { sugestoes: [], excluidos: [], conflitoDJActual: null }

    const {
      djs, dispMapa, espPrefs, djPrefs, turnoCats, djCats,
      bans, adminTurno, adminDia, turnoQtd,
      contagemEspaco, contagemTurno, avalAvg,
      jaNesteEspaco, jaNoutroEspaco,
    } = dadosBrutos

    const classifDJ = (dj) => {
      const violacoes = []

      if (bans.has(dj.id))               violacoes.push('BAN neste Cliente')
      if (espPrefs[dj.id] === 'excluido') violacoes.push('Excluído pelo Cliente')
      if (djPrefs[dj.id]  === 'recusa')   violacoes.push('Recusa este Cliente')
      if (dispMapa[dj.id] === false)      violacoes.push('Indisponível nesta data')
      if (jaNesteEspaco.has(dj.id))       violacoes.push('Já atribuído neste Cliente hoje')
      if (jaNoutroEspaco.has(dj.id))      violacoes.push('Conflito físico: já noutro Cliente hoje')
      if (turnoCats.size > 0) {
        const temCat = [...turnoCats].some(c => djCats[dj.id]?.has(c))
        if (!temCat) violacoes.push('Sem categoria compatível com o turno')
      }

      // Scoring F1–F5
      const f1 = djPrefs[dj.id] === 'prefere' ? 20 : 0
      const f2 = (avalAvg[dj.id] ?? 5) * 3
      const f3 = (adminTurno[dj.id] ?? 0) + (adminDia[dj.id] ?? 0)
      const qtdIdeal = turnoQtd[dj.id] ?? 0
      const f4 = qtdIdeal > 0 && (contagemTurno[dj.id] ?? 0) < qtdIdeal ? 10 : 0
      const f5 = -(contagemEspaco[dj.id] ?? 0) * 5
      const score = f1 + f2 + f3 + f4 + f5

      const destaques = []
      if (espPrefs[dj.id] === 'preferido') destaques.push('Preferido pelo Cliente')
      if (djPrefs[dj.id]  === 'prefere')   destaques.push('Prefere este Cliente')
      if (dispMapa[dj.id] === true)         destaques.push('Disponibilidade confirmada')
      if (f3 > 0)                           destaques.push(`Admin +${f3} pts`)

      return { dj, score, destaques, violacoes }
    }

    const todas = djs.map(classifDJ)
    todas.sort((a, b) => b.score - a.score)

    const sugestoes = todas.filter(e => e.violacoes.length === 0 || ignorarValidacoes)
    const excluidos  = ignorarValidacoes ? [] : todas.filter(e => e.violacoes.length > 0)

    // Conflito do DJ actualmente atribuído
    let conflitoDJActual = null
    if (slot?.dj_id) {
      const entDJ = todas.find(e => e.dj.id === slot.dj_id)
      if (entDJ?.violacoes.length > 0) {
        conflitoDJActual = { djNome: slot.dj_nome ?? entDJ.dj.nome_artistico, razoes: entDJ.violacoes }
      }
    }

    return { sugestoes, excluidos, conflitoDJActual }
  }, [dadosBrutos, ignorarValidacoes, slot?.dj_id, slot?.dj_nome])

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

          {/* Aviso modo override */}
          {!loading && ignorarValidacoes && (
            <div className="flex items-center gap-2 px-3 py-2 rounded border border-amber-500/40 bg-amber-500/10">
              <ShieldOff size={12} className="text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-400">
                Validações ignoradas — todos os DJs visíveis independentemente de restrições
              </p>
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
          {!loading && !erro && dadosBrutos && sugestoes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-accent-subtle">
              <UserX size={24} className="opacity-40" />
              <p className="text-sm font-medium text-accent">Sem DJs disponíveis</p>
              <p className="text-xs text-center text-accent-subtle">
                Todos os DJs activos estão excluídos ou indisponíveis para esta data.
              </p>
              {!ignorarValidacoes && (
                <button
                  onClick={() => setIgnorarValidacoes(true)}
                  className="mt-1 text-xs text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
                >
                  <ShieldOff size={11} /> Ignorar validações
                </button>
              )}
            </div>
          )}

          {/* Lista de sugestões */}
          {!loading && sugestoes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">
                {sugestoes.length} DJ{sugestoes.length !== 1 ? 's' : ''} — ordenados por prioridade
              </p>
              {sugestoes.map(({ dj, score, destaques, violacoes }, idx) => (
                <div
                  key={dj.id}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded border transition-colors',
                    violacoes.length > 0
                      ? 'border-amber-500/30 bg-amber-500/[0.06]'
                      : idx === 0
                        ? 'border-status-confirmado/30 bg-status-confirmado/[0.07]'
                        : 'border-border bg-surface-2 hover:bg-surface-3'
                  )}
                >
                  {/* Posição */}
                  <span className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                    violacoes.length > 0  ? 'bg-amber-500/20 text-amber-400' :
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
                      violacoes.length > 0 ? 'text-amber-400' :
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
                      {violacoes.map((v, i) => (
                        <span key={i} className="text-[10px] text-amber-400/80 flex items-center gap-0.5">
                          <AlertCircle size={8} />{v}
                        </span>
                      ))}
                      {violacoes.length === 0 && destaques.map((d, i) => (
                        <span key={i} className="text-[10px] text-status-confirmado/80 flex items-center gap-0.5">
                          <CheckCircle2 size={9} />{d}
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
                    variante={violacoes.length > 0 ? 'secondary' : idx === 0 ? 'primary' : 'secondary'}
                    tamanho="sm"
                    loading={aplicando === dj.id}
                    disabled={!!aplicando}
                    onClick={() => aplicar(dj)}
                    className={clsx('shrink-0 text-xs px-2.5 py-1', violacoes.length > 0 && 'opacity-70 hover:opacity-100')}
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
                      razoes.includes('Conflito físico: já noutro Cliente hoje')
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
        <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={analisar}
              disabled={loading}
              className="text-[10px] text-accent-subtle hover:text-accent transition-colors flex items-center gap-1 disabled:opacity-40"
            >
              <Sparkles size={10} />
              Reanalisar
            </button>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ignorarValidacoes}
                onChange={(e) => setIgnorarValidacoes(e.target.checked)}
                className="accent-amber-400 w-3 h-3"
              />
              <span className="text-[10px] text-accent-subtle">
                Ignorar validações <span className="text-accent-subtle/50">(registo manual)</span>
              </span>
            </label>
          </div>
          <Button variante="ghost" tamanho="sm" onClick={onFechar}>Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}
