import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useMesStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { formatarEuro } from '@/utils/formatacao'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { clsx } from 'clsx'

const cap  = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
const fmtD = (d) => format(new Date(d + 'T00:00:00'), "EEE d/MM", { locale: pt })

const TIPO_LABEL = {
  mensal:  'Mensal',
  dia:     'Por dia',
  hora:    'Por hora',
  evento:  'Por evento',
}

function BadgeTipo({ tipo }) {
  if (!tipo) return null
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-surface-3 text-accent-subtle font-medium">
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  )
}

// Calcula o valor a pagar ao técnico
function calcPagamento(tecnico, nDias, horasMin, somaEventos) {
  const base = Number(tecnico.valor_base ?? 0)
  switch (tecnico.tipo_pagamento) {
    case 'mensal': return base
    case 'dia':    return base * nDias
    case 'hora':   return base * (horasMin / 60)
    case 'evento': return somaEventos
    default:       return somaEventos
  }
}

export function ContasColaboradores() {
  const { anoMes } = useMesStore()
  const [tecnicos, setTecnicos]         = useState([])
  const [eventos, setEventos]           = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [espacos, setEspacos]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [expand, setExpand]             = useState(null)

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
    Promise.all([
      supabase.from('tecnicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('supa_eventos')
        .select('id, tecnico_id, evento, data_evento, espaco_id, valor_apoio_tecnico, status')
        .gte('data_evento', dataInicio).lte('data_evento', dataFim)
        .neq('status', 'cancelado'),
      supabase.from('agendamentos_tecnicos')
        .select('*')
        .gte('data', dataInicio).lte('data', dataFim),
      supabase.from('espacos').select('id, nome'),
    ]).then(([tRes, evRes, agRes, esRes]) => {
      if (cancelled) return
      setTecnicos(tRes.data ?? [])
      setEventos(evRes.data ?? [])
      setAgendamentos(agRes.data ?? [])
      setEspacos(esRes.data ?? [])
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dataInicio, dataFim])

  const espacoNome = useMemo(() => {
    const m = {}
    espacos.forEach(e => { m[e.id] = e.nome.trim() })
    return m
  }, [espacos])

  // Agrupa dados por técnico
  const cards = useMemo(() => {
    return tecnicos.map(tec => {
      // Eventos atribuídos a este técnico
      const evsTec = eventos.filter(e => e.tecnico_id === tec.id)

      // Agendamentos manuais (não folga)
      const agsTec = agendamentos.filter(a => a.tecnico_id === tec.id && !a.folga)

      // Folgas
      const folgasTec = agendamentos
        .filter(a => a.tecnico_id === tec.id && a.folga)
        .map(a => a.data)
        .sort()

      // Cálculo
      const somaEventos = evsTec.reduce((s, e) => s + Number(e.valor_apoio_tecnico ?? 0), 0)
      const somaAgs     = agsTec.reduce((s, a) => s + Number(a.valor ?? 0), 0)
      const nDias       = new Set([...evsTec.map(e => e.data_evento), ...agsTec.map(a => a.data)]).size

      const valorPagar = calcPagamento(tec, nDias, 0, somaEventos + somaAgs)
      const valorCobrar = somaEventos // o que facturamos ao cliente pelo apoio técnico

      return {
        tec,
        evsTec: evsTec.sort((a, b) => a.data_evento.localeCompare(b.data_evento)),
        agsTec: agsTec.sort((a, b) => a.data.localeCompare(b.data)),
        folgasTec,
        nDias,
        nEventos: evsTec.length,
        nFolgas:  folgasTec.length,
        valorPagar,
        valorCobrar,
      }
    })
  }, [tecnicos, eventos, agendamentos])

  const totalPagar  = cards.reduce((s, c) => s + c.valorPagar, 0)
  const totalDias   = cards.reduce((s, c) => s + c.nDias, 0)
  const totalEvents = cards.reduce((s, c) => s + c.nEventos, 0)

  if (loading) return <LoadingPage />

  return (
    <div className="p-6 flex flex-col gap-5">

      {/* ── KPIs ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-status-confirmado">{formatarEuro(totalPagar)}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">total a pagar — {titulo}</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent">{totalEvents}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">eventos com apoio técnico</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent-muted">{totalDias}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">dias de trabalho</p>
        </div>
        <div className="bg-surface-1 border border-border rounded-lg px-5 py-3">
          <p className="text-2xl font-bold tabular-nums text-accent-muted">{cards.length}</p>
          <p className="text-[11px] text-accent-muted mt-0.5">colaboradores</p>
        </div>
      </div>

      {/* ── Cards por técnico ── */}
      <div className="grid grid-cols-1 gap-4">
        {cards.map(({ tec, evsTec, agsTec, folgasTec, nDias, nEventos, nFolgas, valorPagar, valorCobrar }) => {
          const aberto = expand === tec.id
          const semActividade = nEventos === 0 && agsTec.length === 0

          return (
            <div key={tec.id} className={clsx(
              'bg-surface-1 border rounded-xl overflow-hidden transition-colors',
              aberto ? 'border-white/10' : 'border-border'
            )}>

              {/* ── Cabeçalho do card ── */}
              <div
                onClick={() => setExpand(aberto ? null : tec.id)}
                className="cursor-pointer hover:bg-surface-2/40 transition-colors"
              >
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  {/* Esquerda: nome + tipo */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-3 border border-border flex items-center justify-center text-sm font-bold text-accent shrink-0">
                      {tec.nome.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-accent">{tec.nome}</p>
                        <BadgeTipo tipo={tec.tipo_pagamento} />
                      </div>
                      <p className="text-[11px] text-accent-subtle mt-0.5">
                        {semActividade
                          ? 'Sem actividade'
                          : [
                              nEventos > 0   && `${nEventos} evento${nEventos !== 1 ? 's' : ''}`,
                              nDias > 0      && `${nDias} dia${nDias !== 1 ? 's' : ''}`,
                              nFolgas > 0    && `${nFolgas} folga${nFolgas !== 1 ? 's' : ''}`,
                            ].filter(Boolean).join(' · ')
                        }
                      </p>
                    </div>
                  </div>

                  {/* Direita: valor a pagar */}
                  <div className="text-right shrink-0">
                    <p className={clsx(
                      'text-lg font-bold tabular-nums',
                      valorPagar > 0 ? 'text-status-confirmado' : 'text-border/40'
                    )}>
                      {valorPagar > 0 ? formatarEuro(valorPagar) : '—'}
                    </p>
                    {valorCobrar > 0 && valorCobrar !== valorPagar && (
                      <p className="text-[10px] text-accent-subtle tabular-nums">
                        cobrado: {formatarEuro(valorCobrar)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Barra de folgas — visível no cabeçalho */}
                {nFolgas > 0 && (
                  <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-accent-subtle/60 uppercase tracking-wider">Folgas</span>
                    {folgasTec.map(d => (
                      <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-400/10 border border-orange-400/20 text-orange-400 font-medium">
                        {fmtD(d)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Detalhe expandido ── */}
              {aberto && (nEventos > 0 || agsTec.length > 0) && (
                <div className="border-t border-border/50">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-surface-2/60 border-b border-border/30">
                        <th className="text-left px-5 py-2 font-medium text-accent-subtle">Data</th>
                        <th className="text-left px-3 py-2 font-medium text-accent-subtle">Espaço</th>
                        <th className="text-left px-3 py-2 font-medium text-accent-subtle">Evento</th>
                        <th className="text-right px-5 py-2 font-medium text-accent-subtle">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Eventos de supa_eventos */}
                      {evsTec.map(ev => (
                        <tr key={`ev-${ev.id}`} className="border-b border-border/20 last:border-0 hover:bg-surface-2/20">
                          <td className="px-5 py-2 text-accent-muted whitespace-nowrap">{fmtD(ev.data_evento)}</td>
                          <td className="px-3 py-2 text-accent-muted">{espacoNome[ev.espaco_id] ?? '—'}</td>
                          <td className="px-3 py-2 text-accent">{ev.evento || <span className="text-border/40">—</span>}</td>
                          <td className="px-5 py-2 text-right tabular-nums font-medium text-accent">
                            {ev.valor_apoio_tecnico != null
                              ? formatarEuro(Number(ev.valor_apoio_tecnico))
                              : <span className="text-border/40">—</span>}
                          </td>
                        </tr>
                      ))}
                      {/* Agendamentos manuais (sem evento) */}
                      {agsTec.map(ag => (
                        <tr key={`ag-${ag.id}`} className="border-b border-border/20 last:border-0 hover:bg-surface-2/20">
                          <td className="px-5 py-2 text-accent-muted whitespace-nowrap">{fmtD(ag.data)}</td>
                          <td className="px-3 py-2 text-accent-muted">{espacoNome[ag.espaco_id] ?? '—'}</td>
                          <td className="px-3 py-2 text-accent-subtle italic">{ag.evento || 'Agendamento manual'}</td>
                          <td className="px-5 py-2 text-right tabular-nums font-medium text-accent">
                            {ag.valor != null
                              ? formatarEuro(Number(ag.valor))
                              : <span className="text-border/40">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Total */}
                    {valorPagar > 0 && (
                      <tfoot>
                        <tr className="border-t border-border bg-surface-2/40">
                          <td colSpan={3} className="px-5 py-2 font-semibold text-accent-subtle text-right uppercase tracking-wider text-[10px]">Total a pagar</td>
                          <td className="px-5 py-2 text-right font-bold text-status-confirmado tabular-nums">{formatarEuro(valorPagar)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Sem actividade mas com folgas — mostrar só folgas */}
              {aberto && semActividade && nFolgas === 0 && (
                <div className="border-t border-border/50 px-5 py-4 text-[11px] text-accent-subtle/50 text-center">
                  Sem eventos atribuídos em {titulo}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
