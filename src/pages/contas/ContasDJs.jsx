import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useMesStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const PAGAVEIS   = new Set(['confirmado', 'presente', 'a_pedido'])
const CANCELADOS = new Set(['cancelado', 'faltou', 'sem_efeito'])

const LABEL_ESTADO = {
  confirmado: 'Confirmado', presente: 'Presente', a_pedido: 'A pedido',
  proposta: 'Proposta', cancelado: 'Cancelado', faltou: 'Faltou', sem_efeito: 'Sem efeito',
}

export function ContasDJs() {
  const { anoMes } = useMesStore()
  const [slots, setSlots]   = useState([])
  const [loading, setLoading] = useState(true)
  const [expand, setExpand]   = useState(null) // dj_id expandido

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
      .select('id, dj_id, espaco_id, data, hora_inicio, hora_fim, valor, estado, djs(nome, nome_artistico), espacos(nome)')
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data')
      .then(({ data, error }) => {
        if (cancelled || error) return
        setSlots(data ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataInicio, dataFim])

  const porDJ = useMemo(() => {
    const map = {}
    slots.forEach(slot => {
      const id = slot.dj_id ?? '__ext'
      if (!map[id]) {
        map[id] = {
          id,
          nome: slot.djs?.nome_artistico || slot.djs?.nome || 'Externo',
          slots: [],
          pagaveis: 0, proposta: 0, cancelados: 0, valor: 0,
        }
      }
      map[id].slots.push(slot)
      if (PAGAVEIS.has(slot.estado))        { map[id].pagaveis++;  map[id].valor += Number(slot.valor ?? 0) }
      else if (CANCELADOS.has(slot.estado)) { map[id].cancelados++ }
      else                                   { map[id].proposta++ }
    })
    return Object.values(map).sort((a, b) => b.valor - a.valor)
  }, [slots])

  const totalValor = porDJ.reduce((s, r) => s + r.valor, 0)
  const totalDatas = porDJ.reduce((s, r) => s + r.pagaveis, 0)

  if (loading) return <LoadingPage />

  return (
    <div className="p-6 flex flex-col gap-5">

      {/* KPIs */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent">{totalDatas}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">atuações a pagar</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-status-confirmado">{formatarEuro(totalValor)}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">total a pagar DJs — {titulo}</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent-muted">{porDJ.length}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">DJs com datas</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="text-left px-4 py-2.5 font-medium text-accent-muted w-[30%]">DJ</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Confirmadas</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Proposta</th>
              <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Canceladas / Faltas</th>
              <th className="text-right px-4 py-2.5 font-medium text-accent-muted">Valor a Pagar</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {porDJ.map((r, i) => (
              <>
                <tr
                  key={r.id}
                  onClick={() => setExpand(expand === r.id ? null : r.id)}
                  className={clsx(
                    'border-b border-border/30 last:border-0 cursor-pointer transition-colors',
                    i % 2 !== 0 ? 'bg-surface-0/40' : '',
                    expand === r.id ? 'bg-status-confirmado/5' : 'hover:bg-surface-2/60'
                  )}
                >
                  <td className="px-4 py-2.5 font-semibold text-accent">{r.nome}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={r.pagaveis > 0 ? 'text-status-confirmado font-semibold' : 'text-border/50'}>
                      {r.pagaveis || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={r.proposta > 0 ? 'text-status-proposta' : 'text-border/50'}>
                      {r.proposta || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={r.cancelados > 0 ? 'text-status-cancelado' : 'text-border/50'}>
                      {r.cancelados || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-accent">
                    {r.valor > 0 ? formatarEuro(r.valor) : <span className="text-border/50">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-accent-subtle text-center">
                    {expand === r.id ? '▲' : '▼'}
                  </td>
                </tr>

                {/* Detalhe expandido */}
                {expand === r.id && (
                  <tr key={r.id + '-detail'} className="bg-surface-0/60">
                    <td colSpan={6} className="px-8 py-3">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-accent-subtle border-b border-border/40">
                            <th className="text-left pb-1.5 font-medium">Data</th>
                            <th className="text-left pb-1.5 font-medium">Espaço</th>
                            <th className="text-left pb-1.5 font-medium">Horário</th>
                            <th className="text-center pb-1.5 font-medium">Estado</th>
                            <th className="text-right pb-1.5 font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.slots.map(s => {
                            const isPag = PAGAVEIS.has(s.estado)
                            const isCan = CANCELADOS.has(s.estado)
                            return (
                              <tr key={s.id} className="border-b border-border/20 last:border-0">
                                <td className="py-1.5 text-accent-muted">
                                  {format(new Date(s.data + 'T00:00:00'), "EEE d MMM", { locale: pt })}
                                </td>
                                <td className="py-1.5 text-accent-muted">{s.espacos?.nome ?? '—'}</td>
                                <td className="py-1.5 text-accent-muted tabular-nums">
                                  {s.hora_inicio?.slice(0,5)}–{s.hora_fim?.slice(0,5)}
                                </td>
                                <td className="py-1.5 text-center">
                                  <span className={clsx(
                                    'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                                    isPag ? 'text-status-confirmado bg-status-confirmado/10' :
                                    isCan ? 'text-status-cancelado bg-status-cancelado/10' :
                                            'text-status-proposta bg-status-proposta/10'
                                  )}>
                                    {LABEL_ESTADO[s.estado] ?? s.estado}
                                  </span>
                                </td>
                                <td className={clsx(
                                  'py-1.5 text-right tabular-nums font-medium',
                                  isPag ? 'text-accent' : 'text-accent-subtle line-through'
                                )}>
                                  {s.valor != null ? formatarEuro(Number(s.valor)) : '—'}
                                </td>
                              </tr>
                            )
                          })}
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
              <td className="px-4 py-2.5 font-bold text-accent text-xs uppercase tracking-wider">Total</td>
              <td className="px-3 py-2.5 text-center font-bold text-status-confirmado">{totalDatas}</td>
              <td /><td />
              <td className="px-4 py-2.5 text-right font-bold text-status-confirmado tabular-nums text-sm">
                {formatarEuro(totalValor)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
