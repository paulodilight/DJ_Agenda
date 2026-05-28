import { useMemo } from 'react'
import { parseISO, format, getDate, startOfMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { formatarHora } from '@/utils/datas'
import { clsx } from 'clsx'
import { ExternalLink } from 'lucide-react'

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const ORDINAL = ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª']

// Número da semana dentro do mês (1–6), começando segunda-feira
function semanaNoMes(dataStr) {
  const data = parseISO(dataStr)
  const primeiro = startOfMonth(data)
  const offset = (primeiro.getDay() + 6) % 7 // 0 = segunda
  return Math.floor((getDate(data) - 1 + offset) / 7) + 1
}

function DJComLinks({ nome, presskit, instagram }) {
  if (!nome) return <span className="text-gray-300">—</span>
  const link = instagram || presskit || null
  return (
    <span className="inline-flex items-center gap-1 leading-tight">
      <span>{nome}</span>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 no-underline"
          style={{ color: '#6b7280' }}
        >
          <ExternalLink size={9} />
        </a>
      )}
    </span>
  )
}

export function DocumentoAgendaMes({ agenda, espacos, tituloMes, filtroEspaco }) {
  const espacosFiltrados = filtroEspaco
    ? espacos.filter((e) => e.id === filtroEspaco)
    : espacos

  // Agrupa: espaco_id → semana → data → [slots ordenados hora_inicio DESC]
  const porEspaco = useMemo(() => {
    const map = {}

    for (const slot of agenda) {
      if (slot.estado === 'cancelado') continue
      const eId = slot.espaco_id
      if (!map[eId]) map[eId] = {}
      const sem = semanaNoMes(slot.data)
      if (!map[eId][sem]) map[eId][sem] = {}
      if (!map[eId][sem][slot.data]) map[eId][sem][slot.data] = []
      map[eId][sem][slot.data].push(slot)
    }

    // Ordenar slots de cada dia por hora_inicio DESC (mais tarde = principal)
    for (const eId of Object.keys(map))
      for (const sem of Object.keys(map[eId]))
        for (const data of Object.keys(map[eId][sem]))
          map[eId][sem][data].sort((a, b) => b.hora_inicio.localeCompare(a.hora_inicio))

    return espacosFiltrados
      .filter((e) => map[e.id])
      .map((e) => ({ espaco: e, semanas: map[e.id] }))
  }, [agenda, espacosFiltrados])

  if (porEspaco.length === 0) return null

  return (
    <div id="documento-agenda-mes" className="bg-white text-gray-900" style={{ display: 'none' }}>
      {porEspaco.map(({ espaco, semanas }, ei) => (
        <div
          key={espaco.id}
          style={ei > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : {}}
          className="p-12"
        >
          {/* Cabeçalho do espaço */}
          <div className="flex items-center gap-4 mb-1 pb-4 border-b-2 border-gray-900">
            {espaco.logo_url && (
              <img
                src={espaco.logo_url}
                alt={espaco.nome}
                className="h-12 w-auto object-contain"
              />
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Programa de Actuações
              </p>
              <h1 className="text-xl font-bold uppercase tracking-tight text-gray-900">
                {espaco.nome}
              </h1>
            </div>
          </div>

          {/* Tabela */}
          <table className="w-full text-xs border-collapse mt-3">
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '21%' }} />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-gray-300 bg-gray-50">
                <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-[9px] tracking-wider">Dia</th>
                <th className="text-center py-2 px-1 font-semibold text-gray-500 uppercase text-[9px] tracking-wider">#</th>
                <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-[9px] tracking-wider">DJ</th>
                <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-[9px] tracking-wider">Hora</th>
                <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-[9px] tracking-wider">DJ</th>
                <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-[9px] tracking-wider">Hora</th>
                <th className="text-left py-2 px-2 font-semibold text-gray-500 uppercase text-[9px] tracking-wider">Evento</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(semanas).sort().map((sem) => (
                <>
                  {/* Label semana */}
                  <tr key={`sem-${sem}`} className="bg-gray-100">
                    <td colSpan={7} className="py-1.5 px-2 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      {ORDINAL[sem]} Semana
                    </td>
                  </tr>

                  {/* Dias desta semana */}
                  {Object.keys(semanas[sem]).sort().map((dataStr, di) => {
                    const slots = semanas[sem][dataStr]
                    const data = parseISO(dataStr)
                    const diaSemana = cap(format(data, 'EEEE', { locale: pt }))
                    const diaNum = format(data, 'dd')
                    const s1 = slots[0]
                    const s2 = slots[1]

                    return (
                      <tr
                        key={dataStr}
                        className={clsx(
                          'border-b border-gray-100',
                          di % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                        )}
                      >
                        <td className="py-2 px-2 text-gray-600">{diaSemana}</td>
                        <td className="py-2 px-1 text-center font-bold text-gray-900">{diaNum}</td>

                        {/* DJ principal */}
                        <td className="py-2 px-2 font-medium text-gray-900">
                          <DJComLinks
                            nome={s1?.dj_nome ?? null}
                            presskit={s1?.dj_presskit}
                            instagram={s1?.dj_instagram}
                          />
                        </td>
                        <td className="py-2 px-2 font-mono text-gray-600 whitespace-nowrap">
                          {s1 ? `${formatarHora(s1.hora_inicio)}–${formatarHora(s1.hora_fim)}` : ''}
                        </td>

                        {/* DJ extra */}
                        <td className="py-2 px-2 text-gray-700">
                          <DJComLinks
                            nome={s2?.dj_nome ?? null}
                            presskit={s2?.dj_presskit}
                            instagram={s2?.dj_instagram}
                          />
                        </td>
                        <td className="py-2 px-2 font-mono text-gray-600 whitespace-nowrap">
                          {s2 ? `${formatarHora(s2.hora_inicio)}–${formatarHora(s2.hora_fim)}` : ''}
                        </td>

                        {/* Evento */}
                        <td className="py-2 px-2 text-gray-500 text-[11px]">
                          {s1?.evento || s2?.evento || ''}
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>

        </div>
      ))}
    </div>
  )
}
