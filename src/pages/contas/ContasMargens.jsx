import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useMesStore } from '@/store'
import { useEspacos } from '@/hooks/useEspacos'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

const parseNum = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n }
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

export function ContasMargens() {
  const { anoMes } = useMesStore()
  const { espacos, loading: loadingEspacos } = useEspacos()
  const [slots, setSlots]     = useState([])
  const [loading, setLoading] = useState(true)

  const { dataInicio, dataFim, titulo } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
      titulo:     cap(format(ref, 'MMMM yyyy', { locale: pt })),
    }
  }, [anoMes])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('agenda')
      .select('id, dj_id, espaco_id, valor, margem, tipo_slot, dj_nome, data, djs(nome, nome_artistico)')
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .not('estado', 'in', '("cancelado","faltou","sem_efeito")')
      .then(({ data, error }) => {
        if (cancelled || error) return
        setSlots(data ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataInicio, dataFim])

  // ── Por espaço ────────────────────────────────────────────────────────────
  const porEspaco = useMemo(() => {
    return espacos.map(esp => {
      const sl = slots.filter(s => s.espaco_id === esp.id)

      const residentes  = sl.filter(s => s.tipo_slot !== 'convidado')
      const convidados  = sl.filter(s => s.tipo_slot === 'convidado')

      // Receita = o que o cliente paga (valor total)
      const receitaRes  = residentes.reduce((a, s) => a + parseNum(s.valor), 0)
      const receitaConv = convidados.reduce((a, s) => a + parseNum(s.valor), 0)
      const receita     = receitaRes + receitaConv

      // Custo = valor - margem (o que o DJ realmente recebe)
      const custoRes    = residentes.reduce((a, s) => a + parseNum(s.valor), 0) // residentes: sem margem definida ainda
      const custoConv   = convidados.reduce((a, s) => a + (parseNum(s.valor) - parseNum(s.margem)), 0)
      const custo       = custoRes + custoConv

      // Margem = receita - custo
      const margem      = receita - custo  // = soma das margens dos convidados
      const margemConv  = convidados.reduce((a, s) => a + parseNum(s.margem), 0)

      const pct = receita > 0 ? ((margemConv / receita) * 100).toFixed(1) : null

      return {
        espaco:        esp,
        totalSlots:    sl.length,
        residentes:    residentes.length,
        convidados:    convidados.length,
        receita,
        custo,
        margemConv,
        pct,
        detalheConv:   convidados.map(s => ({
          id:    s.id,
          nome:  s.dj_nome || s.djs?.nome_artistico || s.djs?.nome || 'DJ Convidado',
          data:  s.data,
          valor: parseNum(s.valor),
          margem: parseNum(s.margem),
        })),
      }
    }).filter(r => r.totalSlots > 0)
  }, [espacos, slots])

  const totais = useMemo(() => porEspaco.reduce((a, r) => ({
    receita:    a.receita    + r.receita,
    custo:      a.custo      + r.custo,
    margemConv: a.margemConv + r.margemConv,
  }), { receita: 0, custo: 0, margemConv: 0 }), [porEspaco])

  const [expandido, setExpandido] = useState(null)

  if (loading || loadingEspacos) return <LoadingPage />

  return (
    <div className="p-6 flex flex-col gap-5">

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-4">
          <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest mb-1">Receita Total DJs</p>
          <p className="text-2xl font-bold tabular-nums text-status-confirmado">{formatarEuro(totais.receita)}</p>
          <p className="text-xs text-accent-muted mt-0.5">faturado aos clientes pelos DJs</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-4">
          <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest mb-1">Custo DJs Convidados</p>
          <p className="text-2xl font-bold tabular-nums text-blue-400">{formatarEuro(totais.custo)}</p>
          <p className="text-xs text-accent-muted mt-0.5">pago aos DJs (valor − margem)</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-4">
          <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest mb-1">Margem DJ Convidado</p>
          <p className={clsx('text-2xl font-bold tabular-nums', totais.margemConv >= 0 ? 'text-status-confirmado' : 'text-status-cancelado')}>
            {formatarEuro(totais.margemConv)}
          </p>
          <p className="text-xs text-accent-muted mt-0.5">
            {totais.receita > 0 ? `${((totais.margemConv / totais.receita) * 100).toFixed(1)}% da receita` : '—'}
          </p>
        </div>
      </div>

      {/* Tabela por espaço */}
      <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="text-left px-4 py-3 font-medium text-accent-muted">Espaço</th>
              <th className="text-center px-3 py-3 font-medium text-accent-muted">Residentes</th>
              <th className="text-center px-3 py-3 font-medium text-accent-muted">Convidados</th>
              <th className="text-right px-3 py-3 font-medium text-accent-muted">Receita</th>
              <th className="text-right px-3 py-3 font-medium text-accent-muted">Custo DJs</th>
              <th className="text-right px-3 py-3 font-medium text-accent-muted">Margem Conv.</th>
              <th className="text-right px-4 py-3 font-medium text-accent-muted">%</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {porEspaco.map((r, i) => (
              <>
                <tr
                  key={r.espaco.id}
                  onClick={() => r.detalheConv.length > 0 && setExpandido(expandido === r.espaco.id ? null : r.espaco.id)}
                  className={clsx(
                    'border-b border-border/30 last:border-0 transition-colors',
                    r.detalheConv.length > 0 ? 'cursor-pointer' : '',
                    i % 2 !== 0 ? 'bg-surface-0/40' : '',
                    expandido === r.espaco.id ? 'bg-status-confirmado/5' : r.detalheConv.length > 0 ? 'hover:bg-surface-2/60' : ''
                  )}
                >
                  <td className="px-4 py-3 font-semibold text-accent text-sm">{r.espaco.nome}</td>
                  <td className="px-3 py-3 text-center text-accent-muted">{r.residentes}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={r.convidados > 0 ? 'text-blue-400 font-semibold' : 'text-border/50'}>
                      {r.convidados || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-accent">
                    {formatarEuro(r.receita)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-accent-muted">
                    {r.custo > 0 ? formatarEuro(r.custo) : <span className="text-border/50">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">
                    <span className={r.margemConv > 0 ? 'text-status-confirmado' : 'text-border/50'}>
                      {r.margemConv > 0 ? formatarEuro(r.margemConv) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.pct !== null
                      ? <span className={clsx('font-semibold', Number(r.pct) > 0 ? 'text-status-confirmado' : 'text-accent-subtle')}>{r.pct}%</span>
                      : <span className="text-border/50">—</span>}
                  </td>
                  <td className="px-2 py-3 text-accent-subtle text-center">
                    {r.detalheConv.length > 0 && (expandido === r.espaco.id ? '▲' : '▼')}
                  </td>
                </tr>

                {/* Detalhe convidados */}
                {expandido === r.espaco.id && (
                  <tr key={r.espaco.id + '-det'} className="bg-surface-0/60">
                    <td colSpan={8} className="px-8 py-3">
                      <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-widest mb-2">DJs Convidados</p>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-accent-subtle border-b border-border/40">
                            <th className="text-left pb-1.5 font-medium">DJ</th>
                            <th className="text-left pb-1.5 font-medium">Data</th>
                            <th className="text-right pb-1.5 font-medium">Valor Cliente</th>
                            <th className="text-right pb-1.5 font-medium">Margem</th>
                            <th className="text-right pb-1.5 font-medium">DJ recebe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.detalheConv.map((c, ci) => (
                            <tr key={ci} className="border-b border-border/20 last:border-0">
                              <td className="py-1.5 font-medium text-accent">{c.nome}</td>
                              <td className="py-1.5 text-accent-muted">
                                {c.data ? format(new Date(c.data + 'T00:00:00'), "EEE d MMM", { locale: pt }) : '—'}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-accent">{formatarEuro(c.valor)}</td>
                              <td className="py-1.5 text-right tabular-nums text-status-confirmado font-semibold">
                                {c.margem > 0 ? formatarEuro(c.margem) : <span className="text-border/40">—</span>}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-accent-muted">
                                {formatarEuro(c.valor - c.margem)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2">
              <td className="px-4 py-3 font-bold text-accent uppercase tracking-wider text-xs">Total</td>
              <td colSpan={2} />
              <td className="px-3 py-3 text-right font-bold text-accent tabular-nums">{formatarEuro(totais.receita)}</td>
              <td className="px-3 py-3 text-right font-bold text-accent-muted tabular-nums">{formatarEuro(totais.custo)}</td>
              <td className="px-3 py-3 text-right font-bold text-status-confirmado tabular-nums">{formatarEuro(totais.margemConv)}</td>
              <td className="px-4 py-3 text-right font-bold text-status-confirmado tabular-nums">
                {totais.receita > 0 ? `${((totais.margemConv / totais.receita) * 100).toFixed(1)}%` : '—'}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
