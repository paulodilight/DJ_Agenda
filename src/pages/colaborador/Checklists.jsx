import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListChecks, ChevronRight, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { useColaboradorStore } from '@/store'
import { dataLonga, hhmm } from '@/components/colaborador/format'

export function ColaboradorChecklists() {
  const colaborador = useColaboradorStore(s => s.colaborador)
  const navigate    = useNavigate()
  const [itens,   setItens]   = useState([]) // [{ evento, nItens, nFeitos }]
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!colaborador?.id) return
    let active = true
    setLoading(true)

    Promise.all([
      // Eventos atribuídos a este técnico
      supabase.from('evento_tecnicos')
        .select('evento_id')
        .eq('tecnico_id', colaborador.id),
      // Todos os evento_checklists com os seus itens
      supabase.from('evento_checklists')
        .select('evento_id, checklist_id, checklists(checklist_itens(id))'),
      // Checks deste técnico
      supabase.from('checklist_checks')
        .select('evento_id, checklist_item_id')
        .eq('tecnico_id', colaborador.id),
    ]).then(async ([{ data: ets }, { data: ecs }, { data: chks }]) => {
      if (!active) return

      const eventoIds = [...new Set((ets ?? []).map(e => e.evento_id))]
      if (eventoIds.length === 0) { setItens([]); setLoading(false); return }

      // Calcular progresso por evento
      const progressoPorEvento = {}
      ;(ecs ?? []).forEach(ec => {
        const itensCount = ec.checklists?.checklist_itens?.length ?? 0
        if (!progressoPorEvento[ec.evento_id]) progressoPorEvento[ec.evento_id] = { total: 0 }
        progressoPorEvento[ec.evento_id].total += itensCount
      })
      ;(chks ?? []).forEach(c => {
        if (!progressoPorEvento[c.evento_id]) return
        if (!progressoPorEvento[c.evento_id].feitos) progressoPorEvento[c.evento_id].feitos = 0
        progressoPorEvento[c.evento_id].feitos++
      })

      // Só eventos que têm checklists
      const comChecklist = eventoIds.filter(id => progressoPorEvento[id]?.total > 0)
      if (comChecklist.length === 0) { setItens([]); setLoading(false); return }

      // Buscar dados dos eventos
      const { data: evs } = await supabase.from('supa_eventos')
        .select('id, evento, data_evento, hora_inicio, hora_instalacao, espaco_id, espacos(nome, logo_url)')
        .in('id', comChecklist)
        .neq('status', 'cancelado')
        .gte('data_evento', new Date().toISOString().slice(0, 10))
        .order('data_evento')

      if (!active) return
      setItens((evs ?? []).map(ev => ({
        ev,
        total:  progressoPorEvento[ev.id]?.total  ?? 0,
        feitos: progressoPorEvento[ev.id]?.feitos ?? 0,
      })))
      setLoading(false)
    })
    return () => { active = false }
  }, [colaborador?.id])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-accent-subtle text-sm">A carregar…</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent-subtle px-1">
        Os meus checklists
      </p>

      {itens.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ListChecks size={40} className="text-accent-subtle/20" />
          <p className="text-accent-subtle/50 text-sm">Sem checklists nos próximos eventos.</p>
        </div>
      )}

      {itens.map(({ ev, total, feitos }) => {
        const pct       = total > 0 ? Math.round((feitos / total) * 100) : 0
        const concluido = feitos >= total && total > 0
        const espaco    = ev.espacos?.nome || ''
        const logo      = ev.espacos?.logo_url

        return (
          <button key={ev.id}
            onClick={() => navigate(`/apoiot/checklist/${ev.id}`)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-surface-1 border border-border rounded-2xl hover:border-white/20 active:scale-[0.98] text-left transition-all">

            {/* Logo / inicial */}
            <div className="w-11 h-11 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 overflow-hidden">
              {logo
                ? <img src={logo} alt={espaco} className="w-full h-full object-cover" />
                : <ListChecks size={18} className={concluido ? 'text-green-400' : 'text-amber-400'} />}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-accent truncate">{ev.evento}</p>
              {espaco && <p className="text-xs text-accent-muted truncate">{espaco}</p>}
              <p className="text-xs text-accent-subtle capitalize mt-0.5">
                {[dataLonga(ev.data_evento), hhmm(ev.hora_inicio)].filter(Boolean).join(' · ')}
              </p>

              {/* Barra de progresso */}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full transition-all', concluido ? 'bg-green-500' : 'bg-amber-400/70')}
                    style={{ width: `${pct}%` }} />
                </div>
                <span className={clsx('text-[10px] font-mono shrink-0', concluido ? 'text-green-400' : 'text-accent-subtle')}>
                  {feitos}/{total}
                </span>
              </div>
            </div>

            {concluido
              ? <Check size={16} className="text-green-400 shrink-0" />
              : <ChevronRight size={16} className="text-accent-subtle/40 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
