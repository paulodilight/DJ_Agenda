import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Check, ListChecks } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { useColaboradorStore } from '@/store'
import { hhmm, dataLonga } from '@/components/colaborador/format'

export function ChecklistEvento() {
  const { eventoId }   = useParams()
  const navigate       = useNavigate()
  const colaborador    = useColaboradorStore(s => s.colaborador)

  const [evento,    setEvento]    = useState(null)
  const [listas,    setListas]    = useState([]) // [{ clId, nome, itens:[{id,texto}] }]
  const [checks,    setChecks]    = useState(new Set()) // itemIds checked by this tech
  const [loading,   setLoading]   = useState(true)
  const [idx,       setIdx]       = useState(0)  // índice da checklist activa
  const [dir,       setDir]       = useState('right')
  const touchX = useRef(null)

  const evId = Number(eventoId)

  useEffect(() => {
    if (!evId) return
    let active = true
    setLoading(true)

    Promise.all([
      supabase.from('supa_eventos')
        .select('id, evento, data_evento, hora_inicio, hora_instalacao, espaco_id, espacos(nome)')
        .eq('id', evId).maybeSingle(),
      supabase.from('evento_checklists')
        .select('checklist_id, checklists(id, nome, checklist_itens(id, texto, ordem))')
        .eq('evento_id', evId),
      colaborador?.id
        ? supabase.from('checklist_checks')
            .select('checklist_item_id')
            .eq('evento_id', evId)
            .eq('tecnico_id', colaborador.id)
        : Promise.resolve({ data: [] }),
    ]).then(([{ data: ev }, { data: ecs }, { data: chks }]) => {
      if (!active) return
      setEvento(ev)
      setListas((ecs ?? []).map(ec => ({
        clId: ec.checklist_id,
        nome: ec.checklists?.nome ?? '?',
        itens: (ec.checklists?.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem),
      })))
      setChecks(new Set((chks ?? []).map(c => c.checklist_item_id)))
      setLoading(false)
    })
    return () => { active = false }
  }, [evId, colaborador?.id])

  const toggleCheck = async (itemId) => {
    if (!colaborador?.id) return
    const checked = checks.has(itemId)
    setChecks(prev => { const s = new Set(prev); if (checked) s.delete(itemId); else s.add(itemId); return s })
    if (!checked) {
      await supabase.from('checklist_checks').upsert(
        { evento_id: evId, checklist_item_id: itemId, tecnico_id: colaborador.id },
        { onConflict: 'evento_id,checklist_item_id,tecnico_id' }
      )
    } else {
      await supabase.from('checklist_checks').delete()
        .eq('evento_id', evId).eq('checklist_item_id', itemId).eq('tecnico_id', colaborador.id)
    }
  }

  const goIdx = (novoIdx, direcao) => {
    if (novoIdx === idx) return
    setDir(direcao)
    setIdx(novoIdx)
  }

  const onTouchStart = (e) => { touchX.current = e.changedTouches[0].clientX }
  const onTouchEnd   = (e) => {
    if (touchX.current === null) return
    const d = e.changedTouches[0].clientX - touchX.current
    if (d < -60 && idx < listas.length - 1) goIdx(idx + 1, 'right')
    if (d >  60 && idx > 0)                 goIdx(idx - 1, 'left')
    touchX.current = null
  }

  const lista = listas[idx]

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-accent-subtle text-sm">A carregar…</p>
    </div>
  )

  if (!evento) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-status-cancelado text-sm">Evento não encontrado.</p>
    </div>
  )

  const espacoNome = evento.espacos?.nome || ''
  const dataStr    = dataLonga(evento.data_evento)
  const horaInstal = hhmm(evento.hora_instalacao)
  const horaInicio = hhmm(evento.hora_inicio)

  return (
    <div className="flex flex-col min-h-screen bg-surface-1">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border shrink-0">
        <button onClick={() => navigate(-1)} className="text-accent-subtle hover:text-accent transition-colors shrink-0">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-black text-accent truncate leading-tight" style={{ fontSize: 16 }}>
            {evento.evento}
          </p>
          <p className="text-accent-muted truncate mt-0.5" style={{ fontSize: 12 }}>
            {[espacoNome, dataStr, horaInstal && `montagem ${horaInstal}`, horaInicio && `início ${horaInicio}`]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <ListChecks size={18} className="text-accent-subtle shrink-0" />
      </div>

      {/* Tabs das checklists (só se mais de uma) */}
      {listas.length > 1 && (
        <div className="flex border-b border-border px-4 shrink-0 overflow-x-auto gap-1 items-end">
          {listas.map((l, i) => (
            <button key={l.clId} onClick={() => goIdx(i, i > idx ? 'right' : 'left')}
              className={clsx(
                'px-3 py-2.5 font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap',
                i === idx
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-accent-muted hover:text-accent'
              )}
              style={{ fontSize: 12 }}>
              {l.nome}
            </button>
          ))}
          <span className="ml-auto pr-1 pb-2 select-none text-accent-subtle/30 shrink-0" style={{ fontSize: 9 }}>
            ← desliza →
          </span>
        </div>
      )}

      {/* Conteúdo swipeable */}
      {listas.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-accent-subtle/40 italic text-sm">Sem checklists associadas a este evento.</p>
        </div>
      ) : (
        <div key={`${idx}`}
          className={clsx('flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3',
            dir === 'right' ? 'tab-from-right' : 'tab-from-left')}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

          {/* Título da lista (quando só há uma) */}
          {listas.length === 1 && (
            <div className="flex items-center gap-2 pb-1">
              <ListChecks size={14} className="text-amber-400 shrink-0" />
              <p className="font-semibold text-amber-400" style={{ fontSize: 13 }}>{lista?.nome}</p>
            </div>
          )}

          {/* Itens */}
          <div className="border border-white/10 rounded-xl overflow-hidden">
            {(lista?.itens ?? []).length === 0 ? (
              <p className="px-4 py-3 italic text-accent-subtle/40" style={{ fontSize: 13 }}>
                Sem itens nesta checklist.
              </p>
            ) : (lista?.itens ?? []).map(item => {
              const checked = checks.has(item.id)
              return (
                <button key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  className={clsx(
                    'flex items-center gap-3 w-full px-4 py-3.5 border-b border-white/5 last:border-0 text-left transition-colors',
                    checked ? 'bg-green-500/10' : 'hover:bg-white/5 active:bg-white/10'
                  )}>
                  <span className={clsx(
                    'w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                    checked ? 'bg-green-500/30 border-green-500/60' : 'border-white/20'
                  )}>
                    {checked && <Check size={14} className="text-green-400" />}
                  </span>
                  <span className={clsx('flex-1', checked ? 'line-through opacity-40' : 'opacity-80')}
                    style={{ fontSize: 14 }}>
                    {item.texto}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Progresso */}
          {(lista?.itens ?? []).length > 0 && (() => {
            const total    = lista.itens.length
            const feitos   = lista.itens.filter(it => checks.has(it.id)).length
            const pct      = Math.round((feitos / total) * 100)
            return (
              <div className="mt-1">
                <div className="flex justify-between text-accent-subtle mb-1.5" style={{ fontSize: 11 }}>
                  <span>{feitos} de {total} concluídos</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500/70 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}

          {/* Navegação entre listas */}
          {listas.length > 1 && (
            <div className="flex justify-center gap-2 pt-2 pb-1">
              {listas.map((_, i) => (
                <button key={i} onClick={() => goIdx(i, i > idx ? 'right' : 'left')}
                  className={clsx(
                    'w-2 h-2 rounded-full transition-colors',
                    i === idx ? 'bg-amber-400' : 'bg-white/20'
                  )} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
