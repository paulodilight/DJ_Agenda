import { useState, useEffect, useMemo } from 'react'
import { MapPin, Clock, ArrowUpDown } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'

const fmt = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const fmtData = (str) => {
  if (!str) return '—'
  const [ano, mes, dia] = str.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

const anoMesDeStr = (str) => str?.slice(0, 7) ?? ''

function GeoLink({ lat, lon, accuracy }) {
  if (!lat || !lon) return <span className="text-accent-subtle/30 text-xs">—</span>
  const url = `https://www.google.com/maps?q=${lat},${lon}`
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
      <MapPin size={11} />
      <span>{Number(lat).toFixed(4)}, {Number(lon).toFixed(4)}</span>
      {accuracy != null && <span className="text-accent-subtle/50 ml-0.5">±{accuracy}m</span>}
    </a>
  )
}

function Tabela({ children, cols }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {cols.map(c => (
              <th key={c} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-accent-subtle whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Linha({ cells, atrasado }) {
  return (
    <tr className={clsx(
      'border-b border-border/40 last:border-0 transition-colors hover:bg-surface-2/50',
      atrasado && 'bg-red-500/5'
    )}>
      {cells.map((c, i) => (
        <td key={i} className="px-4 py-3 text-xs text-accent-muted whitespace-nowrap">{c}</td>
      ))}
    </tr>
  )
}

function Filtros({ nomes, nomeSel, setNomeSel, mesSel, setMesSel, meses, ordem, setOrdem, labelNome }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Nome */}
      <select value={nomeSel} onChange={e => setNomeSel(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs text-accent focus:outline-none focus:border-white/30">
        <option value="">Todos os {labelNome}</option>
        {nomes.map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      {/* Mês */}
      <select value={mesSel} onChange={e => setMesSel(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs text-accent focus:outline-none focus:border-white/30">
        <option value="">Todos os meses</option>
        {meses.map(m => {
          const [ano, mes] = m.split('-')
          const label = new Date(Number(ano), Number(mes) - 1, 1)
            .toLocaleString('pt-PT', { month: 'long', year: 'numeric' })
          return <option key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>
        })}
      </select>

      {/* Ordem */}
      <button onClick={() => setOrdem(o => o === 'desc' ? 'asc' : 'desc')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs text-accent hover:border-white/30 transition-colors">
        <ArrowUpDown size={11} />
        {ordem === 'desc' ? 'Mais recente' : 'Mais antigo'}
      </button>

      {/* Contador */}
      <span className="ml-auto text-[11px] text-accent-subtle/60 self-center">
        {/* preenchido pelo pai */}
      </span>
    </div>
  )
}

/* ── Aba Técnicos ── */
function TabTecnicos() {
  const [todas, setTodas] = useState([])
  const [loading, setLoading] = useState(true)
  const [nomeSel, setNomeSel]  = useState('')
  const [mesSel,  setMesSel]   = useState('')
  const [ordem,   setOrdem]    = useState('desc')

  useEffect(() => {
    Promise.all([
      supabase.from('assinaturas_tecnico')
        .select('tecnico_id, evento_id, tipo, registado_em, latitude, longitude')
        .in('tipo', ['evento_entrada', 'evento_saida']),
      supabase.from('vw_colaboradores').select('id, nome'),
    ]).then(async ([{ data: assin }, { data: colab }]) => {
      const nomes = Object.fromEntries((colab ?? []).map(c => [c.id, c.nome]))
      const mapa = {}
      ;(assin ?? []).forEach(r => {
        const key = `${r.evento_id}_${r.tecnico_id}`
        if (!mapa[key]) mapa[key] = { tecnicoId: r.tecnico_id, eventoId: r.evento_id, entrada: null, saida: null }
        if (r.tipo === 'evento_entrada') mapa[key].entrada = r
        else mapa[key].saida = r
      })

      const eventoIds = [...new Set(Object.values(mapa).map(m => m.eventoId).filter(Boolean))]
      let eventos = {}
      if (eventoIds.length > 0) {
        const { data: evs } = await supabase.from('supa_eventos')
          .select('id, evento, data_evento, hora_inicio').in('id', eventoIds)
        ;(evs ?? []).forEach(e => { eventos[e.id] = e })
      }

      setTodas(Object.values(mapa).map(m => ({
        ...m,
        nome: nomes[m.tecnicoId] ?? '—',
        evento: eventos[m.eventoId] ?? null,
      })))
      setLoading(false)
    })
  }, [])

  const dataLinha = (l) =>
    l.evento?.data_evento ?? l.entrada?.registado_em?.slice(0,10) ?? l.saida?.registado_em?.slice(0,10)

  const nomes  = useMemo(() => [...new Set(todas.map(l => l.nome).filter(n => n !== '—'))].sort(), [todas])
  const meses  = useMemo(() => {
    const set = new Set(todas.map(l => anoMesDeStr(dataLinha(l))).filter(Boolean))
    return [...set].sort().reverse()
  }, [todas])

  const linhas = useMemo(() => {
    let r = todas
    if (nomeSel) r = r.filter(l => l.nome === nomeSel)
    if (mesSel)  r = r.filter(l => anoMesDeStr(dataLinha(l)) === mesSel)
    return r.sort((a, b) => {
      const ta = a.entrada?.registado_em ?? a.saida?.registado_em ?? ''
      const tb = b.entrada?.registado_em ?? b.saida?.registado_em ?? ''
      return ordem === 'desc' ? tb.localeCompare(ta) : ta.localeCompare(tb)
    })
  }, [todas, nomeSel, mesSel, ordem])

  if (loading) return <p className="text-accent-subtle text-sm py-10 text-center">A carregar…</p>

  return (
    <div className="flex flex-col gap-4">
      <Filtros nomes={nomes} nomeSel={nomeSel} setNomeSel={setNomeSel}
        mesSel={mesSel} setMesSel={setMesSel} meses={meses}
        ordem={ordem} setOrdem={setOrdem} labelNome="técnicos" />

      {linhas.length === 0
        ? <p className="text-accent-subtle/40 text-sm py-10 text-center italic">Sem registos.</p>
        : (
          <Tabela cols={['Dia', 'Técnico', 'Evento', 'Entrada', 'Saída', 'Geolocalização']}>
            {linhas.map((l, i) => {
              const geo = l.entrada ?? l.saida
              return (
                <Linha key={i} cells={[
                  fmtData(dataLinha(l)),
                  <span className="font-semibold text-accent">{l.nome}</span>,
                  l.evento?.evento ?? <span className="text-accent-subtle/40 italic">evento apagado</span>,
                  <span className={clsx('font-mono', l.entrada ? 'text-green-400' : 'text-accent-subtle/40')}>
                    {l.entrada ? fmt(l.entrada.registado_em) : '—'}
                  </span>,
                  <span className={clsx('font-mono', l.saida ? 'text-red-400' : 'text-accent-subtle/40')}>
                    {l.saida ? fmt(l.saida.registado_em) : '—'}
                  </span>,
                  <GeoLink lat={geo?.latitude} lon={geo?.longitude} />,
                ]} />
              )
            })}
          </Tabela>
        )
      }
      <p className="text-[11px] text-accent-subtle/50 text-right">{linhas.length} registo{linhas.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

/* ── Aba DJs ── */
function TabDJs() {
  const [todas, setTodas] = useState([])
  const [loading, setLoading] = useState(true)
  const [nomeSel, setNomeSel]  = useState('')
  const [mesSel,  setMesSel]   = useState('')
  const [ordem,   setOrdem]    = useState('desc')

  useEffect(() => {
    supabase.from('presencas_djs')
      .select('dj_id, agenda_id, signed_at, latitude, longitude, accuracy_m')
      .then(async ({ data: presencas }) => {
        const agendaIds = [...new Set((presencas ?? []).map(p => p.agenda_id).filter(Boolean))]
        let agendas = {}
        if (agendaIds.length > 0) {
          const { data: ags } = await supabase.from('agenda')
            .select('id, data, hora_inicio, hora_fim, dj_nome, espaco_nome').in('id', agendaIds)
          ;(ags ?? []).forEach(a => { agendas[a.id] = a })
        }
        setTodas((presencas ?? []).map(p => ({ ...p, ag: agendas[p.agenda_id] ?? null })))
        setLoading(false)
      })
  }, [])

  const nomes = useMemo(() => [...new Set(todas.map(l => l.ag?.dj_nome).filter(Boolean))].sort(), [todas])
  const meses = useMemo(() => {
    const set = new Set(todas.map(l => anoMesDeStr(l.ag?.data)).filter(Boolean))
    return [...set].sort().reverse()
  }, [todas])

  const linhas = useMemo(() => {
    let r = todas
    if (nomeSel) r = r.filter(l => l.ag?.dj_nome === nomeSel)
    if (mesSel)  r = r.filter(l => anoMesDeStr(l.ag?.data) === mesSel)
    return r.sort((a, b) => {
      const ta = a.signed_at ?? ''
      const tb = b.signed_at ?? ''
      return ordem === 'desc' ? tb.localeCompare(ta) : ta.localeCompare(tb)
    })
  }, [todas, nomeSel, mesSel, ordem])

  if (loading) return <p className="text-accent-subtle text-sm py-10 text-center">A carregar…</p>

  return (
    <div className="flex flex-col gap-4">
      <Filtros nomes={nomes} nomeSel={nomeSel} setNomeSel={setNomeSel}
        mesSel={mesSel} setMesSel={setMesSel} meses={meses}
        ordem={ordem} setOrdem={setOrdem} labelNome="DJs" />

      {linhas.length === 0
        ? <p className="text-accent-subtle/40 text-sm py-10 text-center italic">Sem registos.</p>
        : (
          <Tabela cols={['Dia', 'DJ', 'Espaço', 'Hora Início', 'Hora Fim', 'Assinatura', 'Geolocalização']}>
            {linhas.map((l, i) => {
              const ag = l.ag
              let atrasado = false
              if (ag?.data && ag?.hora_inicio && l.signed_at) {
                const horaAgend = new Date(`${ag.data}T${ag.hora_inicio}`)
                const horaSign  = new Date(l.signed_at)
                atrasado = horaSign.getTime() > horaAgend.getTime() + 15 * 60000
              }
              return (
                <Linha key={i} atrasado={atrasado} cells={[
                  fmtData(ag?.data),
                  <span className="font-semibold text-accent">{ag?.dj_nome ?? '—'}</span>,
                  ag?.espaco_nome ?? '—',
                  <span className="font-mono text-accent-muted">{ag?.hora_inicio?.slice(0,5) ?? '—'}</span>,
                  <span className="font-mono text-accent-muted">{ag?.hora_fim?.slice(0,5) ?? '—'}</span>,
                  <span className={clsx('font-mono inline-flex items-center gap-1', atrasado ? 'text-red-400' : 'text-green-400')}>
                    <Clock size={11} />
                    {fmt(l.signed_at)}
                    {atrasado && <span className="text-[10px] font-semibold text-red-400/70 ml-0.5">atrasado</span>}
                  </span>,
                  <GeoLink lat={l.latitude} lon={l.longitude} accuracy={l.accuracy_m} />,
                ]} />
              )
            })}
          </Tabela>
        )
      }
      <p className="text-[11px] text-accent-subtle/50 text-right">{linhas.length} registo{linhas.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

/* ── Página principal ── */
export function Pontualidades() {
  const [aba, setAba] = useState('tecnicos')

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'tecnicos', label: 'Técnicos' },
          { id: 'djs',      label: 'DJs' },
        ].map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={clsx(
              'px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
              aba === t.id
                ? 'border-status-confirmado text-status-confirmado'
                : 'border-transparent text-accent-muted hover:text-accent'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'tecnicos' ? <TabTecnicos /> : <TabDJs />}
    </div>
  )
}
