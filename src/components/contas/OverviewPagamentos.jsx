import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'

export function OverviewPagamentos({ onSelectDJ, refreshKey = 0 }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('agenda')
      .select('dj_id, estado_pagamento, djs(nome, nome_artistico)')
      .in('estado_pagamento', ['em_pagamento', 'em_regularizacao'])
      .not('dj_id', 'is', null)
      .then(({ data }) => {
        if (cancelled || !data) return
        const map = {}
        for (const row of data) {
          const id = row.dj_id
          if (!map[id]) map[id] = {
            dj_id: id,
            nome: row.djs?.nome_artistico || row.djs?.nome || 'DJ',
            total: 0, cumprem: 0, nao_cumprem: 0,
          }
          map[id].total++
          if (row.estado_pagamento === 'em_pagamento')     map[id].cumprem++
          if (row.estado_pagamento === 'em_regularizacao') map[id].nao_cumprem++
        }
        if (!cancelled) setRows(Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome)))
      })
    return () => { cancelled = true }
  }, [refreshKey])

  if (!rows.length) return null

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-2">
        <span className="text-sm font-semibold text-accent">Pagamentos em aberto</span>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-4 py-2.5 font-medium text-accent-muted">DJ</th>
            <th className="text-center px-3 py-2.5 font-medium text-accent-muted">Total datas</th>
            <th className="text-center px-3 py-2.5 font-medium text-accent-muted">🟢 Cumprem</th>
            <th className="text-center px-3 py-2.5 font-medium text-accent-muted">🔴 Não cumprem</th>
            <th className="text-center px-4 py-2.5 font-medium text-accent-muted">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.dj_id}
              onClick={() => onSelectDJ(r.dj_id)}
              className={clsx(
                'border-b border-border/20 last:border-0 cursor-pointer transition-colors hover:bg-surface-2/40',
                i % 2 !== 0 && 'bg-surface-0/30'
              )}>
              <td className="px-4 py-2.5 font-semibold text-accent hover:underline underline-offset-2">{r.nome}</td>
              <td className="px-3 py-2.5 text-center text-accent-muted tabular-nums">{r.total}</td>
              <td className="px-3 py-2.5 text-center tabular-nums">
                {r.cumprem > 0
                  ? <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />{r.cumprem}
                    </span>
                  : <span className="text-border/40">—</span>}
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums">
                {r.nao_cumprem > 0
                  ? <span className="inline-flex items-center gap-1.5 text-red-400 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />{r.nao_cumprem}
                    </span>
                  : <span className="text-border/40">—</span>}
              </td>
              <td className="px-4 py-2.5 text-center">
                {r.nao_cumprem === 0
                  ? <span className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">PAGAR</span>
                  : <span className="inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400">EM REGULARIZAÇÃO</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
